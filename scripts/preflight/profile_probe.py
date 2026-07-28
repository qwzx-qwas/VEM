#!/usr/bin/env python3
"""P0-T0B package/network/filesystem profile probe.

The probe uses only bounded summaries, temporary same-filesystem fixtures, the
owner-accepted exact toolchain, and Node's native fs.watch provider. It never
persists proxy/registry credentials or changes global network configuration.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import ssl
import statistics
import subprocess
import sys
import tempfile
from datetime import datetime
from typing import Any
import urllib.error
import urllib.request

import preflight

TASK_ID = "P0-T0B"
NODE_VERSION = "24.18.0"
PNPM_VERSION = "10.34.0"
REGISTRY_URL = f"https://registry.npmjs.org/pnpm/{PNPM_VERSION}"
DEPENDENCY_NAME = "is-number"
DEPENDENCY_VERSION = "7.0.0"
PROFILE_SCHEMA = "P0-T0B-profile-v1"
MAX_REGISTRY_BYTES = 1_000_000


class ProfileError(RuntimeError):
    pass


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        raise ProfileError("percentile requires at least one value")
    if not 0 < fraction <= 1:
        raise ProfileError("percentile fraction must be in (0, 1]")
    ordered = sorted(values)
    rank = max(0, int((fraction * len(ordered) + 0.999999999)) - 1)
    return round(ordered[rank], 3)


def proxy_profile(proxies: dict[str, str] | None = None) -> dict[str, bool]:
    configured = urllib.request.getproxies() if proxies is None else proxies
    return {
        "httpConfigured": bool(configured.get("http")),
        "httpsConfigured": bool(configured.get("https")),
        "noProxyConfigured": bool(configured.get("no")),
    }


def classify_network_error(error: BaseException) -> str:
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    text = f"{type(reason).__name__}:{reason}".lower()
    if isinstance(error, urllib.error.HTTPError):
        return f"http-{error.code}"
    if isinstance(reason, socket.gaierror) or "name or service not known" in text or "temporary failure in name resolution" in text:
        return "dns"
    if isinstance(reason, ssl.SSLError) or "certificate verify" in text or "tls" in text or "ssl" in text:
        return "tls-ca"
    if "proxy" in text or "tunnel connection failed" in text:
        return "proxy"
    if isinstance(reason, (TimeoutError, socket.timeout)) or "timed out" in text:
        return "timeout"
    if "connection refused" in text or "network is unreachable" in text:
        return "network"
    return "unknown-network"


def classify_process_failure(stderr: str, timed_out: bool = False) -> str:
    if timed_out:
        return "timeout"
    lowered = stderr.lower()
    if "getaddrinfo" in lowered or "enotfound" in lowered or "eai_again" in lowered:
        return "dns"
    if "certificate" in lowered or "self signed" in lowered or "unable to verify" in lowered:
        return "tls-ca"
    if "proxy" in lowered or "tunnel" in lowered:
        return "proxy"
    if "integrity" in lowered or "checksum" in lowered:
        return "integrity"
    if "frozen" in lowered or "lockfile" in lowered:
        return "frozen-lockfile"
    return "process"


def run_command(
    argv: list[str],
    *,
    cwd: Path,
    timeout: int,
    extra_env: dict[str, str] | None = None,
) -> dict[str, Any]:
    environment = os.environ.copy()
    environment.update({"CI": "1", "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0"})
    if extra_env:
        environment.update(extra_env)
    try:
        completed = subprocess.run(
            argv,
            cwd=cwd,
            env=environment,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "argv": argv,
            "exitCode": completed.returncode,
            "result": "pass" if completed.returncode == 0 else "fail",
            "classification": "pass" if completed.returncode == 0 else classify_process_failure(completed.stderr),
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except subprocess.TimeoutExpired as error:
        stderr = (error.stderr or "") if isinstance(error.stderr, str) else ""
        return {
            "argv": argv,
            "exitCode": None,
            "result": "blocked",
            "classification": classify_process_failure(stderr, timed_out=True),
            "stdout": "",
            "stderr": "timeout",
        }


def probe_registry() -> dict[str, Any]:
    context = ssl.create_default_context()
    defaults = ssl.get_default_verify_paths()
    request = urllib.request.Request(
        REGISTRY_URL,
        headers={"Accept": "application/json", "User-Agent": "visual-element-mcp-preflight/1"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20, context=context) as response:
            body = response.read(MAX_REGISTRY_BYTES + 1)
            if len(body) > MAX_REGISTRY_BYTES:
                raise ProfileError("registry response exceeded byte limit")
            payload = json.loads(body)
            observed_version = payload.get("version")
            if observed_version != PNPM_VERSION:
                raise ProfileError(f"registry returned unexpected pnpm version {observed_version!r}")
            return {
                "result": "pass",
                "classification": "https-default-ca",
                "httpStatus": response.status,
                "responseBytes": len(body),
                "responseSha256": hashlib.sha256(body).hexdigest(),
                "observedVersion": observed_version,
                "proxy": proxy_profile(),
                "defaultCaFileAvailable": bool(defaults.cafile and Path(defaults.cafile).is_file()),
                "defaultCaPathAvailable": bool(defaults.capath and Path(defaults.capath).is_dir()),
            }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, socket.timeout, ssl.SSLError) as error:
        return {
            "result": "blocked",
            "classification": classify_network_error(error),
            "httpStatus": error.code if isinstance(error, urllib.error.HTTPError) else None,
            "responseBytes": 0,
            "responseSha256": None,
            "observedVersion": None,
            "proxy": proxy_profile(),
            "defaultCaFileAvailable": bool(defaults.cafile and Path(defaults.cafile).is_file()),
            "defaultCaPathAvailable": bool(defaults.capath and Path(defaults.capath).is_dir()),
        }


def probe_filesystem(root: Path) -> tuple[dict[str, Any], Path]:
    fixture = Path(tempfile.mkdtemp(prefix="vem-p0-t0b-", dir=root.parent))
    target = fixture / "target.txt"
    target.write_text("target\n", encoding="utf-8")
    link = fixture / "target-link.txt"
    link.symlink_to(target.name)

    upper = fixture / "CaseProbe.txt"
    lower = fixture / "caseprobe.txt"
    upper.write_text("upper\n", encoding="utf-8")
    lower.write_text("lower\n", encoding="utf-8")
    case_sensitive = upper.read_text(encoding="utf-8") != lower.read_text(encoding="utf-8")

    long_directory = fixture / ("a" * 120) / ("b" * 120)
    long_directory.mkdir(parents=True)
    long_file = long_directory / "long-path.txt"
    long_file.write_text("long\n", encoding="utf-8")

    filesystem = run_command(["findmnt", "-T", str(root), "-o", "FSTYPE", "-n"], cwd=root, timeout=10)
    filesystem_type = filesystem["stdout"].splitlines()[0].strip() if filesystem["result"] == "pass" else "unknown"
    disk = shutil.disk_usage(root)
    result = {
        "filesystemType": filesystem_type,
        "availableBytes": disk.free,
        "caseSensitive": case_sensitive,
        "symlinkSupported": link.is_symlink() and link.read_text(encoding="utf-8") == "target\n",
        "longPathSupported": long_file.is_file() and len(str(long_file)) > 260,
        "result": "pass",
    }
    if filesystem_type != "ext4" or disk.free < 1_000_000_000 or not all(
        [result["caseSensitive"], result["symlinkSupported"], result["longPathSupported"]]
    ):
        result["result"] = "fail"
    return result, fixture


def command_summary(command: dict[str, Any]) -> dict[str, Any]:
    return {
        "exitCode": command["exitCode"],
        "result": command["result"],
        "classification": command["classification"],
    }


def not_run(classification: str) -> dict[str, Any]:
    return {
        "exitCode": None,
        "result": "not-run",
        "classification": classification,
    }


def blocked_pnpm_result(
    activation: dict[str, Any],
    classification: str,
    *,
    version: dict[str, Any] | None = None,
    observed_version: str | None = None,
    lock: dict[str, Any] | None = None,
) -> dict[str, Any]:
    version_summary = command_summary(version) if version is not None else not_run(classification)
    lock_summary = command_summary(lock) if lock is not None else not_run(classification)
    results = [activation["result"], version_summary["result"], lock_summary["result"]]
    aggregate = preflight.derive_overall(results)
    if aggregate == "partial":
        aggregate = "blocked"
    return {
        "result": aggregate,
        "activation": command_summary(activation),
        "version": {**version_summary, "observed": observed_version},
        "lockfile": {**lock_summary, "sha256": None},
        "frozenInstall": not_run(classification),
        "dependency": {
            "name": DEPENDENCY_NAME,
            "expectedVersion": DEPENDENCY_VERSION,
            "observedVersion": None,
        },
    }


def probe_pnpm(root: Path, fixture: Path) -> dict[str, Any]:
    isolated_environment = {"COREPACK_HOME": str(fixture / "corepack-home")}
    package_json = {
        "name": "vem-p0-t0b-fixture",
        "version": "0.0.0",
        "private": True,
        "packageManager": f"pnpm@{PNPM_VERSION}",
        "dependencies": {DEPENDENCY_NAME: DEPENDENCY_VERSION},
    }
    (fixture / "package.json").write_text(json.dumps(package_json, indent=2) + "\n", encoding="utf-8")

    activation = run_command(
        ["corepack", "prepare", f"pnpm@{PNPM_VERSION}", "--activate"],
        cwd=fixture,
        timeout=300,
        extra_env=isolated_environment,
    )
    if activation["result"] != "pass":
        return blocked_pnpm_result(activation, "activation-not-pass")

    version = run_command(
        ["corepack", "pnpm", "--version"],
        cwd=fixture,
        timeout=30,
        extra_env=isolated_environment,
    )
    observed_version = version["stdout"].splitlines()[0].strip() if version["result"] == "pass" else None
    if version["result"] != "pass" or observed_version != PNPM_VERSION:
        return blocked_pnpm_result(activation, "version-not-pass", version=version, observed_version=observed_version)

    lock = run_command(
        ["corepack", "pnpm", "install", "--lockfile-only", "--ignore-scripts"],
        cwd=fixture,
        timeout=90,
        extra_env=isolated_environment,
    )
    if lock["result"] != "pass":
        return blocked_pnpm_result(
            activation,
            "lockfile-not-pass",
            version=version,
            observed_version=observed_version,
            lock=lock,
        )
    frozen = run_command(
        ["corepack", "pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
        cwd=fixture,
        timeout=90,
        extra_env=isolated_environment,
    )

    lockfile = fixture / "pnpm-lock.yaml"
    installed_manifest = fixture / "node_modules" / DEPENDENCY_NAME / "package.json"
    installed_version = None
    if installed_manifest.is_file():
        installed_version = json.loads(installed_manifest.read_text(encoding="utf-8")).get("version")
    success = frozen["result"] == "pass" and installed_version == DEPENDENCY_VERSION and lockfile.is_file()
    if success:
        aggregate = "pass"
    elif "blocked" in {frozen["result"]}:
        aggregate = "blocked"
    else:
        aggregate = "fail"
    return {
        "result": aggregate,
        "activation": command_summary(activation),
        "version": {**command_summary(version), "observed": observed_version},
        "lockfile": {
            **command_summary(lock),
            "sha256": hashlib.sha256(lockfile.read_bytes()).hexdigest() if lockfile.is_file() else None,
        },
        "frozenInstall": command_summary(frozen),
        "dependency": {"name": DEPENDENCY_NAME, "expectedVersion": DEPENDENCY_VERSION, "observedVersion": installed_version},
    }


def probe_watcher(root: Path) -> dict[str, Any]:
    script = root / "scripts/preflight/watch_probe.mjs"
    command = run_command(
        ["node", str(script), "--iterations", "10", "--timeout-ms", "3000", "--base", str(root.parent)],
        cwd=root,
        timeout=90,
    )
    if command["result"] != "pass":
        return {
            "schemaVersion": "P0-T0B-watch-v1",
            "provider": "node:fs.watch",
            "polling": False,
            "iterations": 10,
            "timeoutMs": 3000,
            "samplesMs": {"create": [], "modify": [], "rename": []},
            "p50Ms": None,
            "p95Ms": None,
            "eventCount": 0,
            "result": "blocked",
            "classification": command["classification"],
        }
    result = json.loads(command["stdout"].splitlines()[-1])
    result["classification"] = "native-watch-events"
    return result


def validate_profile(result: dict[str, Any]) -> None:
    preflight._scan_for_secrets(result)
    expected = {"schemaVersion", "taskId", "runId", "recordedAt", "registry", "filesystem", "pnpm", "watcher", "cleanup", "overall"}
    if set(result) != expected:
        raise ProfileError(f"profile keys mismatch: {sorted(set(result) ^ expected)}")
    if result["schemaVersion"] != PROFILE_SCHEMA or result["taskId"] != TASK_ID:
        raise ProfileError("profile identity mismatch")
    if result["overall"] not in {"pass", "blocked", "fail"}:
        raise ProfileError("profile overall is unknown")
    if result["watcher"].get("polling") is not False or result["watcher"].get("provider") != "node:fs.watch":
        raise ProfileError("watcher must be native node:fs.watch with polling=false")
    samples = result["watcher"].get("samplesMs", {})
    if set(samples) != {"create", "modify", "rename"}:
        raise ProfileError("watcher sample categories are incomplete")
    if result["watcher"].get("result") == "pass":
        if any(len(samples[name]) < 3 for name in samples):
            raise ProfileError("passing watcher evidence needs at least three samples per category")
        combined = [float(value) for values in samples.values() for value in values]
        if result["watcher"].get("p50Ms") != percentile(combined, 0.5):
            raise ProfileError("watcher p50 does not match samples")
        if result["watcher"].get("p95Ms") != percentile(combined, 0.95):
            raise ProfileError("watcher p95 does not match samples")
    component_results = [result[name]["result"] for name in ["registry", "filesystem", "pnpm", "watcher"]]
    derived = preflight.derive_overall([*component_results, result["cleanup"]])
    if result["overall"] != derived:
        raise ProfileError(f"profile overall does not match machine-derived {derived}")


def build_environment(
    root: Path,
    details_path: Path,
    result: dict[str, Any],
    node_probe: dict[str, Any],
) -> dict[str, Any]:
    node_version = (
        node_probe["stdout"].splitlines()[0].strip().removeprefix("v")
        if node_probe["result"] == "pass"
        else None
    )
    pnpm_version = result["pnpm"]["version"]["observed"]
    checks = []
    for name in ["registry", "filesystem", "pnpm", "watcher"]:
        component = result[name]
        if name == "watcher":
            p50 = component.get("p50Ms")
            p95 = component.get("p95Ms")
            classification = f"node:fs.watch polling=false p50={p50}ms p95={p95}ms"
        else:
            classification = component.get("classification", component.get("result", "unknown"))
            if name == "filesystem":
                filesystem_type = component["filesystemType"]
                case_sensitive = component["caseSensitive"]
                symlink_supported = component["symlinkSupported"]
                long_path_supported = component["longPathSupported"]
                classification = f"ext4={filesystem_type} case={case_sensitive} symlink={symlink_supported} longPath={long_path_supported}"
            if name == "pnpm":
                observed = component["version"]["observed"]
                frozen_classification = component["frozenInstall"]["classification"]
                classification = f"pnpm={observed} frozen={frozen_classification}"
        checks.append({"id": f"p0-t0b-{name}", "result": component["result"], "classification": classification, "evidenceRefs": [f"artifact:{details_path.as_posix()}"]})
    checks.append({"id": "p0-t0b-cleanup", "result": result["cleanup"], "classification": "temporary same-filesystem fixture removed", "evidenceRefs": [f"artifact:{details_path.as_posix()}"]})
    node_result = node_probe["result"]
    if node_result == "pass" and node_version != NODE_VERSION:
        node_result = "fail"
    checks.append({"id": "p0-t0b-node-version", "result": node_result, "classification": f"node={node_version}", "evidenceRefs": [f"artifact:{details_path.as_posix()}"]})
    overall = preflight.derive_overall([check["result"] for check in checks])
    evidence = {
        "schemaVersion": preflight.SCHEMA_VERSION,
        "taskId": TASK_ID,
        "runId": result["runId"],
        "recordedAt": result["recordedAt"],
        "contractIds": [preflight.CONTRACT_ID],
        "executionProfile": {
            "name": "WSL Node/pnpm on canonical ext4; Windows Edge deferred",
            "canonicalGitRoot": str(root),
            "projectRoot": ".",
            "filesystemType": result["filesystem"]["filesystemType"],
            "runnerOwner": pwd.getpwuid(os.geteuid()).pw_name,
            "tier1BrowserOwner": "Windows Edge Stable; not exercised by P0-T0B",
        },
        "commands": [
            {"id": "node-version", "argv": ["node", "--version"], "exitCode": node_probe["exitCode"], "result": node_probe["result"], "stdoutSummary": node_version, "stderrSummary": node_probe["classification"] if node_probe["result"] != "pass" else None},
            {"id": "registry-probe", "argv": ["python3", "urllib", REGISTRY_URL], "exitCode": 0 if result["registry"]["result"] == "pass" else None, "result": result["registry"]["result"], "stdoutSummary": result["registry"]["classification"], "stderrSummary": None},
            {"id": "pnpm-version", "argv": ["corepack", "pnpm", "--version"], "exitCode": result["pnpm"]["version"]["exitCode"], "result": result["pnpm"]["version"]["result"], "stdoutSummary": result["pnpm"]["version"]["observed"], "stderrSummary": None if result["pnpm"]["version"]["result"] == "pass" else result["pnpm"]["version"]["classification"]},
            {"id": "pnpm-frozen-install", "argv": ["corepack", "pnpm", "install", "--frozen-lockfile", "--ignore-scripts"], "exitCode": result["pnpm"]["frozenInstall"]["exitCode"], "result": result["pnpm"]["frozenInstall"]["result"], "stdoutSummary": result["pnpm"]["frozenInstall"]["classification"], "stderrSummary": None},
            {"id": "node-fs-watch", "argv": ["node", "scripts/preflight/watch_probe.mjs"], "exitCode": 0 if result["watcher"]["result"] == "pass" else None, "result": result["watcher"]["result"], "stdoutSummary": result["watcher"]["classification"], "stderrSummary": None},
        ],
        "tools": {
            "node": {"exactVersion": NODE_VERSION, "observedVersion": node_version, "versionCommand": ["node", "--version"], "selectionSource": f"https://nodejs.org/en/blog/release/v{NODE_VERSION}", "result": "pass" if node_version == NODE_VERSION else node_result},
            "pnpm": {"exactVersion": PNPM_VERSION, "observedVersion": pnpm_version, "versionCommand": ["pnpm", "--version"], "activationCommand": ["corepack", "prepare", f"pnpm@{PNPM_VERSION}", "--activate"], "selectionSource": f"https://github.com/pnpm/pnpm/releases/tag/v{PNPM_VERSION}", "result": "pass" if pnpm_version == PNPM_VERSION else result["pnpm"]["result"]},
        },
        "checks": checks,
        "artifacts": [
            preflight._artifact(root, details_path.as_posix()),
            preflight._artifact(root, "scripts/preflight/profile_probe.py"),
            preflight._artifact(root, "scripts/preflight/watch_probe.mjs"),
            preflight._artifact(root, "scripts/preflight/evidence.schema.json"),
            preflight._artifact(root, "docs/adr/0001-edge-execution-preflight.md"),
        ],
        "overall": overall,
    }
    preflight.validate_evidence(evidence)
    return evidence


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--details", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    root_text = subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True).stdout.strip()
    root = Path(root_text).resolve()
    if Path.cwd().resolve() != root:
        raise ProfileError("run profile probe from canonical Git root")

    fixture: Path | None = None
    cleanup = "blocked"
    node_probe = run_command(["node", "--version"], cwd=root, timeout=10)
    try:
        filesystem, fixture = probe_filesystem(root)
        registry = probe_registry()
        pnpm = probe_pnpm(root, fixture)
        watcher = probe_watcher(root)
    finally:
        if fixture is not None:
            shutil.rmtree(fixture, ignore_errors=False)
            cleanup = "pass" if not fixture.exists() else "blocked"

    component_results = [registry["result"], filesystem["result"], pnpm["result"], watcher["result"]]
    overall = preflight.derive_overall([*component_results, cleanup])
    details = {
        "schemaVersion": PROFILE_SCHEMA,
        "taskId": TASK_ID,
        "runId": args.run_id,
        "recordedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "registry": registry,
        "filesystem": filesystem,
        "pnpm": pnpm,
        "watcher": watcher,
        "cleanup": cleanup,
        "overall": overall,
    }
    validate_profile(details)
    args.details.parent.mkdir(parents=True, exist_ok=True)
    args.details.write_text(json.dumps(details, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    environment = build_environment(root, args.details, details, node_probe)
    args.output.write_text(json.dumps(environment, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"P0_T0B_PROFILE={overall}")
    return 0 if overall == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
