#!/usr/bin/env python3
"""P0-T0F immutable bootstrap preflight evidence aggregator."""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import subprocess
from typing import Any

import preflight

TASK_ID = "P0-T0F"
DETAIL_SCHEMA = "P0-T0F-aggregate-v1"
NODE_VERSION = "24.18.0"
PNPM_VERSION = "10.34.0"
RUNS = {
    "P0-T0A0": "20260728T155608+0800",
    "P0-T0A1": "20260728T165102+0800",
    "P0-T0A2": "20260728T194140+0800",
    "P0-T0B": "20260728T195939+0800",
    "P0-T0C": "20260728T204048+0800",
    "P0-T0D": "20260728T211720+0800",
    "P0-T0E": "20260728T213829+0800",
}
REQUIRED = {
    "P0-T0A0": {"environment.json", "summary.md", "bootstrap-validation.txt"},
    "P0-T0A1": {"authorization.json", "layout-commit.json", "cutover.json", "summary.md"},
    "P0-T0A2": {"environment.json", "owner-decision.json", "summary.md"},
    "P0-T0B": {"environment.json", "summary.md", "test-results.txt"},
    "P0-T0C": {"environment.json", "summary.md", "test-results.txt"},
    "P0-T0D": {"environment.json", "summary.md", "test-results.txt", "residue-validation.txt"},
    "P0-T0E": {"environment.json", "summary.md", "test-results.txt", "residue-validation.txt"},
}
SHA_LINE = re.compile(r"^([0-9a-f]{64})  ([A-Za-z0-9._+-]+)$")


class AggregateError(ValueError):
    pass


def load_json(path: Path) -> dict[str, Any]:
    return preflight.load_json(path)


def verify_manifest(directory: Path, required: set[str]) -> str:
    manifest = directory / "SHA256SUMS"
    if not manifest.is_file() or manifest.is_symlink() or manifest.stat().st_size > 100_000:
        raise AggregateError("manifest-missing-or-unsafe")
    seen: set[str] = set()
    for line in manifest.read_text(encoding="utf-8").splitlines():
        match = SHA_LINE.fullmatch(line)
        if not match or match.group(2) in seen:
            raise AggregateError("manifest-malformed-or-duplicate")
        expected, name = match.groups()
        seen.add(name)
        target = directory / name
        if not target.is_file() or target.is_symlink():
            raise AggregateError("manifest-target-missing-or-unsafe")
        if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise AggregateError("manifest-hash-mismatch")
    if not required <= seen:
        raise AggregateError("required-evidence-not-covered")
    return hashlib.sha256(manifest.read_bytes()).hexdigest()


def a0_record(directory: Path, manifest_hash: str) -> dict[str, Any]:
    data = load_json(directory / "environment.json")
    preflight._scan_for_secrets(data)
    if data.get("taskId") != "P0-T0A0" or data.get("classification", {}).get("overall") != "ready":
        raise AggregateError("a0-not-ready")
    return record("P0-T0A0", data["runId"], data["recordedAt"], manifest_hash)


def a1_record(directory: Path, manifest_hash: str) -> tuple[dict[str, Any], str]:
    authorization = load_json(directory / "authorization.json")
    layout = load_json(directory / "layout-commit.json")
    cutover = load_json(directory / "cutover.json")
    for value in (authorization, layout, cutover):
        preflight._scan_for_secrets(value)
    if authorization.get("authorized") is not True:
        raise AggregateError("a1-not-authorized")
    commit = layout.get("layoutCommit")
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise AggregateError("a1-layout-commit-invalid")
    if layout.get("layoutParent") != layout.get("requiredParent") or layout.get("targetGitTopLevel") != "/home/qwzx/src/VEM":
        raise AggregateError("a1-layout-invalid")
    required_cutover = ["rollbackReadable", "rollbackWriteRefused", "sourceManifestStillMatchesFreeze", "targetSourceParityStillMatches"]
    if cutover.get("canonicalWriter") != "/home/qwzx/src/VEM" or not all(cutover.get(name) is True for name in required_cutover):
        raise AggregateError("a1-cutover-invalid")
    return record("P0-T0A1", RUNS["P0-T0A1"], cutover["cutoverAt"], manifest_hash), commit


def record(task_id: str, run_id: str, recorded_at: str, manifest_hash: str) -> dict[str, Any]:
    if not preflight.RUN_ID_RE.fullmatch(run_id):
        raise AggregateError("input-run-id-invalid")
    parsed = datetime.fromisoformat(recorded_at)
    if parsed.utcoffset() is None:
        raise AggregateError("input-time-offset-missing")
    return {"taskId": task_id, "runId": run_id, "recordedAt": recorded_at, "verdict": "pass", "manifestSha256": manifest_hash}


def shared_record(root: Path, directory: Path, task_id: str, manifest_hash: str) -> dict[str, Any]:
    data = load_json(directory / "environment.json")
    preflight.validate_evidence(data)
    preflight.verify_artifacts(data, root)
    profile = data["executionProfile"]
    if data["taskId"] != task_id or data["overall"] != "pass":
        raise AggregateError("shared-input-not-pass")
    if profile["canonicalGitRoot"] != str(root) or profile["filesystemType"] != "ext4" or profile["runnerOwner"] != pwd.getpwuid(os.geteuid()).pw_name:
        raise AggregateError("shared-input-identity-mismatch")
    if data["tools"]["node"]["exactVersion"] != NODE_VERSION or data["tools"]["pnpm"]["exactVersion"] != PNPM_VERSION:
        raise AggregateError("shared-input-version-mismatch")
    return record(task_id, data["runId"], data["recordedAt"], manifest_hash)


