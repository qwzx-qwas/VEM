#!/usr/bin/env python3
"""P0-T0E ext4 private runtime owner/mode and other-subject probe."""

from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import tempfile
from typing import Any

import preflight

TASK_ID = "P0-T0E"
PROFILE_SCHEMA = "P0-T0E-runtime-acl-profile-v1"
NODE_VERSION = "24.18.0"
PNPM_VERSION = "10.34.0"
FIXTURE_NAME = "access-fixture"
FIXTURE_BYTES = b"VEM_RUNTIME_ACL_FIXTURE\n"
TASK_PREFIX = ".preflight-"
WINDOWS_MOUNT_TYPES = {"9p", "drvfs"}
RESULTS = {"pass", "fail", "blocked", "not-run"}


class RuntimeAclError(ValueError):
    def __init__(self, classification: str):
        super().__init__(classification)
        self.classification = classification


def exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        raise RuntimeAclError(f"{label}-keys-invalid")
    return value


def bounded_string(value: Any, label: str, maximum: int = 256) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise RuntimeAclError(f"{label}-invalid")
    return value


def bounded_int(value: Any, label: str, low: int = 0, high: int = 2**63 - 1) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
        raise RuntimeAclError(f"{label}-invalid")
    return value


def filesystem_type(path: Path) -> str:
    try:
        completed = subprocess.run(
            ["findmnt", "-n", "-o", "FSTYPE", "-T", str(path)],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        raise RuntimeAclError("filesystem-probe-unavailable") from error
    value = completed.stdout.strip().lower()
    if completed.returncode != 0 or not value or len(value) > 32:
        raise RuntimeAclError("filesystem-probe-invalid")
    return value


def contains_symlink(path: Path) -> bool:
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current = current / part
        try:
            if stat.S_ISLNK(current.lstat().st_mode):
                return True
        except FileNotFoundError:
            return False
    return False


def select_runtime_root() -> tuple[Path, str, str, str]:
    owner = pwd.getpwuid(os.geteuid())
    xdg = os.environ.get("XDG_RUNTIME_DIR")
    if xdg:
        xdg_base = Path(xdg)
        if not xdg_base.is_absolute() or contains_symlink(xdg_base):
            raise RuntimeAclError("xdg-runtime-invalid")
        candidate_fs = filesystem_type(xdg_base)
        if candidate_fs in WINDOWS_MOUNT_TYPES:
            raise RuntimeAclError("xdg-windows-mount-rejected")
        if candidate_fs == "ext4":
            root = xdg_base / "vem"
            source = "xdg-runtime"
            candidate_classification = "xdg-ext4-selected"
        else:
            root = Path(owner.pw_dir) / ".cache" / "vem"
            source = "passwd-home-cache-after-xdg-non-ext4"
            candidate_classification = "xdg-non-ext4-rejected"
    else:
        root = Path(owner.pw_dir) / ".cache" / "vem"
        source = "passwd-home-cache"
        candidate_fs = "not-set"
        candidate_classification = "xdg-not-set"
    if contains_symlink(root):
        raise RuntimeAclError("runtime-symlink-rejected")
    return root, source, candidate_fs, candidate_classification


def mode_text(mode: int) -> str:
    return f"{stat.S_IMODE(mode):04o}"


def validate_private_directory(path: Path, expected_uid: int) -> os.stat_result:
    try:
        value = path.lstat()
    except FileNotFoundError as error:
        raise RuntimeAclError("runtime-root-missing") from error
    if not stat.S_ISDIR(value.st_mode) or stat.S_ISLNK(value.st_mode):
        raise RuntimeAclError("runtime-root-not-directory")
    if value.st_uid != expected_uid:
        raise RuntimeAclError("runtime-owner-mismatch")
    if stat.S_IMODE(value.st_mode) != 0o700:
        raise RuntimeAclError("runtime-mode-not-private")
    return value


def create_fixture(runtime_root: Path) -> tuple[Path, Path]:
    task_dir = Path(tempfile.mkdtemp(prefix=TASK_PREFIX, dir=runtime_root))
    os.chmod(task_dir, 0o700)
    fixture = task_dir / FIXTURE_NAME
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(fixture, flags, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        os.write(descriptor, FIXTURE_BYTES)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return task_dir, fixture


def cleanup_fixture(runtime_root: Path, task_dir: Path, fixture: Path) -> dict[str, Any]:
    result = {
        "result": "pass",
        "classification": "owned-fixture-absent",
        "fixtureRemoved": not fixture.exists(),
        "taskDirectoryRemoved": not task_dir.exists(),
        "unexpectedEntryCount": 0,
    }
    try:
        if task_dir.parent.resolve() != runtime_root.resolve() or not task_dir.name.startswith(TASK_PREFIX):
            raise RuntimeAclError("cleanup-target-invalid")
        if not task_dir.exists():
            return result
        if stat.S_ISLNK(task_dir.lstat().st_mode) or not stat.S_ISDIR(task_dir.lstat().st_mode):
            raise RuntimeAclError("cleanup-task-directory-invalid")
        if fixture.exists() or fixture.is_symlink():
            fixture_stat = fixture.lstat()
            if stat.S_ISLNK(fixture_stat.st_mode) or not stat.S_ISREG(fixture_stat.st_mode):
                raise RuntimeAclError("cleanup-fixture-invalid")
            fixture.unlink()
        entries = list(task_dir.iterdir())
        if entries:
            result.update({
                "result": "fail",
                "classification": "cleanup-unexpected-stale-entry",
                "fixtureRemoved": not fixture.exists(),
                "taskDirectoryRemoved": False,
                "unexpectedEntryCount": len(entries),
            })
            return result
        task_dir.rmdir()
    except (OSError, RuntimeAclError) as error:
        classification = error.classification if isinstance(error, RuntimeAclError) else "cleanup-operation-failed"
        result.update({
            "result": "blocked",
            "classification": classification,
            "fixtureRemoved": not fixture.exists(),
            "taskDirectoryRemoved": not task_dir.exists(),
        })
        return result
    result.update({
        "classification": "owned-fixture-removed",
        "fixtureRemoved": True,
        "taskDirectoryRemoved": True,
    })
    return result


def run_as_nobody(argv: list[str], timeout_seconds: int = 10) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(
            ["wsl.exe", "-u", "root", "--", "runuser", "-u", "nobody", "--", *argv],
            check=False,
            capture_output=True,
            text=False,
            timeout=timeout_seconds,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        raise RuntimeAclError("other-subject-provider-unavailable") from error


def verify_other_subject(task_dir: Path, fixture: Path) -> dict[str, Any]:
    identity = run_as_nobody(["id", "-u"])
    try:
        observed_uid = int(identity.stdout.decode("ascii").strip())
    except (UnicodeError, ValueError) as error:
        raise RuntimeAclError("other-subject-identity-invalid") from error
    if identity.returncode != 0 or observed_uid != 65534:
        raise RuntimeAclError("other-subject-identity-mismatch")
    checks = {
        "traverseDenied": run_as_nobody(["/usr/bin/test", "-x", str(task_dir)]),
        "readDenied": run_as_nobody(["/usr/bin/test", "-r", str(fixture)]),
        "writeDenied": run_as_nobody(["/usr/bin/test", "-w", str(fixture)]),
        "createDenied": run_as_nobody(["/usr/bin/touch", str(task_dir / "other-created")]),
    }
    denied: dict[str, bool] = {}
    for name, completed in checks.items():
        if completed.returncode not in {0, 1}:
            raise RuntimeAclError("other-subject-command-ambiguous")
        denied[name] = completed.returncode == 1
    if not all(denied.values()) or (task_dir / "other-created").exists():
        raise RuntimeAclError("other-subject-access-allowed")
    return {
        "result": "pass",
        "classification": "real-nobody-access-denied",
        "provider": "wsl-root-drop-to-nobody",
        "observedUid": observed_uid,
        **denied,
    }


def derive_overall(profile: dict[str, Any]) -> str:
    values = [profile[name]["result"] for name in ["runtime", "otherSubject", "windowsMount", "cleanup"]]
    derived = preflight.derive_overall(values)
    return "blocked" if derived == "partial" else derived


def validate_profile(profile: dict[str, Any]) -> None:
    preflight._scan_for_secrets(profile)
    exact_keys(profile, {"schemaVersion", "taskId", "runId", "recordedAt", "runtime", "otherSubject", "windowsMount", "cleanup", "overall"}, "profile")
    if profile["schemaVersion"] != PROFILE_SCHEMA or profile["taskId"] != TASK_ID:
        raise RuntimeAclError("profile-identity-invalid")
    if not isinstance(profile["runId"], str) or not preflight.RUN_ID_RE.fullmatch(profile["runId"]):
        raise RuntimeAclError("run-id-invalid")
    recorded_at = bounded_string(profile["recordedAt"], "recorded-at", 64)
    if datetime.fromisoformat(recorded_at).utcoffset() is None:
        raise RuntimeAclError("recorded-at-offset-missing")
    runtime = exact_keys(profile["runtime"], {
        "result", "classification", "selectionSource", "filesystemType", "deviceId", "ownerUid", "ownerGid",
        "xdgCandidateFilesystemType", "xdgCandidateClassification", "rootMode", "taskDirectoryMode", "fixtureMode",
        "ownerRead", "ownerWrite", "rootPreserved",
    }, "runtime")
    if runtime["result"] not in RESULTS:
        raise RuntimeAclError("runtime-result-invalid")
    for name in ["classification", "selectionSource", "filesystemType", "xdgCandidateFilesystemType", "xdgCandidateClassification", "rootMode", "taskDirectoryMode", "fixtureMode"]:
        bounded_string(runtime[name], f"runtime-{name}")
    for name in ["deviceId", "ownerUid", "ownerGid"]:
        bounded_int(runtime[name], f"runtime-{name}")
    for name in ["ownerRead", "ownerWrite", "rootPreserved"]:
        if not isinstance(runtime[name], bool):
            raise RuntimeAclError(f"runtime-{name}-invalid")
    if runtime["result"] == "pass" and not (
        runtime["filesystemType"] == "ext4" and runtime["rootMode"] == "0700"
        and runtime["taskDirectoryMode"] == "0700" and runtime["fixtureMode"] == "0600"
        and runtime["ownerRead"] and runtime["ownerWrite"] and runtime["rootPreserved"]
    ):
        raise RuntimeAclError("runtime-pass-without-private-evidence")
    other = exact_keys(profile["otherSubject"], {
        "result", "classification", "provider", "observedUid", "traverseDenied", "readDenied", "writeDenied", "createDenied",
    }, "other-subject")
    if other["result"] not in RESULTS:
        raise RuntimeAclError("other-subject-result-invalid")
    bounded_string(other["classification"], "other-classification")
    bounded_string(other["provider"], "other-provider")
    bounded_int(other["observedUid"], "other-uid")
    for name in ["traverseDenied", "readDenied", "writeDenied", "createDenied"]:
        if not isinstance(other[name], bool):
            raise RuntimeAclError(f"other-{name}-invalid")
    if other["result"] == "pass" and (other["observedUid"] != 65534 or not all(other[name] for name in ["traverseDenied", "readDenied", "writeDenied", "createDenied"])):
        raise RuntimeAclError("other-subject-pass-without-denial")
    windows = exact_keys(profile["windowsMount"], {"result", "classification", "filesystemType", "aclEvidenceAccepted"}, "windows-mount")
    if windows["result"] not in RESULTS:
        raise RuntimeAclError("windows-mount-result-invalid")
    bounded_string(windows["classification"], "windows-classification")
    bounded_string(windows["filesystemType"], "windows-filesystem")
    if not isinstance(windows["aclEvidenceAccepted"], bool):
        raise RuntimeAclError("windows-acl-evidence-invalid")
    if windows["result"] == "pass" and (windows["filesystemType"] not in WINDOWS_MOUNT_TYPES or windows["aclEvidenceAccepted"]):
        raise RuntimeAclError("windows-mount-not-rejected")
    cleanup = exact_keys(profile["cleanup"], {
        "result", "classification", "firstPass", "secondPass", "fixtureRemoved", "taskDirectoryRemoved",
        "unexpectedEntryCount", "runtimeRootPreserved",
    }, "cleanup")
    if cleanup["result"] not in RESULTS:
        raise RuntimeAclError("cleanup-result-invalid")
    bounded_string(cleanup["classification"], "cleanup-classification")
    bounded_int(cleanup["unexpectedEntryCount"], "cleanup-unexpected", 0, 100)
    for name in ["firstPass", "secondPass", "fixtureRemoved", "taskDirectoryRemoved", "runtimeRootPreserved"]:
        if not isinstance(cleanup[name], bool):
            raise RuntimeAclError(f"cleanup-{name}-invalid")
    if cleanup["result"] == "pass" and not all(cleanup[name] for name in ["firstPass", "secondPass", "fixtureRemoved", "taskDirectoryRemoved", "runtimeRootPreserved"]):
        raise RuntimeAclError("cleanup-pass-without-evidence")
    if profile["overall"] not in {"pass", "fail", "blocked"} or profile["overall"] != derive_overall(profile):
        raise RuntimeAclError("overall-mismatch")


def command_record(command_id: str, argv: list[str], result: str, classification: str, exit_code: int | None = 0) -> dict[str, Any]:
    return {"id": command_id, "argv": argv, "exitCode": exit_code, "result": result, "stdoutSummary": classification, "stderrSummary": None}


def run_profile(run_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    expected_uid = os.geteuid()
    runtime_root, source, candidate_fs, candidate_classification = select_runtime_root()
    root_before = validate_private_directory(runtime_root, expected_uid)
    runtime_fs = filesystem_type(runtime_root)
    if runtime_fs != "ext4":
        raise RuntimeAclError("runtime-filesystem-not-ext4")
    windows_fs = filesystem_type(Path("/mnt/d/VEM"))
    if windows_fs not in WINDOWS_MOUNT_TYPES:
        raise RuntimeAclError("windows-mount-classification-unknown")
    task_dir, fixture = create_fixture(runtime_root)
    first_cleanup: dict[str, Any] | None = None
    second_cleanup: dict[str, Any] | None = None
    other: dict[str, Any]
    try:
        task_stat = task_dir.lstat()
        fixture_stat = fixture.lstat()
        if task_stat.st_uid != expected_uid or fixture_stat.st_uid != expected_uid:
            raise RuntimeAclError("fixture-owner-mismatch")
        owner_read = fixture.read_bytes() == FIXTURE_BYTES
        with fixture.open("ab") as handle:
            handle.write(b"")
        owner_write = True
        other = verify_other_subject(task_dir, fixture)
        runtime = {
            "result": "pass",
            "classification": "ext4-owner-private-runtime",
            "selectionSource": source,
            "filesystemType": runtime_fs,
            "xdgCandidateFilesystemType": candidate_fs,
            "xdgCandidateClassification": candidate_classification,
            "deviceId": root_before.st_dev,
            "ownerUid": root_before.st_uid,
            "ownerGid": root_before.st_gid,
            "rootMode": mode_text(root_before.st_mode),
            "taskDirectoryMode": mode_text(task_stat.st_mode),
            "fixtureMode": mode_text(fixture_stat.st_mode),
            "ownerRead": owner_read,
            "ownerWrite": owner_write,
            "rootPreserved": True,
        }
    finally:
        first_cleanup = cleanup_fixture(runtime_root, task_dir, fixture)
        second_cleanup = cleanup_fixture(runtime_root, task_dir, fixture)
    root_after = validate_private_directory(runtime_root, expected_uid)
    root_preserved = (
        root_after.st_dev == root_before.st_dev and root_after.st_ino == root_before.st_ino
        and root_after.st_uid == root_before.st_uid and root_after.st_gid == root_before.st_gid
        and stat.S_IMODE(root_after.st_mode) == stat.S_IMODE(root_before.st_mode)
    )
    cleanup = {
        "result": "pass" if first_cleanup["result"] == "pass" and second_cleanup["result"] == "pass" and root_preserved else "fail",
        "classification": "idempotent-owned-cleanup" if first_cleanup["result"] == "pass" and second_cleanup["result"] == "pass" and root_preserved else "cleanup-failed",
        "firstPass": first_cleanup["result"] == "pass",
        "secondPass": second_cleanup["result"] == "pass",
        "fixtureRemoved": not fixture.exists(),
        "taskDirectoryRemoved": not task_dir.exists(),
        "unexpectedEntryCount": max(first_cleanup["unexpectedEntryCount"], second_cleanup["unexpectedEntryCount"]),
        "runtimeRootPreserved": root_preserved,
    }
    runtime["rootPreserved"] = root_preserved
    profile = {
        "schemaVersion": PROFILE_SCHEMA,
        "taskId": TASK_ID,
        "runId": run_id,
        "recordedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "runtime": runtime,
        "otherSubject": other,
        "windowsMount": {
            "result": "pass",
            "classification": "windows-mount-acl-evidence-rejected",
            "filesystemType": windows_fs,
            "aclEvidenceAccepted": False,
        },
        "cleanup": cleanup,
        "overall": "blocked",
    }
    profile["overall"] = derive_overall(profile)
    validate_profile(profile)
    commands = [
        command_record("runtime-filesystem-owner-mode", ["findmnt", "-n", "-o", "FSTYPE", "-T", "<selected-runtime>"], runtime["result"], runtime["classification"]),
        command_record("other-subject-identity", ["wsl.exe", "-u", "root", "--", "runuser", "-u", "nobody", "--", "id", "-u"], other["result"], f"observed-uid={other['observedUid']}"),
        command_record("other-subject-access", ["wsl.exe", "-u", "root", "--", "runuser", "-u", "nobody", "--", "<bounded-access-checks>"], other["result"], other["classification"]),
        command_record("windows-mount-rejection", ["findmnt", "-n", "-o", "FSTYPE", "-T", "<windows-staging>"], "pass", f"filesystem={windows_fs} acl-evidence-rejected"),
        command_record("runtime-owned-cleanup", ["python3", "scripts/preflight/runtime_acl_probe.py", "<owned-cleanup>"], cleanup["result"], cleanup["classification"]),
    ]
    return profile, commands


def build_environment(root: Path, details_path: Path, profile: dict[str, Any], commands: list[dict[str, Any]]) -> dict[str, Any]:
    node_command, node_text = preflight._run(["node", "--version"])
    node_version = node_text.removeprefix("v") or None
    checks = [
        {"id": "p0-t0e-runtime-owner-mode", "result": profile["runtime"]["result"], "classification": f"{profile['runtime']['classification']} mode={profile['runtime']['rootMode']}/{profile['runtime']['taskDirectoryMode']}/{profile['runtime']['fixtureMode']}", "evidenceRefs": [f"artifact:{details_path.as_posix()}"]},
        {"id": "p0-t0e-other-subject-refusal", "result": profile["otherSubject"]["result"], "classification": f"{profile['otherSubject']['classification']} uid={profile['otherSubject']['observedUid']}", "evidenceRefs": [f"artifact:{details_path.as_posix()}"]},
        {"id": "p0-t0e-windows-mount-rejection", "result": profile["windowsMount"]["result"], "classification": f"{profile['windowsMount']['classification']} filesystem={profile['windowsMount']['filesystemType']}", "evidenceRefs": [f"artifact:{details_path.as_posix()}"]},
        {"id": "p0-t0e-cleanup", "result": profile["cleanup"]["result"], "classification": profile["cleanup"]["classification"], "evidenceRefs": [f"artifact:{details_path.as_posix()}"]},
    ]
    if node_command["result"] != "pass" or node_version != NODE_VERSION:
        checks.append({"id": "p0-t0e-node-baseline", "result": "fail", "classification": f"node={node_version}", "evidenceRefs": [f"artifact:{details_path.as_posix()}"]})
    environment = {
        "schemaVersion": preflight.SCHEMA_VERSION,
        "taskId": TASK_ID,
        "runId": profile["runId"],
        "recordedAt": profile["recordedAt"],
        "contractIds": [preflight.CONTRACT_ID],
        "executionProfile": {"name": "WSL ext4 owner-private runtime ACL probe", "canonicalGitRoot": str(root), "projectRoot": ".", "filesystemType": "ext4", "runnerOwner": pwd.getpwuid(os.geteuid()).pw_name, "tier1BrowserOwner": "Windows Edge Stable; browser not launched for ACL-only gate"},
        "commands": [node_command, *commands],
        "tools": {
            "node": {"exactVersion": NODE_VERSION, "observedVersion": node_version, "versionCommand": ["node", "--version"], "selectionSource": f"https://nodejs.org/en/blog/release/v{NODE_VERSION}", "result": "pass" if node_version == NODE_VERSION else "fail"},
            "pnpm": {"exactVersion": PNPM_VERSION, "observedVersion": None, "versionCommand": ["pnpm", "--version"], "activationCommand": ["corepack", "prepare", f"pnpm@{PNPM_VERSION}", "--activate"], "selectionSource": f"https://github.com/pnpm/pnpm/releases/tag/v{PNPM_VERSION}", "result": "selected"},
        },
        "checks": checks,
        "artifacts": [preflight._artifact(root, details_path.as_posix()), preflight._artifact(root, "scripts/preflight/runtime_acl_probe.py"), preflight._artifact(root, "scripts/preflight/evidence.schema.json"), preflight._artifact(root, "docs/adr/0001-edge-execution-preflight.md")],
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
    root = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True, timeout=10).stdout.strip()).resolve()
    if Path.cwd().resolve() != root:
        raise RuntimeAclError("canonical-root-required")
    profile, commands = run_profile(args.run_id)
    args.details.parent.mkdir(parents=True, exist_ok=True)
    args.details.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    environment = build_environment(root, args.details, profile, commands)
    args.output.write_text(json.dumps(environment, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"P0_T0E_RUNTIME_ACL={profile['overall']}")
    return 0 if profile["overall"] == "pass" and environment["overall"] == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main())
