from __future__ import annotations

import copy
import json
from pathlib import Path
import shutil
import socket
import ssl
import sys
import tempfile
import unittest
from unittest import mock
import urllib.error

PREFLIGHT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PREFLIGHT_ROOT.parents[1]
sys.path.insert(0, str(PREFLIGHT_ROOT))

import profile_probe  # noqa: E402


def valid_profile() -> dict:
    samples = {
        "create": [1.0, 2.0, 3.0],
        "modify": [1.5, 2.5, 3.5],
        "rename": [2.0, 3.0, 4.0],
    }
    combined = [value for values in samples.values() for value in values]
    return {
        "schemaVersion": profile_probe.PROFILE_SCHEMA,
        "taskId": profile_probe.TASK_ID,
        "runId": "20260728T195939+0800",
        "recordedAt": "2026-07-28T19:59:39+08:00",
        "registry": {
            "result": "pass",
            "classification": "https-default-ca",
            "httpStatus": 200,
            "responseBytes": 100,
            "responseSha256": "0" * 64,
            "observedVersion": profile_probe.PNPM_VERSION,
            "proxy": {"httpConfigured": False, "httpsConfigured": False, "noProxyConfigured": True},
            "defaultCaFileAvailable": True,
            "defaultCaPathAvailable": True,
        },
        "filesystem": {
            "filesystemType": "ext4",
            "availableBytes": 1_000_000_000,
            "caseSensitive": True,
            "symlinkSupported": True,
            "longPathSupported": True,
            "result": "pass",
        },
        "pnpm": {
            "result": "pass",
            "activation": {"exitCode": 0, "result": "pass", "classification": "pass"},
            "version": {"exitCode": 0, "result": "pass", "classification": "pass", "observed": profile_probe.PNPM_VERSION},
            "lockfile": {"exitCode": 0, "result": "pass", "classification": "pass", "sha256": "1" * 64},
            "frozenInstall": {"exitCode": 0, "result": "pass", "classification": "pass"},
            "dependency": {"name": "is-number", "expectedVersion": "7.0.0", "observedVersion": "7.0.0"},
        },
        "watcher": {
            "schemaVersion": "P0-T0B-watch-v1",
            "provider": "node:fs.watch",
            "polling": False,
            "iterations": 3,
            "timeoutMs": 3000,
            "samplesMs": samples,
            "p50Ms": profile_probe.percentile(combined, 0.5),
            "p95Ms": profile_probe.percentile(combined, 0.95),
            "eventCount": 9,
            "result": "pass",
            "classification": "native-watch-events",
        },
        "cleanup": "pass",
        "overall": "pass",
    }


class ClassificationTests(unittest.TestCase):
    def test_percentiles_use_nearest_rank(self) -> None:
        values = [9.0, 1.0, 5.0, 3.0, 7.0]
        self.assertEqual(profile_probe.percentile(values, 0.5), 5.0)
        self.assertEqual(profile_probe.percentile(values, 0.95), 9.0)

    def test_dns_tls_proxy_timeout_are_distinct(self) -> None:
        dns = urllib.error.URLError(socket.gaierror(-2, "Name or service not known"))
        tls = urllib.error.URLError(ssl.SSLCertVerificationError("certificate verify failed"))
        proxy = urllib.error.URLError("Tunnel connection failed: proxy")
        timeout = urllib.error.URLError(socket.timeout("timed out"))
        self.assertEqual(profile_probe.classify_network_error(dns), "dns")
        self.assertEqual(profile_probe.classify_network_error(tls), "tls-ca")
        self.assertEqual(profile_probe.classify_network_error(proxy), "proxy")
        self.assertEqual(profile_probe.classify_network_error(timeout), "timeout")

    def test_process_failures_are_machine_classified(self) -> None:
        self.assertEqual(profile_probe.classify_process_failure("getaddrinfo ENOTFOUND"), "dns")
        self.assertEqual(profile_probe.classify_process_failure("certificate verify failed"), "tls-ca")
        self.assertEqual(profile_probe.classify_process_failure("ERR_PNPM_TARBALL_INTEGRITY"), "integrity")
        self.assertEqual(profile_probe.classify_process_failure("frozen lockfile mismatch"), "frozen-lockfile")
        self.assertEqual(profile_probe.classify_process_failure("", timed_out=True), "timeout")

    def test_proxy_credentials_are_never_serialized(self) -> None:
        profile = profile_probe.proxy_profile({
            "http": "http://user:password@proxy.invalid:8080",
            "https": "https://token@proxy.invalid:8443",
            "no": "127.0.0.1",
        })
        encoded = json.dumps(profile)
        self.assertEqual(profile, {"httpConfigured": True, "httpsConfigured": True, "noProxyConfigured": True})
        self.assertNotIn("proxy.invalid", encoded)
        self.assertNotIn("password", encoded)
        self.assertNotIn("token", encoded)