def canonical_digest(records: list[dict[str, Any]]) -> str:
    payload = json.dumps(records, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    return hashlib.sha256(payload).hexdigest()


def build_detail(root: Path, run_id: str) -> dict[str, Any]:
    base = root / "docs/test-evidence/P0-T0"
    records: list[dict[str, Any]] = []
    layout_commit = ""
    for task_id, expected_run in RUNS.items():
        directory = base / expected_run
        manifest_hash = verify_manifest(directory, REQUIRED[task_id])
        if task_id == "P0-T0A0":
            item = a0_record(directory, manifest_hash)
        elif task_id == "P0-T0A1":
            item, layout_commit = a1_record(directory, manifest_hash)
        else:
            item = shared_record(root, directory, task_id, manifest_hash)
        if item["runId"] != expected_run:
            raise AggregateError("input-run-selection-mismatch")
        records.append(item)
    timestamps = [datetime.fromisoformat(item["recordedAt"]) for item in records]
    if timestamps != sorted(timestamps):
        raise AggregateError("input-time-order-invalid")
    ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", layout_commit, "HEAD"], cwd=root, check=False, timeout=10).returncode == 0
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, check=True, capture_output=True, text=True, timeout=10).stdout.strip()
    filesystem = subprocess.run(["findmnt", "-n", "-o", "FSTYPE", "-T", str(root)], check=True, capture_output=True, text=True, timeout=5).stdout.strip()
    roadmap = (root / "ROADMAP.yaml").read_text(encoding="utf-8")
    statuses_done = all(re.search(rf"id: {re.escape(task_id)}[^\n]+status: done", roadmap) for task_id in RUNS)
    current = {
        "canonicalGitRoot": str(root),
        "head": head,
        "layoutCommit": layout_commit,
        "layoutCommitAncestor": ancestor,
        "filesystemType": filesystem,
        "runnerOwner": pwd.getpwuid(os.geteuid()).pw_name,
        "inputTasksDone": statuses_done,
    }
    overall = "passed" if ancestor and filesystem == "ext4" and statuses_done else "blocked"
    detail = {
        "schemaVersion": DETAIL_SCHEMA,
        "taskId": TASK_ID,
        "runId": run_id,
        "recordedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "inputs": records,
        "current": current,
        "aggregateDigest": canonical_digest(records),
        "rerunTasks": [] if overall == "passed" else list(RUNS),
        "overall": overall,
    }
    preflight._scan_for_secrets(detail)
    return detail


def build_environment(root: Path, details_path: Path, detail: dict[str, Any]) -> dict[str, Any]:
    node_command, node_text = preflight._run(["node", "--version"])
    node_version = node_text.removeprefix("v") or None
    result = "pass" if detail["overall"] == "passed" else "blocked"
    checks = [
        {"id": "p0-t0f-required-inputs", "result": result, "classification": f"seven-input-manifests digest={detail['aggregateDigest']}", "evidenceRefs": [f"artifact:{details_path.as_posix()}"]},
        {"id": "p0-t0f-current-consistency", "result": result, "classification": "canonical-root ext4 owner ancestry status time-order", "evidenceRefs": [f"artifact:{details_path.as_posix()}"]},
        {"id": "p0-t0f-aggregate-verdict", "result": result, "classification": detail["overall"], "evidenceRefs": [f"artifact:{details_path.as_posix()}"]},
    ]
    environment = {
        "schemaVersion": preflight.SCHEMA_VERSION, "taskId": TASK_ID, "runId": detail["runId"], "recordedAt": detail["recordedAt"],
        "contractIds": [preflight.CONTRACT_ID],
        "executionProfile": {"name": "Read-only P0 bootstrap evidence aggregator", "canonicalGitRoot": str(root), "projectRoot": ".", "filesystemType": "ext4", "runnerOwner": pwd.getpwuid(os.geteuid()).pw_name, "tier1BrowserOwner": "Windows Edge Stable evidence consumed from P0-T0C/D"},
        "commands": [node_command, {"id": "aggregate-probe", "argv": ["python3", "scripts/preflight/aggregate_probe.py", "<fixed-input-runs>"], "exitCode": 0 if result == "pass" else 2, "result": result, "stdoutSummary": detail["overall"], "stderrSummary": None}],
        "tools": {
            "node": {"exactVersion": NODE_VERSION, "observedVersion": node_version, "versionCommand": ["node", "--version"], "selectionSource": f"https://nodejs.org/en/blog/release/v{NODE_VERSION}", "result": "pass" if node_version == NODE_VERSION else "fail"},
            "pnpm": {"exactVersion": PNPM_VERSION, "observedVersion": None, "versionCommand": ["pnpm", "--version"], "activationCommand": ["corepack", "prepare", f"pnpm@{PNPM_VERSION}", "--activate"], "selectionSource": f"https://github.com/pnpm/pnpm/releases/tag/v{PNPM_VERSION}", "result": "selected"},
        },
        "checks": checks,
        "artifacts": [preflight._artifact(root, details_path.as_posix()), preflight._artifact(root, "scripts/preflight/aggregate_probe.py"), preflight._artifact(root, "scripts/preflight/evidence.schema.json"), preflight._artifact(root, "docs/adr/0002-bootstrap-preflight-verdict.md")],
        "overall": preflight.derive_overall([item["result"] for item in checks]),
    }
    preflight.validate_evidence(environment)
    return environment


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--details", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    root = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True).stdout.strip()).resolve()
    detail = build_detail(root, args.run_id)
    args.details.parent.mkdir(parents=True, exist_ok=True)
    args.details.write_text(json.dumps(detail, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    environment = build_environment(root, args.details, detail)
    args.output.write_text(json.dumps(environment, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"P0_T0F_AGGREGATE={detail['overall']}")
    return 0 if detail["overall"] == "passed" and environment["overall"] == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
