#!/usr/bin/env python3
"""P0-T0G exact Playwright real Windows Edge Stable channel gate."""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile
from typing import Any

import edge_probe
import preflight

TASK_ID = "P0-T0G"
PROFILE_SCHEMA = "P0-T0G-playwright-profile-v1"
RUNNER_SCHEMA = "P0-T0G-windows-runner-v1"
PLAYWRIGHT_VERSION = "1.62.0"
NODE_VERSION = "24.18.0"
PNPM_VERSION = "10.34.0"
REQUIRED_MODES = {"headed", "headless"}
RESULTS = {"pass", "fail", "blocked"}


class PlaywrightProbeError(ValueError):
    pass


def exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        raise PlaywrightProbeError(f"{label} keys mismatch")
    return value


def bounded_string(value: Any, label: str, *, nullable: bool = False, maximum: int = 256) -> str | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise PlaywrightProbeError(f"{label} must be a bounded string")
    return value


def validate_runner_result(value: dict[str, Any]) -> None:
    preflight._scan_for_secrets(value)
    exact_keys(value, {
        "schemaVersion", "result", "classification", "mode", "channel", "nodeVersion",
        "playwrightVersion", "browserVersion", "sentinelObserved", "sandboxBypassRemoved",
    }, "runner")
    if value["schemaVersion"] != RUNNER_SCHEMA or value["result"] not in RESULTS:
        raise PlaywrightProbeError("runner identity or result mismatch")
    if value["mode"] not in REQUIRED_MODES or value["channel"] != "msedge":
        raise PlaywrightProbeError("runner mode or channel mismatch")
    if value["nodeVersion"] != NODE_VERSION or value["playwrightVersion"] != PLAYWRIGHT_VERSION:
        raise PlaywrightProbeError("runner exact version mismatch")
    bounded_string(value["classification"], "runner.classification")
    bounded_string(value["browserVersion"], "runner.browserVersion", nullable=True, maximum=64)
    if not isinstance(value["sentinelObserved"], bool) or not isinstance(value["sandboxBypassRemoved"], bool):
        raise PlaywrightProbeError("runner booleans are malformed")
    if not value["sandboxBypassRemoved"]:
        raise PlaywrightProbeError("runner must remove sandbox bypass argument")
    if value["result"] == "pass" and (not value["sentinelObserved"] or value["browserVersion"] is None):
        raise PlaywrightProbeError("passing runner lacks browser and sentinel evidence")


def parse_runner_output(stdout: bytes | str) -> dict[str, Any]:
    text = edge_probe.decode_adapter_stdout(stdout)
    if len(text.encode("utf-8")) > 1_000_000:
        raise PlaywrightProbeError("runner output exceeds bound")
    lines = [line.strip().lstrip("\ufeff") for line in text.splitlines() if line.strip()]
    if len(lines) != 1:
        raise PlaywrightProbeError("runner must emit exactly one JSON line")
    try:
        value = json.loads(lines[0])
    except json.JSONDecodeError as error:
        raise PlaywrightProbeError("runner output is not JSON") from error
    validate_runner_result(value)
    return value


def derive_overall(profile: dict[str, Any]) -> str:
    results = [
        profile["discovery"]["interop"]["result"],
        profile["discovery"]["binary"]["result"],
        profile["discovery"]["policy"]["result"],
        profile["toolchain"]["result"],
        *[mode["result"] for mode in profile["modes"]],
        profile["cleanup"]["result"],
    ]
    result = preflight.derive_overall(results)
    return "blocked" if result == "partial" else result