class ProfileValidationTests(unittest.TestCase):
    def test_valid_profile_passes(self) -> None:
        profile_probe.validate_profile(valid_profile())

    def test_secret_key_fails_closed(self) -> None:
        profile = valid_profile()
        profile["registry"]["authToken"] = "opaque"
        with self.assertRaisesRegex(ValueError, "secret-bearing key"):
            profile_probe.validate_profile(profile)

    def test_polling_watcher_is_forbidden(self) -> None:
        profile = valid_profile()
        profile["watcher"]["polling"] = True
        with self.assertRaisesRegex(profile_probe.ProfileError, "polling=false"):
            profile_probe.validate_profile(profile)

    def test_missing_watcher_category_is_rejected(self) -> None:
        profile = valid_profile()
        del profile["watcher"]["samplesMs"]["rename"]
        with self.assertRaisesRegex(profile_probe.ProfileError, "categories are incomplete"):
            profile_probe.validate_profile(profile)

    def test_incorrect_percentile_is_rejected(self) -> None:
        profile = valid_profile()
        profile["watcher"]["p95Ms"] = 999.0
        with self.assertRaisesRegex(profile_probe.ProfileError, "p95 does not match"):
            profile_probe.validate_profile(profile)

    def test_component_failure_cannot_keep_overall_pass(self) -> None:
        profile = valid_profile()
        profile["filesystem"]["result"] = "fail"
        with self.assertRaisesRegex(profile_probe.ProfileError, "machine-derived fail"):
            profile_probe.validate_profile(profile)

    def test_unknown_top_level_key_is_rejected(self) -> None:
        profile = valid_profile()
        profile["unexpected"] = True
        with self.assertRaisesRegex(profile_probe.ProfileError, "keys mismatch"):
            profile_probe.validate_profile(profile)


class RealFilesystemTests(unittest.TestCase):
    def test_canonical_ext4_case_symlink_and_long_path(self) -> None:
        result, fixture = profile_probe.probe_filesystem(REPOSITORY_ROOT)
        try:
            self.assertEqual(result["filesystemType"], "ext4")
            self.assertTrue(result["caseSensitive"])
            self.assertTrue(result["symlinkSupported"])
            self.assertTrue(result["longPathSupported"])
            self.assertEqual(result["result"], "pass")
        finally:
            shutil.rmtree(fixture)
        self.assertFalse(fixture.exists())


