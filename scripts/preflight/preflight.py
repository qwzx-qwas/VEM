#!/usr/bin/env python3
"""Dependency-free P0 preflight evidence probe and validator.

This module deliberately avoids package-manager and network access so it can run
before the TypeScript workspace exists. It stores bounded command summaries, not
an environment dump or raw logs.
"""

from __future__ import annotations

import argparse
import pwd
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from datetime import datetime
from typing import Any, Iterable

SCHEMA_VERSION = "1.0.0"
TOOLCHAIN_TASK_ID = "P0-T0A2"
ALLOWED_TASK_IDS = {"P0-T0A2", "P0-T0B", "P0-T0C", "P0-T0D", "P0-T0E", "P0-T0F", "P0-T0G"}
CONTRACT_ID = "EDGE-PREFLIGHT-001"
RESULTS = {"pass", "fail", "blocked", "not-run"}
OVERALL_RESULTS = {"pass", "fail", "blocked", "partial"}
TOOL_RESULTS = {"pass", "selected", "fail", "blocked"}
SEMVER_RE = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RUN_ID_RE = re.compile(r"^[0-9]{8}T[0-9]{6}[+-][0-9]{4}$")
SECRET_KEY_RE = re.compile(
    r"authorization|cookie|password|passwd|secret|token|private[_-]?key|client[_-]?secret",
    re.IGNORECASE,
)
SECRET_VALUE_RES = (
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?:_authToken|password|passwd|client_secret)\s*=", re.IGNORECASE),
    re.compile(r"^[a-z][a-z0-9+.-]*://[^/@\s]+:[^/@\s]+@", re.IGNORECASE),
)


class EvidenceError(ValueError):
    """Raised when evidence is structurally invalid or unsafe to persist."""