def validate_profile(profile: dict[str, Any]) -> None:
    preflight._scan_for_secrets(profile)
    exact_keys(profile, {
        "schemaVersion", "taskId", "runId", "recordedAt", "toolchain", "discovery",
        "modes", "cleanup", "overall",
    }, "profile")
    if profile["schemaVersion"] != PROFILE_SCHEMA or profile["taskId"] != TASK_ID:
        raise PlaywrightProbeError("profile identity mismatch")
    if not isinstance(profile["runId"], str) or not preflight.RUN_ID_RE.fullmatch(profile["runId"]):
        raise PlaywrightProbeError("profile runId is invalid")
    recorded_at = bounded_string(profile["recordedAt"], "profile.recordedAt", maximum=64)
    if datetime.fromisoformat(recorded_at).utcoffset() is None:
        raise PlaywrightProbeError("profile recordedAt needs an offset")

    toolchain = exact_keys(profile["toolchain"], {
        "result", "nodeVersion", "playwrightVersion", "packageLicense", "channel",
        "portableNodeSha256", "officialChecksumVerified",
    }, "profile.toolchain")
    if toolchain["result"] not in RESULTS or toolchain["nodeVersion"] != NODE_VERSION:
        raise PlaywrightProbeError("toolchain Node result mismatch")
    if toolchain["playwrightVersion"] != PLAYWRIGHT_VERSION or toolchain["packageLicense"] != "Apache-2.0":
        raise PlaywrightProbeError("toolchain Playwright metadata mismatch")
    if toolchain["channel"] != "msedge" or not toolchain["officialChecksumVerified"]:
        raise PlaywrightProbeError("toolchain channel or official checksum mismatch")
    if not isinstance(toolchain["portableNodeSha256"], str) or not preflight.SHA256_RE.fullmatch(toolchain["portableNodeSha256"]):
        raise PlaywrightProbeError("portable Node digest is invalid")

    discovery = exact_keys(profile["discovery"], {"interop", "binary", "policy"}, "profile.discovery")
    adapter = edge_probe.failed_adapter("profile-validation", cleanup_result="pass")
    adapter["interop"] = discovery["interop"]
    adapter["binary"] = discovery["binary"]
    adapter["policy"] = discovery["policy"]
    adapter["overall"] = edge_probe.derive_adapter_overall(adapter)
    edge_probe.validate_adapter(adapter)

    if not isinstance(profile["modes"], list) or len(profile["modes"]) != 2:
        raise PlaywrightProbeError("profile needs exactly two modes")
    seen = set()
    for mode in profile["modes"]:
        validate_runner_result(mode)
        if mode["mode"] in seen:
            raise PlaywrightProbeError("duplicate Playwright mode")
        seen.add(mode["mode"])
        if mode["result"] == "pass" and mode["browserVersion"] != discovery["binary"]["productVersion"]:
            raise PlaywrightProbeError("Playwright browser version differs from discovered Edge")
    if seen != REQUIRED_MODES:
        raise PlaywrightProbeError("headed and headless modes are both required")

    cleanup = exact_keys(profile["cleanup"], {
        "result", "classification", "residualBeforeCleanup", "residualAfterCleanup",
        "profilesRemoved", "stagingRemoved",
    }, "profile.cleanup")
    if cleanup["result"] not in RESULTS:
        raise PlaywrightProbeError("cleanup result mismatch")
    bounded_string(cleanup["classification"], "profile.cleanup.classification")
    for name in ["residualBeforeCleanup", "residualAfterCleanup"]:
        if not isinstance(cleanup[name], int) or isinstance(cleanup[name], bool) or not 0 <= cleanup[name] <= 1000:
            raise PlaywrightProbeError("cleanup count is invalid")
    if cleanup["result"] == "pass" and (
        cleanup["residualAfterCleanup"] != 0 or not cleanup["profilesRemoved"] or not cleanup["stagingRemoved"]
    ):
        raise PlaywrightProbeError("passing cleanup has residue")
    if profile["overall"] not in RESULTS or profile["overall"] != derive_overall(profile):
        raise PlaywrightProbeError("profile overall is not machine-derived")


def make_command(identifier: str, argv: list[str], result: str, classification: str, exit_code: int | None) -> dict[str, Any]:
    return {
        "id": identifier,
        "argv": argv,
        "exitCode": exit_code,
        "result": result,
        "stdoutSummary": classification,
        "stderrSummary": None,
    }


