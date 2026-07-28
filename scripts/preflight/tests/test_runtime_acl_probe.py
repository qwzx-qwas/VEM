from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

PREFLIGHT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PREFLIGHT_ROOT))

import runtime_acl_probe  # noqa: E402


def valid_profile() -> dict:
    return {
        "schemaVersion": runtime_acl_probe.PROFILE_SCHEMA,
        "taskId": runtime_acl_probe.TASK_ID,
        "runId": "20260728T213829+0800",
        "recordedAt": "2026-07-28T21:38:29+08:00",
        "runtime": {
            "result": "pass",
            "classification": "ext4-owner-private-runtime",
            "selectionSource": "passwd-home-cache",
            "filesystemType": "ext4",
            "xdgCandidateFilesystemType": "not-set",
            "xdgCandidateClassification": "xdg-not-set",
            "deviceId": 2096,
            "ownerUid": 1000,
            "ownerGid": 1000,
            "rootMode": "0700",
            "taskDirectoryMode": "0700",
            "fixtureMode": "0600",
            "ownerRead": True,
            "ownerWrite": True,
            "rootPreserved": True,
        },
        "otherSubject": {
            "result": "pass",
            "classification": "real-nobody-access-denied",
            "provider": "wsl-root-drop-to-nobody",
            "observedUid": 65534,
            "traverseDenied": True,
            "readDenied": True,
            "writeDenied": True,
            "createDenied": True,
        },
        "windowsMount": {
            "result": "pass",
            "classification": "windows-mount-acl-evidence-rejected",
            "filesystemType": "9p",
            "aclEvidenceAccepted": False,
        },
        "cleanup": {
            "result": "pass",
            "classification": "idempotent-owned-cleanup",
            "firstPass": True,
            "secondPass": True,
            "fixtureRemoved": True,
            "taskDirectoryRemoved": True,
            "unexpectedEntryCount": 0,
            "runtimeRootPreserved": True,
        },
        "overall": "pass",
    }


class ProfileValidationTests(unittest.TestCase):
    def test_valid_profile_passes(self) -> None:
        runtime_acl_probe.validate_profile(valid_profile())

    def test_mode_drift_cannot_pass(self) -> None:
        for field, value in [("rootMode", "0755"), ("taskDirectoryMode", "0750"), ("fixtureMode", "0644")]:
            profile = valid_profile()
            profile["runtime"][field] = value
            with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "pass-without-private-evidence"):
                runtime_acl_probe.validate_profile(profile)

    def test_other_subject_denial_and_uid_are_required(self) -> None:
        profile = valid_profile()
        profile["otherSubject"]["readDenied"] = False
        with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "pass-without-denial"):
            runtime_acl_probe.validate_profile(profile)
        profile = valid_profile()
        profile["otherSubject"]["observedUid"] = 1000
        with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "pass-without-denial"):
            runtime_acl_probe.validate_profile(profile)

    def test_windows_mount_must_be_rejected(self) -> None:
        profile = valid_profile()
        profile["windowsMount"]["aclEvidenceAccepted"] = True
        with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "not-rejected"):
            runtime_acl_probe.validate_profile(profile)
        profile = valid_profile()
        profile["windowsMount"]["filesystemType"] = "ext4"
        with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "not-rejected"):
            runtime_acl_probe.validate_profile(profile)

    def test_cleanup_and_overall_mismatch_fail_closed(self) -> None:
        profile = valid_profile()
        profile["cleanup"]["secondPass"] = False
        with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "cleanup-pass-without-evidence"):
            runtime_acl_probe.validate_profile(profile)
        profile = valid_profile()
        profile["overall"] = "blocked"
        with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "overall-mismatch"):
            runtime_acl_probe.validate_profile(profile)

    def test_unknown_and_secret_fields_are_rejected(self) -> None:
        profile = valid_profile()
        profile["unknown"] = True
        with self.assertRaises(runtime_acl_probe.RuntimeAclError):
            runtime_acl_probe.validate_profile(profile)
        profile = valid_profile()
        profile["runtime"]["authToken"] = "opaque"
        with self.assertRaisesRegex(ValueError, "secret-bearing key"):
            runtime_acl_probe.validate_profile(profile)