def _object_without_duplicate_keys(pairs: Iterable[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise EvidenceError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json(path: Path) -> dict[str, Any]:
    if path.stat().st_size > 1_000_000:
        raise EvidenceError("evidence exceeds 1,000,000 bytes")
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle, object_pairs_hook=_object_without_duplicate_keys)
    if not isinstance(value, dict):
        raise EvidenceError("top-level JSON value must be an object")
    return value


def _exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise EvidenceError(f"{label} keys mismatch; missing={missing}, extra={extra}")


def _bounded_string(value: Any, label: str, *, maximum: int = 512) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise EvidenceError(f"{label} must be a non-empty string of at most {maximum} characters")
    return value


def _string_or_null(value: Any, label: str, *, maximum: int = 512) -> str | None:
    if value is None:
        return None
    return _bounded_string(value, label, maximum=maximum)


def _scan_for_secrets(value: Any, path: str = "$", depth: int = 0) -> None:
    if depth > 12:
        raise EvidenceError("evidence nesting exceeds depth 12")
    if isinstance(value, dict):
        if len(value) > 256:
            raise EvidenceError(f"{path} has too many object members")
        for key, child in value.items():
            if SECRET_KEY_RE.search(key):
                raise EvidenceError(f"secret-bearing key is forbidden at {path}.{key}")
            _scan_for_secrets(child, f"{path}.{key}", depth + 1)
    elif isinstance(value, list):
        if len(value) > 512:
            raise EvidenceError(f"{path} has too many array items")
        for index, child in enumerate(value):
            _scan_for_secrets(child, f"{path}[{index}]", depth + 1)
    elif isinstance(value, str):
        if len(value) > 4096:
            raise EvidenceError(f"string at {path} exceeds 4096 characters")
        for pattern in SECRET_VALUE_RES:
            if pattern.search(value):
                raise EvidenceError(f"secret-like value is forbidden at {path}")


def _validate_semver(value: Any, label: str) -> tuple[int, int, int]:
    text = _bounded_string(value, label, maximum=32)
    match = SEMVER_RE.fullmatch(text)
    if not match:
        raise EvidenceError(f"{label} must be an exact x.y.z version without a range or v prefix")
    return tuple(int(part) for part in match.groups())


def _validate_argv(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not (1 <= len(value) <= 32):
        raise EvidenceError(f"{label} must contain 1..32 argv items")
    result = []
    for index, item in enumerate(value):
        result.append(_bounded_string(item, f"{label}[{index}]", maximum=256))
    return result


def _validate_profile(profile: Any) -> None:
    if not isinstance(profile, dict):
        raise EvidenceError("executionProfile must be an object")
    _exact_keys(
        profile,
        {"name", "canonicalGitRoot", "projectRoot", "filesystemType", "runnerOwner", "tier1BrowserOwner"},
        "executionProfile",
    )
    _bounded_string(profile["name"], "executionProfile.name")
    root = _bounded_string(profile["canonicalGitRoot"], "executionProfile.canonicalGitRoot", maximum=1024)
    if not root.startswith("/"):
        raise EvidenceError("canonicalGitRoot must be an absolute local owner-profile path")
    if profile["projectRoot"] != ".":
        raise EvidenceError("projectRoot must be canonical-root-relative '.'")
    _bounded_string(profile["filesystemType"], "executionProfile.filesystemType", maximum=32)
    _bounded_string(profile["runnerOwner"], "executionProfile.runnerOwner", maximum=128)
    _bounded_string(profile["tier1BrowserOwner"], "executionProfile.tier1BrowserOwner", maximum=256)


def _validate_commands(commands: Any) -> None:
    if not isinstance(commands, list) or not (1 <= len(commands) <= 64):
        raise EvidenceError("commands must contain 1..64 entries")
    seen: set[str] = set()
    for index, command in enumerate(commands):
        if not isinstance(command, dict):
            raise EvidenceError(f"commands[{index}] must be an object")
        _exact_keys(command, {"id", "argv", "exitCode", "result", "stdoutSummary", "stderrSummary"}, f"commands[{index}]")
        command_id = _bounded_string(command["id"], f"commands[{index}].id", maximum=96)
        if command_id in seen:
            raise EvidenceError(f"duplicate command id: {command_id}")
        seen.add(command_id)
        _validate_argv(command["argv"], f"commands[{index}].argv")
        if command["exitCode"] is not None and (not isinstance(command["exitCode"], int) or isinstance(command["exitCode"], bool)):
            raise EvidenceError(f"commands[{index}].exitCode must be an integer or null")
        if command["result"] not in RESULTS:
            raise EvidenceError(f"commands[{index}].result is unknown")
        _string_or_null(command["stdoutSummary"], f"commands[{index}].stdoutSummary", maximum=1024)
        _string_or_null(command["stderrSummary"], f"commands[{index}].stderrSummary", maximum=1024)


def _validate_tool(name: str, tool: Any) -> tuple[int, int, int]:
    if not isinstance(tool, dict):
        raise EvidenceError(f"tools.{name} must be an object")
    expected = {"exactVersion", "observedVersion", "versionCommand", "selectionSource", "result"}
    if name == "pnpm":
        expected.add("activationCommand")
    _exact_keys(tool, expected, f"tools.{name}")
    version = _validate_semver(tool["exactVersion"], f"tools.{name}.exactVersion")
    observed = _string_or_null(tool["observedVersion"], f"tools.{name}.observedVersion", maximum=32)
    if observed is not None:
        observed_version = _validate_semver(observed, f"tools.{name}.observedVersion")
        if tool["result"] == "pass" and observed_version != version:
            raise EvidenceError(f"tools.{name}.observedVersion does not match exactVersion")
    _validate_argv(tool["versionCommand"], f"tools.{name}.versionCommand")
    _bounded_string(tool["selectionSource"], f"tools.{name}.selectionSource", maximum=1024)
    if tool["result"] not in TOOL_RESULTS:
        raise EvidenceError(f"tools.{name}.result is unknown")
    if tool["result"] == "pass" and observed is None:
        raise EvidenceError(f"tools.{name}.observedVersion is required for pass")
    if name == "pnpm":
        activation = _validate_argv(tool["activationCommand"], "tools.pnpm.activationCommand")
        if f"pnpm@{tool['exactVersion']}" not in activation:
            raise EvidenceError("pnpm activationCommand must embed the exact selected version")
    return version


def _validate_checks(checks: Any) -> list[str]:
    if not isinstance(checks, list) or not (1 <= len(checks) <= 128):
        raise EvidenceError("checks must contain 1..128 entries")
    seen: set[str] = set()
    results: list[str] = []
    for index, check in enumerate(checks):
        if not isinstance(check, dict):
            raise EvidenceError(f"checks[{index}] must be an object")
        _exact_keys(check, {"id", "result", "classification", "evidenceRefs"}, f"checks[{index}]")
        check_id = _bounded_string(check["id"], f"checks[{index}].id", maximum=128)
        if check_id in seen:
            raise EvidenceError(f"duplicate check id: {check_id}")
        seen.add(check_id)
        if check["result"] not in RESULTS:
            raise EvidenceError(f"checks[{index}].result is unknown")
        results.append(check["result"])
        _bounded_string(check["classification"], f"checks[{index}].classification", maximum=512)
        refs = check["evidenceRefs"]
        if not isinstance(refs, list) or len(refs) > 32:
            raise EvidenceError(f"checks[{index}].evidenceRefs must be a bounded array")
        for ref_index, ref in enumerate(refs):
            _bounded_string(ref, f"checks[{index}].evidenceRefs[{ref_index}]", maximum=256)
    return results


def _validate_artifacts(artifacts: Any) -> None:
    if not isinstance(artifacts, list) or len(artifacts) > 256:
        raise EvidenceError("artifacts must be a bounded array")
    seen: set[str] = set()
    for index, artifact in enumerate(artifacts):
        if not isinstance(artifact, dict):
            raise EvidenceError(f"artifacts[{index}] must be an object")
        _exact_keys(artifact, {"path", "sha256"}, f"artifacts[{index}]")
        path = _bounded_string(artifact["path"], f"artifacts[{index}].path", maximum=512)
        pure = PurePosixPath(path)
        if pure.is_absolute() or ".." in pure.parts or path in {"", "."}:
            raise EvidenceError(f"artifact path must be canonical-root-relative: {path}")
        if path in seen:
            raise EvidenceError(f"duplicate artifact path: {path}")
        seen.add(path)
        if not isinstance(artifact["sha256"], str) or not SHA256_RE.fullmatch(artifact["sha256"]):
            raise EvidenceError(f"artifacts[{index}].sha256 must be lowercase SHA-256")


def derive_overall(results: list[str]) -> str:
    if "fail" in results:
        return "fail"
    if "blocked" in results:
        return "blocked"
    if "not-run" in results:
        return "partial"
    return "pass"


def validate_evidence(evidence: dict[str, Any]) -> None:
    _scan_for_secrets(evidence)
    _exact_keys(
        evidence,
        {"schemaVersion", "taskId", "runId", "recordedAt", "contractIds", "executionProfile", "commands", "tools", "checks", "artifacts", "overall"},
        "evidence",
    )
    if evidence["schemaVersion"] != SCHEMA_VERSION:
        raise EvidenceError(f"schemaVersion must be {SCHEMA_VERSION}")
    if evidence["taskId"] not in ALLOWED_TASK_IDS:
        raise EvidenceError(f"taskId must be one of {sorted(ALLOWED_TASK_IDS)}")
    if not isinstance(evidence["runId"], str) or not RUN_ID_RE.fullmatch(evidence["runId"]):
        raise EvidenceError("runId must use YYYYMMDDTHHMMSS+HHMM")
    recorded_at = _bounded_string(evidence["recordedAt"], "recordedAt", maximum=64)
    try:
        parsed_recorded_at = datetime.fromisoformat(recorded_at)
    except ValueError as exc:
        raise EvidenceError("recordedAt must be an ISO-8601 timestamp with an offset") from exc
    if parsed_recorded_at.utcoffset() is None:
        raise EvidenceError("recordedAt must include an explicit UTC offset")
    if not isinstance(evidence["contractIds"], list) or evidence["contractIds"] != [CONTRACT_ID]:
        raise EvidenceError(f"contractIds must be exactly [{CONTRACT_ID!r}]")
    _validate_profile(evidence["executionProfile"])
    _validate_commands(evidence["commands"])
    if not isinstance(evidence["tools"], dict):
        raise EvidenceError("tools must be an object")
    _exact_keys(evidence["tools"], {"node", "pnpm"}, "tools")
    node_version = _validate_tool("node", evidence["tools"]["node"])
    _validate_tool("pnpm", evidence["tools"]["pnpm"])
    if node_version[0] != 24:
        raise EvidenceError("the selected Node baseline must be exact 24.x for P0-T0A2")
    results = _validate_checks(evidence["checks"])
    _validate_artifacts(evidence["artifacts"])
    if evidence["overall"] not in OVERALL_RESULTS:
        raise EvidenceError("overall result is unknown")
    derived = derive_overall(results)
    if evidence["overall"] != derived:
        raise EvidenceError(f"overall={evidence['overall']} does not match machine-derived {derived}")


def verify_artifacts(evidence: dict[str, Any], root: Path) -> None:
    for artifact in evidence["artifacts"]:
        path = (root / artifact["path"]).resolve()
        try:
            path.relative_to(root.resolve())
        except ValueError as exc:
            raise EvidenceError(f"artifact escapes canonical root: {artifact['path']}") from exc
        if not path.is_file():
            raise EvidenceError(f"artifact is missing: {artifact['path']}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != artifact["sha256"]:
            raise EvidenceError(f"artifact hash mismatch: {artifact['path']}")


def _run(argv: list[str]) -> tuple[dict[str, Any], str]:
    try:
        completed = subprocess.run(argv, check=False, capture_output=True, text=True, timeout=10)
        stdout = completed.stdout.strip()[:1024] or None
        stderr = completed.stderr.strip()[:1024] or None
        result = "pass" if completed.returncode == 0 else "fail"
        return {
            "id": argv[0].replace("/", "-") + "-probe",
            "argv": argv,
            "exitCode": completed.returncode,
            "result": result,
            "stdoutSummary": stdout,
            "stderrSummary": stderr,
        }, stdout or ""
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return {
            "id": argv[0].replace("/", "-") + "-probe",
            "argv": argv,
            "exitCode": None,
            "result": "blocked",
            "stdoutSummary": None,
            "stderrSummary": type(exc).__name__,
        }, ""


def _artifact(root: Path, relative: str) -> dict[str, str]:
    path = root / relative
    return {"path": relative, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def probe_toolchain(args: argparse.Namespace) -> dict[str, Any]:
    node_version = _validate_semver(args.node_version, "--node-version")
    _validate_semver(args.pnpm_version, "--pnpm-version")
    if node_version[0] != 24:
        raise EvidenceError("--node-version must select exact 24.x")

    git_command, root_text = _run(["git", "rev-parse", "--show-toplevel"])
    root = Path(root_text).resolve() if root_text else Path.cwd().resolve()
    node_command, observed_node = _run(["node", "--version"])
    corepack_command, observed_corepack = _run(["corepack", "--version"])
    filesystem_command, filesystem = _run(["findmnt", "-T", str(root), "-o", "FSTYPE", "-n"])
    commands = [git_command, node_command, corepack_command, filesystem_command]
    observed_node = observed_node.removeprefix("v") or None
    observed_corepack = observed_corepack.removeprefix("v") or "unavailable"
    filesystem = filesystem.splitlines()[0].strip() if filesystem else "unknown"

    checks = [
        {
            "id": "canonical-git-root",
            "result": "pass" if git_command["result"] == "pass" and root == Path.cwd().resolve() else "fail",
            "classification": "Git top-level equals the execution directory; all stored artifact paths are root-relative.",
            "evidenceRefs": ["commands:git-probe"],
        },
        {
            "id": "canonical-ext4-profile",
            "result": "pass" if filesystem == "ext4" else "fail",
            "classification": f"Canonical project filesystem classified as {filesystem}.",
            "evidenceRefs": ["commands:findmnt-probe"],
        },
        {
            "id": "node-24-lts-exact",
            "result": "pass" if node_command["result"] == "pass" and observed_node == args.node_version else "fail",
            "classification": f"Selected and observed Node version must both equal {args.node_version}.",
            "evidenceRefs": ["tools:node", "commands:node-probe"],
        },
        {
            "id": "pnpm-exact-selection",
            "result": "pass",
            "classification": f"pnpm {args.pnpm_version} is selected exactly; activation/network execution is deferred to P0-T0B.",
            "evidenceRefs": ["tools:pnpm"],
        },
        {
            "id": "corepack-bootstrap-mechanism",
            "result": "pass" if corepack_command["result"] == "pass" else "blocked",
            "classification": f"Corepack {observed_corepack} can express an exact pnpm activation command without running it here.",
            "evidenceRefs": ["commands:corepack-probe", "tools:pnpm"],
        },
        {
            "id": "secret-redaction",
            "result": "pass",
            "classification": "Only bounded version/path/classification summaries are emitted; no environment dump or raw registry configuration is read.",
            "evidenceRefs": ["schema:scripts/preflight/evidence.schema.json"],
        },
    ]

    evidence = {
        "schemaVersion": SCHEMA_VERSION,
        "taskId": TOOLCHAIN_TASK_ID,
        "runId": args.run_id,
        "recordedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "contractIds": [CONTRACT_ID],
        "executionProfile": {
            "name": "WSL Node/Vite/MCP on ext4 with Windows Edge Stable deferred to later gates",
            "canonicalGitRoot": str(root),
            "projectRoot": ".",
            "filesystemType": filesystem,
            "runnerOwner": pwd.getpwuid(os.geteuid()).pw_name,
            "tier1BrowserOwner": "Windows Edge Stable; launch evidence deferred to P0-T0C and P0-T0G",
        },
        "commands": commands,
        "tools": {
            "node": {
                "exactVersion": args.node_version,
                "observedVersion": observed_node,
                "versionCommand": ["node", "--version"],
                "selectionSource": f"https://nodejs.org/en/blog/release/v{args.node_version}",
                "result": "pass" if observed_node == args.node_version else "fail",
            },
            "pnpm": {
                "exactVersion": args.pnpm_version,
                "observedVersion": None,
                "versionCommand": ["pnpm", "--version"],
                "activationCommand": ["corepack", "prepare", f"pnpm@{args.pnpm_version}", "--activate"],
                "selectionSource": f"https://github.com/pnpm/pnpm/releases/tag/v{args.pnpm_version}",
                "result": "selected",
            },
        },
        "checks": checks,
        "artifacts": [
            _artifact(root, "scripts/preflight/evidence.schema.json"),
            _artifact(root, "scripts/preflight/preflight.py"),
            _artifact(root, "docs/adr/0001-edge-execution-preflight.md"),
        ],
        "overall": derive_overall([check["result"] for check in checks]),
    }
    validate_evidence(evidence)
    return evidence


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary, path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="validate bounded preflight evidence")
    validate_parser.add_argument("--input", required=True, type=Path)
    validate_parser.add_argument("--root", type=Path)

    probe_parser = subparsers.add_parser("probe-toolchain", help="probe local versions without network/package installation")
    probe_parser.add_argument("--node-version", required=True)
    probe_parser.add_argument("--pnpm-version", required=True)
    probe_parser.add_argument("--run-id", required=True)
    probe_parser.add_argument("--output", required=True, type=Path)

    args = parser.parse_args(argv)
    try:
        if args.command == "validate":
            evidence = load_json(args.input)
            validate_evidence(evidence)
            if args.root:
                verify_artifacts(evidence, args.root.resolve())
            print("PREFLIGHT_EVIDENCE_VALID=1")
        else:
            evidence = probe_toolchain(args)
            _write_json(args.output, evidence)
            print(f"PREFLIGHT_TOOLCHAIN_RESULT={evidence['overall']}")
        return 0
    except (EvidenceError, OSError) as exc:
        print(f"PREFLIGHT_EVIDENCE_ERROR={exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