def run_mode(node_exe: Path, windows_runner: str, windows_profile: str, mode: str, timeout: int) -> tuple[dict[str, Any], dict[str, Any]]:
    argv = [str(node_exe), windows_runner, mode, windows_profile]
    try:
        completed = subprocess.run(argv, check=False, capture_output=True, text=False, timeout=timeout)
    except subprocess.TimeoutExpired:
        result = {
            "schemaVersion": RUNNER_SCHEMA, "result": "blocked", "classification": "runner-timeout",
            "mode": mode, "channel": "msedge", "nodeVersion": NODE_VERSION,
            "playwrightVersion": PLAYWRIGHT_VERSION, "browserVersion": None,
            "sentinelObserved": False, "sandboxBypassRemoved": True,
        }
        return result, make_command(f"playwright-msedge-{mode}", ["node.exe", "<runner>", mode, "<task-profile>"], "blocked", "runner-timeout", None)
    try:
        result = parse_runner_output(completed.stdout)
    except PlaywrightProbeError:
        result = {
            "schemaVersion": RUNNER_SCHEMA, "result": "blocked", "classification": "runner-output-invalid",
            "mode": mode, "channel": "msedge", "nodeVersion": NODE_VERSION,
            "playwrightVersion": PLAYWRIGHT_VERSION, "browserVersion": None,
            "sentinelObserved": False, "sandboxBypassRemoved": True,
        }
    command = make_command(
        f"playwright-msedge-{mode}", ["node.exe", "<runner>", mode, "<task-profile>"],
        result["result"], result["classification"], completed.returncode,
    )
    return result, command


def convert_path(root: Path, path: Path) -> str:
    completed = subprocess.run(["wslpath", "-w", str(path)], cwd=root, check=False, capture_output=True, text=True, timeout=10)
    if completed.returncode != 0 or not completed.stdout.strip():
        raise PlaywrightProbeError("Windows path conversion failed")
    return completed.stdout.strip()


def artifact(root: Path, relative: str) -> dict[str, str]:
    return {"path": relative, "sha256": hashlib.sha256((root / relative).read_bytes()).hexdigest()}