class FilesystemAndCleanupTests(unittest.TestCase):
    def test_non_ext4_xdg_candidate_uses_explicit_home_fallback(self) -> None:
        owner = SimpleNamespace(pw_dir="/home/owner")
        with mock.patch.dict(os.environ, {"XDG_RUNTIME_DIR": "/run/user/1000"}, clear=True):
            with mock.patch.object(runtime_acl_probe.pwd, "getpwuid", return_value=owner):
                with mock.patch.object(runtime_acl_probe, "filesystem_type", return_value="tmpfs"):
                    with mock.patch.object(runtime_acl_probe, "contains_symlink", return_value=False):
                        root, source, filesystem, classification = runtime_acl_probe.select_runtime_root()
        self.assertEqual(root, Path("/home/owner/.cache/vem"))
        self.assertEqual((source, filesystem, classification), ("passwd-home-cache-after-xdg-non-ext4", "tmpfs", "xdg-non-ext4-rejected"))

    def test_windows_mounted_xdg_candidate_fails_without_fallback(self) -> None:
        with mock.patch.dict(os.environ, {"XDG_RUNTIME_DIR": "/mnt/d/runtime"}, clear=True):
            with mock.patch.object(runtime_acl_probe, "filesystem_type", return_value="9p"):
                with mock.patch.object(runtime_acl_probe, "contains_symlink", return_value=False):
                    with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "windows-mount-rejected"):
                        runtime_acl_probe.select_runtime_root()

    def test_fixture_creation_has_exact_modes_and_payload(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            os.chmod(root, 0o700)
            task_dir, fixture = runtime_acl_probe.create_fixture(root)
            self.assertEqual(stat.S_IMODE(task_dir.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(fixture.stat().st_mode), 0o600)
            self.assertEqual(fixture.read_bytes(), runtime_acl_probe.FIXTURE_BYTES)
            self.assertEqual(runtime_acl_probe.cleanup_fixture(root, task_dir, fixture)["result"], "pass")

    def test_cleanup_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            task_dir, fixture = runtime_acl_probe.create_fixture(root)
            first = runtime_acl_probe.cleanup_fixture(root, task_dir, fixture)
            second = runtime_acl_probe.cleanup_fixture(root, task_dir, fixture)
            self.assertEqual((first["result"], second["result"]), ("pass", "pass"))
            self.assertFalse(task_dir.exists())

    def test_stale_unknown_file_is_not_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            task_dir, fixture = runtime_acl_probe.create_fixture(root)
            stale = task_dir / "unexpected"
            stale.write_text("fixture", encoding="utf-8")
            result = runtime_acl_probe.cleanup_fixture(root, task_dir, fixture)
            self.assertEqual(result["classification"], "cleanup-unexpected-stale-entry")
            self.assertTrue(stale.exists())
            stale.unlink()
            task_dir.rmdir()

    def test_symlink_fixture_is_not_followed_or_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            task_dir = root / ".preflight-test"
            task_dir.mkdir()
            outside = root / "outside"
            outside.write_text("retain", encoding="utf-8")
            fixture = task_dir / runtime_acl_probe.FIXTURE_NAME
            fixture.symlink_to(outside)
            result = runtime_acl_probe.cleanup_fixture(root, task_dir, fixture)
            self.assertEqual(result["classification"], "cleanup-fixture-invalid")
            self.assertEqual(outside.read_text(encoding="utf-8"), "retain")
            fixture.unlink()
            task_dir.rmdir()

    def test_runtime_symlink_component_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            real = root / "real"
            real.mkdir()
            linked = root / "linked"
            linked.symlink_to(real, target_is_directory=True)
            self.assertTrue(runtime_acl_probe.contains_symlink(linked / "vem"))
            self.assertFalse(runtime_acl_probe.contains_symlink(real / "vem"))

    def test_wrong_owner_and_mode_are_distinct(self) -> None:
        wrong_owner = SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=2000)
        with mock.patch.object(Path, "lstat", return_value=wrong_owner):
            with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "owner-mismatch"):
                runtime_acl_probe.validate_private_directory(Path("/fixture"), 1000)
        wrong_mode = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=1000)
        with mock.patch.object(Path, "lstat", return_value=wrong_mode):
            with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "mode-not-private"):
                runtime_acl_probe.validate_private_directory(Path("/fixture"), 1000)


class OtherSubjectTests(unittest.TestCase):
    def test_real_subject_result_requires_all_denials(self) -> None:
        completed = [
            subprocess.CompletedProcess([], 0, b"65534\n", b""),
            subprocess.CompletedProcess([], 1, b"", b""),
            subprocess.CompletedProcess([], 1, b"", b""),
            subprocess.CompletedProcess([], 1, b"", b""),
            subprocess.CompletedProcess([], 1, b"", b""),
        ]
        with tempfile.TemporaryDirectory() as directory:
            task_dir = Path(directory) / ".preflight-test"
            task_dir.mkdir()
            fixture = task_dir / runtime_acl_probe.FIXTURE_NAME
            fixture.write_text("fixture", encoding="utf-8")
            with mock.patch.object(runtime_acl_probe, "run_as_nobody", side_effect=completed):
                result = runtime_acl_probe.verify_other_subject(task_dir, fixture)
        self.assertEqual(result["observedUid"], 65534)
        self.assertTrue(result["createDenied"])

    def test_allowed_or_ambiguous_subject_access_fails(self) -> None:
        identity = subprocess.CompletedProcess([], 0, b"65534\n", b"")
        allowed = subprocess.CompletedProcess([], 0, b"", b"")
        denied = subprocess.CompletedProcess([], 1, b"", b"")
        ambiguous = subprocess.CompletedProcess([], 127, b"", b"")
        with tempfile.TemporaryDirectory() as directory:
            task_dir = Path(directory) / ".preflight-test"
            task_dir.mkdir()
            fixture = task_dir / runtime_acl_probe.FIXTURE_NAME
            fixture.write_text("fixture", encoding="utf-8")
            with mock.patch.object(runtime_acl_probe, "run_as_nobody", side_effect=[identity, allowed, denied, denied, denied]):
                with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "access-allowed"):
                    runtime_acl_probe.verify_other_subject(task_dir, fixture)
            with mock.patch.object(runtime_acl_probe, "run_as_nobody", side_effect=[identity, ambiguous, denied, denied, denied]):
                with self.assertRaisesRegex(runtime_acl_probe.RuntimeAclError, "command-ambiguous"):
                    runtime_acl_probe.verify_other_subject(task_dir, fixture)


if __name__ == "__main__":
    unittest.main()