class PnpmIsolationTests(unittest.TestCase):
    def test_corepack_home_is_merged_without_mutating_caller_environment(self) -> None:
        completed = mock.Mock(returncode=0, stdout="10.34.0\n", stderr="")
        isolated = {"COREPACK_HOME": "/tmp/vem-isolated-corepack"}
        with mock.patch.object(profile_probe.subprocess, "run", return_value=completed) as run:
            result = profile_probe.run_command(
                ["corepack", "pnpm", "--version"],
                cwd=REPOSITORY_ROOT,
                timeout=3,
                extra_env=isolated,
            )
        self.assertEqual(result["result"], "pass")
        self.assertEqual(run.call_args.kwargs["env"]["COREPACK_HOME"], isolated["COREPACK_HOME"])
        self.assertEqual(isolated, {"COREPACK_HOME": "/tmp/vem-isolated-corepack"})

    def test_activation_timeout_stops_follow_on_package_commands(self) -> None:
        blocked = {
            "argv": ["corepack", "prepare"],
            "exitCode": None,
            "result": "blocked",
            "classification": "timeout",
            "stdout": "",
            "stderr": "timeout",
        }
        with tempfile.TemporaryDirectory(dir=REPOSITORY_ROOT.parent) as directory:
            with mock.patch.object(profile_probe, "run_command", return_value=blocked) as run:
                result = profile_probe.probe_pnpm(REPOSITORY_ROOT, Path(directory))
        self.assertEqual(run.call_count, 1)
        self.assertEqual(result["result"], "blocked")
        self.assertEqual(result["version"]["result"], "not-run")
        self.assertEqual(result["frozenInstall"]["result"], "not-run")

    def test_main_cleans_fixture_after_blocked_package_probe(self) -> None:
        captured: dict[str, Path] = {}
        registry = copy.deepcopy(valid_profile()["registry"])
        watcher = copy.deepcopy(valid_profile()["watcher"])

        def blocked_package_probe(_root: Path, fixture: Path) -> dict:
            captured["fixture"] = fixture
            return profile_probe.blocked_pnpm_result(
                {
                    "exitCode": None,
                    "result": "blocked",
                    "classification": "timeout",
                },
                "activation-not-pass",
            )

        with tempfile.TemporaryDirectory(dir=REPOSITORY_ROOT) as directory:
            output_root = Path(directory)
            with mock.patch.object(profile_probe, "probe_registry", return_value=registry):
                with mock.patch.object(profile_probe, "probe_pnpm", side_effect=blocked_package_probe):
                    with mock.patch.object(profile_probe, "probe_watcher", return_value=watcher):
                        with mock.patch.object(profile_probe, "build_environment", return_value={"overall": "blocked"}):
                            exit_code = profile_probe.main([
                                "--run-id", "20260728T195939+0800",
                                "--details", str(output_root / "details.json"),
                                "--output", str(output_root / "environment.json"),
                            ])
        self.assertEqual(exit_code, 2)
        self.assertFalse(captured["fixture"].exists())

    def test_blocked_environment_uses_observations_without_rerunning_pnpm(self) -> None:
        profile = valid_profile()
        profile["pnpm"] = profile_probe.blocked_pnpm_result(
            {
                "exitCode": None,
                "result": "blocked",
                "classification": "timeout",
            },
            "activation-not-pass",
        )
        profile["overall"] = "blocked"
        node_probe = {
            "exitCode": 0,
            "result": "pass",
            "classification": "pass",
            "stdout": f"v{profile_probe.NODE_VERSION}\n",
        }

        def fake_artifact(_root: Path, relative: str) -> dict[str, str]:
            return {"path": relative, "sha256": "0" * 64}

        with mock.patch.object(profile_probe.preflight, "_artifact", side_effect=fake_artifact):
            with mock.patch.object(profile_probe.subprocess, "run", side_effect=AssertionError("must not rerun a tool")):
                evidence = profile_probe.build_environment(
                    REPOSITORY_ROOT,
                    Path("docs/test-evidence/P0-T0/details.json"),
                    profile,
                    node_probe,
                )
        self.assertEqual(evidence["overall"], "blocked")
        self.assertIsNone(evidence["tools"]["pnpm"]["observedVersion"])
        self.assertEqual(evidence["tools"]["pnpm"]["result"], "blocked")


if __name__ == "__main__":
    unittest.main()