def run_probe(root: Path, run_id: str, node_dir: Path, node_zip_sha256: str, official_checksum_verified: bool, timeout: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    node_exe = node_dir / "node.exe"
    playwright_core = (root / "node_modules/.pnpm/node_modules/playwright-core").resolve()
    package_metadata = json.loads((playwright_core / "package.json").read_text(encoding="utf-8"))
    commands: list[dict[str, Any]] = []
    try:
        node_version_run = subprocess.run([str(node_exe), "--version"], check=False, capture_output=True, text=True, timeout=10)
        observed_node = node_version_run.stdout.strip().removeprefix("v")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        observed_node = "unavailable"
        node_version_run = None
    toolchain_result = "pass" if (
        observed_node == NODE_VERSION and package_metadata.get("version") == PLAYWRIGHT_VERSION
        and package_metadata.get("license") == "Apache-2.0" and official_checksum_verified
    ) else "blocked"
    commands.append(make_command("windows-portable-node-version", ["node.exe", "--version"], toolchain_result, f"node-{observed_node}", None if node_version_run is None else node_version_run.returncode))

    discovered = subprocess.run(
        ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", edge_probe.WINDOWS_DISCOVERY_COMMAND],
        cwd=root, check=False, capture_output=True, text=False, timeout=15,
    )
    parsed = edge_probe.parse_discovery(discovered.stdout)
    adapter = parsed["adapter"]
    commands.append(edge_probe.discovery_command("pass", "bounded-discovery-produced-classified-result", discovered.returncode))
    windows_temp = subprocess.run(["wslpath", "-u", parsed["windowsTemp"]], cwd=root, check=False, capture_output=True, text=True, timeout=10)
    temp_base = Path(windows_temp.stdout.strip()).resolve()
    if windows_temp.returncode != 0 or not edge_probe.windows_temp_base_allowed(temp_base):
        raise PlaywrightProbeError("Windows temporary root is unavailable")

    stage = Path(tempfile.mkdtemp(prefix="vem-edge-preflight-playwright-", dir=temp_base))
    marker = stage.name
    modes = []
    profiles_removed = True
    cleanup_counts = {"before": 0, "after": 0}
    try:
        shutil.copy2(root / "scripts/preflight/playwright_windows_runner.mjs", stage / "runner.mjs")
        (stage / "node_modules").mkdir()
        shutil.copytree(playwright_core, stage / "node_modules/playwright-core")
        windows_runner = convert_path(root, stage / "runner.mjs")
        for mode in ["headless", "headed"]:
            profile = stage / f"vem-playwright-preflight-{mode}"
            profile.mkdir()
            result, command = run_mode(node_exe, windows_runner, convert_path(root, profile), mode, timeout)
            modes.append(result)
            commands.append(command)
        cleanup, cleanup_command = edge_probe.cleanup_owned_edge(marker, root)
        commands.append(cleanup_command)
        cleanup_counts = {"before": cleanup["residualBeforeCleanup"], "after": cleanup["residualAfterCleanup"]}
    finally:
        for mode in REQUIRED_MODES:
            profile = stage / f"vem-playwright-preflight-{mode}"
            if profile.exists():
                shutil.rmtree(profile, ignore_errors=False)
            profiles_removed = profiles_removed and not profile.exists()
        shutil.rmtree(stage, ignore_errors=False)

    cleanup_result = "pass" if cleanup_counts["after"] == 0 and profiles_removed and not stage.exists() else "fail"
    profile = {
        "schemaVersion": PROFILE_SCHEMA,
        "taskId": TASK_ID,
        "runId": run_id,
        "recordedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "toolchain": {
            "result": toolchain_result,
            "nodeVersion": observed_node,
            "playwrightVersion": package_metadata.get("version"),
            "packageLicense": package_metadata.get("license"),
            "channel": "msedge",
            "portableNodeSha256": node_zip_sha256,
            "officialChecksumVerified": official_checksum_verified,
        },
        "discovery": {name: adapter[name] for name in ["interop", "binary", "policy"]},
        "modes": modes,
        "cleanup": {
            "result": cleanup_result,
            "classification": "clean-exit" if cleanup_result == "pass" else "cleanup-residue",
            "residualBeforeCleanup": cleanup_counts["before"],
            "residualAfterCleanup": cleanup_counts["after"],
            "profilesRemoved": profiles_removed,
            "stagingRemoved": not stage.exists(),
        },
        "overall": "blocked",
    }
    profile["overall"] = derive_overall(profile)
    validate_profile(profile)
    return profile, commands


def build_environment(root: Path, run_id: str, profile: dict[str, Any], commands: list[dict[str, Any]], details_relative: str) -> dict[str, Any]:
    filesystem = subprocess.run(["findmnt", "-T", str(root), "-o", "FSTYPE", "-n"], check=True, capture_output=True, text=True, timeout=10).stdout.strip()
    pnpm_version = subprocess.run(["corepack", "pnpm", "--version"], check=True, capture_output=True, text=True, timeout=30).stdout.strip()
    checks = [
        {"id": "playwright-exact-version", "result": profile["toolchain"]["result"], "classification": f"Playwright {PLAYWRIGHT_VERSION} and Windows portable Node {NODE_VERSION} are exact and checksum-verified.", "evidenceRefs": [f"artifact:{details_relative}", "package:pnpm-lock.yaml"]},
        {"id": "edge-stable-msedge-channel", "result": "pass" if profile["discovery"]["binary"]["result"] == "pass" and all(mode["channel"] == "msedge" for mode in profile["modes"]) else "fail", "classification": "The system Edge Stable binary is resolved by the msedge launch profile; no bundled Chromium is accepted.", "evidenceRefs": [f"artifact:{details_relative}"]},
        {"id": "enterprise-policy-classification", "result": profile["discovery"]["policy"]["result"], "classification": profile["discovery"]["policy"]["classification"], "evidenceRefs": [f"artifact:{details_relative}"]},
        {"id": "playwright-headless", "result": next(mode["result"] for mode in profile["modes"] if mode["mode"] == "headless"), "classification": "Real Edge headless mode returned the bounded sentinel through Playwright.", "evidenceRefs": [f"artifact:{details_relative}"]},
        {"id": "playwright-headed", "result": next(mode["result"] for mode in profile["modes"] if mode["mode"] == "headed"), "classification": "Real Edge headed mode returned the bounded sentinel through Playwright.", "evidenceRefs": [f"artifact:{details_relative}"]},
        {"id": "playwright-profile-process-cleanup", "result": profile["cleanup"]["result"], "classification": profile["cleanup"]["classification"], "evidenceRefs": [f"artifact:{details_relative}"]},
    ]
    evidence = {
        "schemaVersion": preflight.SCHEMA_VERSION,
        "taskId": TASK_ID,
        "runId": run_id,
        "recordedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "contractIds": [preflight.CONTRACT_ID],
        "executionProfile": {
            "name": "WSL ext4 project with checksum-verified task-local Windows Node Playwright runner and Windows Edge Stable",
            "canonicalGitRoot": str(root),
            "projectRoot": ".",
            "filesystemType": filesystem,
            "runnerOwner": pwd.getpwuid(os.geteuid()).pw_name,
            "tier1BrowserOwner": "Windows Edge Stable through Playwright channel msedge",
        },
        "commands": commands,
        "tools": {
            "node": {"exactVersion": NODE_VERSION, "observedVersion": profile["toolchain"]["nodeVersion"], "versionCommand": ["node.exe", "--version"], "selectionSource": f"https://nodejs.org/dist/v{NODE_VERSION}/SHASUMS256.txt", "result": "pass" if profile["toolchain"]["nodeVersion"] == NODE_VERSION else "fail"},
            "pnpm": {"exactVersion": PNPM_VERSION, "observedVersion": pnpm_version, "versionCommand": ["corepack", "pnpm", "--version"], "activationCommand": ["corepack", "prepare", f"pnpm@{PNPM_VERSION}", "--activate"], "selectionSource": "docs/adr/0001-edge-execution-preflight.md", "result": "pass" if pnpm_version == PNPM_VERSION else "fail"},
        },
        "checks": checks,
        "artifacts": [
            artifact(root, "scripts/preflight/evidence.schema.json"),
            artifact(root, "scripts/preflight/preflight.py"),
            artifact(root, "scripts/preflight/playwright_probe.py"),
            artifact(root, "scripts/preflight/playwright_windows_runner.mjs"),
            artifact(root, "docs/adr/0003-playwright-msedge-channel-gate.md"),
            artifact(root, "package.json"),
            artifact(root, "pnpm-lock.yaml"),
            artifact(root, details_relative),
        ],
        "overall": preflight.derive_overall([check["result"] for check in checks]),
    }
    preflight.validate_evidence(evidence)
    preflight.verify_artifacts(evidence, root)
    return evidence


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary, path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--windows-node-dir", required=True, type=Path)
    parser.add_argument("--node-zip-sha256", required=True)
    parser.add_argument("--official-checksum-verified", action="store_true")
    parser.add_argument("--details", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timeout-seconds", type=int, default=45)
    args = parser.parse_args(argv)
    root = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True).stdout.strip()).resolve()
    try:
        profile, commands = run_probe(root, args.run_id, args.windows_node_dir.resolve(), args.node_zip_sha256, args.official_checksum_verified, args.timeout_seconds)
        details_relative = args.details.resolve().relative_to(root).as_posix()
        write_json(args.details, profile)
        environment = build_environment(root, args.run_id, profile, commands, details_relative)
        write_json(args.output, environment)
        print(f"P0_T0G_PLAYWRIGHT={environment['overall']}")
        return 0 if environment["overall"] == "pass" else 2
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"P0_T0G_ERROR={type(error).__name__}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
