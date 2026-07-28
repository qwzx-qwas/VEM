from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

PREFLIGHT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PREFLIGHT_ROOT.parents[1]
sys.path.insert(0, str(PREFLIGHT_ROOT))

import edge_probe  # noqa: E402


def valid_adapter() -> dict:
    return {
        "schemaVersion": edge_probe.ADAPTER_SCHEMA,
        "interop": {
            "result": "pass",
            "classification": "powershell-interop",
            "powershellVersion": "5.1.26100.8655",
            "windowsVersion": "Microsoft Windows NT 10.0.26200.0",
            "scriptExecutionPolicy": "Restricted",
        },
        "binary": {
            "result": "pass",
            "classification": "edge-stable-binary",
            "location": "program-files-x86",
            "productVersion": "150.0.4078.99",
        },
        "policy": {
            "result": "pass",
            "classification": "unmanaged",
            "keyCount": 0,
            "propertyCount": 0,
            "readErrorCount": 0,
            "relevant": [],
        },
        "launch": {
            "result": "pass",
            "classification": "direct-headless-dump-dom",
            "exitCode": 0,
            "timedOut": False,
            "sentinelObserved": True,
            "stdoutBytes": 112,
            "stderrBytes": 0,
        },
        "cleanup": {
            "result": "pass",
            "classification": "clean-exit",
            "residualBeforeCleanup": 0,
            "residualAfterCleanup": 0,
            "profileRemoved": True,
        },
        "overall": "pass",
    }


def valid_profile() -> dict:
    return {
        "schemaVersion": edge_probe.PROFILE_SCHEMA,
        "taskId": edge_probe.TASK_ID,
        "runId": "20260728T204048+0800",
        "recordedAt": "2026-07-28T20:40:48+08:00",
        "adapter": valid_adapter(),
        "overall": "pass",
    }


def valid_discovery_bytes() -> bytes:
    adapter = valid_adapter()
    return (json.dumps({
        "interop": adapter["interop"],
        "binary": adapter["binary"],
        "policy": adapter["policy"],
        "windowsTemp": r"C:\Temp",
    }) + "\n").encode("utf-8")


class AdapterValidationTests(unittest.TestCase):
    def test_valid_adapter_and_profile_pass(self) -> None:
        edge_probe.validate_adapter(valid_adapter())
        edge_probe.validate_profile(valid_profile())

    def test_missing_binary_is_distinct_fail(self) -> None:
        adapter = valid_adapter()
        adapter["binary"] = {
            "result": "fail",
            "classification": "edge-binary-missing",
            "location": None,
            "productVersion": None,
        }
        adapter["launch"] = {
            "result": "not-run",
            "classification": "binary-not-ready",
            "exitCode": None,
            "timedOut": False,
            "sentinelObserved": False,
            "stdoutBytes": 0,
            "stderrBytes": 0,
        }
        adapter["overall"] = "fail"
        edge_probe.validate_adapter(adapter)

    def test_restrictive_policy_must_fail_closed(self) -> None:
        adapter = valid_adapter()
        adapter["policy"] = {
            "result": "pass",
            "classification": "managed-no-relevant-block",
            "keyCount": 1,
            "propertyCount": 1,
            "readErrorCount": 0,
            "relevant": [{
                "name": "RemoteDebuggingAllowed",
                "scope": "machine",
                "numericValue": 0,
                "valueClass": "numeric",
            }],
        }
        with self.assertRaisesRegex(edge_probe.EdgeProbeError, "restrictive policy"):
            edge_probe.validate_adapter(adapter)
        adapter["policy"]["result"] = "fail"
        adapter["policy"]["classification"] = "automation-restricted"
        adapter["overall"] = "fail"
        edge_probe.validate_adapter(adapter)

    def test_non_numeric_relevant_policy_is_blocked(self) -> None:
        adapter = valid_adapter()
        adapter["policy"] = {
            "result": "pass",
            "classification": "managed-no-relevant-block",
            "keyCount": 1,
            "propertyCount": 1,
            "readErrorCount": 0,
            "relevant": [{
                "name": "DeveloperToolsAvailability",
                "scope": "user",
                "numericValue": None,
                "valueClass": "non-numeric",
            }],
        }
        with self.assertRaisesRegex(edge_probe.EdgeProbeError, "indeterminate policy"):
            edge_probe.validate_adapter(adapter)
        adapter["policy"]["result"] = "blocked"
        adapter["policy"]["classification"] = "policy-value-indeterminate"
        adapter["overall"] = "blocked"
        edge_probe.validate_adapter(adapter)

    def test_direct_launch_nonzero_is_classified(self) -> None:
        adapter = valid_adapter()
        adapter["launch"].update({
            "result": "fail",
            "classification": "launch-nonzero",
            "exitCode": 1,
            "sentinelObserved": False,
        })
        adapter["overall"] = "fail"
        edge_probe.validate_adapter(adapter)

    def test_timeout_requires_timeout_classification(self) -> None:
        adapter = valid_adapter()
        adapter["launch"].update({
            "result": "blocked",
            "classification": "launch-exception",
            "exitCode": None,
            "timedOut": True,
            "sentinelObserved": False,
        })
        adapter["overall"] = "blocked"
        with self.assertRaisesRegex(edge_probe.EdgeProbeError, "timed out launch"):
            edge_probe.validate_adapter(adapter)
        adapter["launch"]["classification"] = "launch-timeout"
        edge_probe.validate_adapter(adapter)

    def test_passing_launch_requires_dom_sentinel(self) -> None:
        adapter = valid_adapter()
        adapter["launch"]["sentinelObserved"] = False
        with self.assertRaisesRegex(edge_probe.EdgeProbeError, "exit/DOM evidence"):
            edge_probe.validate_adapter(adapter)

    def test_passing_cleanup_rejects_profile_or_process_residue(self) -> None:
        adapter = valid_adapter()
        adapter["cleanup"]["residualAfterCleanup"] = 1
        with self.assertRaisesRegex(edge_probe.EdgeProbeError, "cleanup has residue"):
            edge_probe.validate_adapter(adapter)
        adapter = valid_adapter()
        adapter["cleanup"]["profileRemoved"] = False
        with self.assertRaisesRegex(edge_probe.EdgeProbeError, "cleanup has residue"):
            edge_probe.validate_adapter(adapter)

    def test_overall_mismatch_and_secret_key_fail_closed(self) -> None:
        adapter = valid_adapter()
        adapter["overall"] = "blocked"
        with self.assertRaisesRegex(edge_probe.EdgeProbeError, "machine-derived pass"):
            edge_probe.validate_adapter(adapter)
        adapter = valid_adapter()
        adapter["policy"]["authToken"] = "opaque"
        with self.assertRaisesRegex(ValueError, "secret-bearing key"):
            edge_probe.validate_adapter(adapter)


class AdapterExecutionTests(unittest.TestCase):
    def test_parse_requires_exactly_one_json_line(self) -> None:
        encoded = json.dumps(valid_adapter())
        parsed = edge_probe.parse_adapter_output(encoded)
        self.assertEqual(parsed["overall"], "pass")
        self.assertEqual(edge_probe.decode_adapter_stdout(encoded.encode("utf-8")), encoded)
        self.assertEqual(edge_probe.decode_adapter_stdout(encoded.encode("utf-16")), encoded)
        with self.assertRaisesRegex(edge_probe.EdgeProbeError, "exactly one JSON line"):
            edge_probe.parse_adapter_output("warning\n" + json.dumps(valid_adapter()))
        with self.assertRaisesRegex(edge_probe.EdgeProbeError, "not JSON"):
            edge_probe.parse_adapter_output("not-json")

    def test_wslpath_failure_is_machine_classified_without_cleanup_claim(self) -> None:
        discovered = SimpleNamespace(returncode=0, stdout=valid_discovery_bytes(), stderr=b"")
        with mock.patch.object(edge_probe.subprocess, "run", side_effect=[discovered, FileNotFoundError()]):
            adapter, commands = edge_probe.run_adapter(REPOSITORY_ROOT, 5)
        self.assertEqual(adapter["launch"]["classification"], "windows-temp-conversion-failed")
        self.assertEqual(adapter["cleanup"]["result"], "pass")
        self.assertEqual(commands[-1]["result"], "blocked")

    @mock.patch.object(edge_probe, "windows_temp_base_allowed", return_value=True)
    def test_direct_edge_timeout_is_cleaned_and_classified(self, _allowed: mock.Mock) -> None:
        discovered = SimpleNamespace(returncode=0, stdout=valid_discovery_bytes(), stderr=b"")
        timeout = subprocess.TimeoutExpired(["msedge.exe"], 5, output=b"", stderr=b"")
        cleanup = SimpleNamespace(returncode=0, stdout=b"{\"before\":1,\"after\":0}\n", stderr=b"")
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            fake_edge = base / "msedge.exe"
            fake_edge.write_bytes(b"fixture")
            converted_temp = SimpleNamespace(returncode=0, stdout=str(base) + "\n", stderr="")
            profile_conversion = SimpleNamespace(
                returncode=0, stdout="C:" + chr(92) + "Temp" + chr(92) + "profile" + chr(10), stderr=""
            )
            html_conversion = SimpleNamespace(
                returncode=0, stdout="C:" + chr(92) + "Temp" + chr(92) + "sentinel.html" + chr(10), stderr=""
            )
            with mock.patch.object(edge_probe, "EDGE_PATHS", {"program-files-x86": fake_edge}):
                with mock.patch.object(
                    edge_probe.subprocess,
                    "run",
                    side_effect=[discovered, converted_temp, profile_conversion, html_conversion, timeout, cleanup],
                ):
                    adapter, commands = edge_probe.run_adapter(REPOSITORY_ROOT, 5)
        self.assertEqual(adapter["launch"]["classification"], "launch-timeout")
        self.assertTrue(adapter["launch"]["timedOut"])
        self.assertEqual(adapter["cleanup"]["classification"], "owned-residue-terminated")
        self.assertTrue(adapter["cleanup"]["profileRemoved"])
        self.assertEqual(adapter["overall"], "blocked")
        self.assertEqual(
            [command["id"] for command in commands],
            ["windows-edge-policy-discovery", "windows-edge-direct-smoke", "windows-edge-owned-process-cleanup"],
        )
        self.assertEqual(commands[1]["result"], "blocked")

    def test_malformed_discovery_output_is_blocked(self) -> None:
        completed = SimpleNamespace(returncode=0, stdout=b"warning\n{}\n", stderr=b"")
        with mock.patch.object(edge_probe.subprocess, "run", return_value=completed):
            adapter, commands = edge_probe.run_adapter(REPOSITORY_ROOT, 5)
        self.assertEqual(adapter["interop"]["classification"], "powershell-discovery-invalid")
        self.assertEqual(adapter["overall"], "blocked")
        self.assertEqual(commands[0]["stdoutSummary"], "powershell-discovery-invalid")

    @mock.patch.object(edge_probe, "windows_temp_base_allowed", return_value=True)
    def test_valid_direct_edge_output_is_accepted_and_cleaned(self, _allowed: mock.Mock) -> None:
        discovered = SimpleNamespace(returncode=0, stdout=valid_discovery_bytes(), stderr=b"")
        completed = SimpleNamespace(
            returncode=0,
            stdout=("<main>" + edge_probe.SENTINEL + "</main>").encode("utf-8"),
            stderr=b"",
        )
        cleanup = SimpleNamespace(returncode=0, stdout=b"{\"before\":0,\"after\":0}\n", stderr=b"")
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            fake_edge = base / "msedge.exe"
            fake_edge.write_bytes(b"fixture")
            converted_temp = SimpleNamespace(returncode=0, stdout=str(base) + "\n", stderr="")
            profile_conversion = SimpleNamespace(
                returncode=0, stdout="C:" + chr(92) + "Temp" + chr(92) + "profile" + chr(10), stderr=""
            )
            html_conversion = SimpleNamespace(
                returncode=0, stdout="C:" + chr(92) + "Temp" + chr(92) + "sentinel.html" + chr(10), stderr=""
            )
            with mock.patch.object(edge_probe, "EDGE_PATHS", {"program-files-x86": fake_edge}):
                with mock.patch.object(
                    edge_probe.subprocess,
                    "run",
                    side_effect=[discovered, converted_temp, profile_conversion, html_conversion, completed, cleanup],
                ):
                    adapter, commands = edge_probe.run_adapter(REPOSITORY_ROOT, 5)
        self.assertEqual(adapter["overall"], "pass")
        self.assertTrue(adapter["cleanup"]["profileRemoved"])
        self.assertEqual(
            [command["id"] for command in commands],
            ["windows-edge-policy-discovery", "windows-edge-direct-smoke", "windows-edge-owned-process-cleanup"],
        )
        self.assertEqual(commands[1]["result"], "pass")


class EvidenceAndStaticBoundaryTests(unittest.TestCase):
    def test_shared_environment_builds_without_pnpm_execution(self) -> None:
        node_command = {
            "id": "node-probe",
            "argv": ["node", "--version"],
            "exitCode": 0,
            "result": "pass",
            "stdoutSummary": "v24.18.0",
            "stderrSummary": None,
        }
        profile = valid_profile()
        edge_commands = [edge_probe.direct_command("pass", "direct-headless-dump-dom", 0)]

        def fake_artifact(_root: Path, relative: str) -> dict[str, str]:
            return {"path": relative, "sha256": "0" * 64}

        with mock.patch.object(edge_probe.preflight, "_run", return_value=(node_command, "v24.18.0")):
            with mock.patch.object(edge_probe.preflight, "_artifact", side_effect=fake_artifact):
                environment = edge_probe.build_environment(
                    REPOSITORY_ROOT,
                    Path("docs/test-evidence/P0-T0/details.json"),
                    profile,
                    edge_commands,
                )
        self.assertEqual(environment["overall"], "pass")
        self.assertEqual(environment["tools"]["pnpm"]["result"], "selected")
        self.assertIsNone(environment["tools"]["pnpm"]["observedVersion"])

    def test_powershell_adapter_has_bounded_profile_and_cleanup_guards(self) -> None:
        source = (PREFLIGHT_ROOT / "edge_probe.py").read_text(encoding="utf-8")
        for required in [
            "--headless=new",
            "--dump-dom",
            "--user-data-dir=",
            "taskkill.exe",
            "Get-CimInstance Win32_Process",
            "shutil.rmtree(temp_root)",
            "Registry::HKEY_LOCAL_MACHINE",
            "Registry::HKEY_CURRENT_USER",
            "RemoteDebuggingAllowed",
            "DeveloperToolsAvailability",
        ]:
            self.assertIn(required, source)
        self.assertNotIn("--no-sandbox", source)
        self.assertNotIn("--remote-debugging-port", source)
        self.assertNotIn("-ExecutionPolicy Bypass", source)
        self.assertNotIn("edge_smoke.ps1", source)


if __name__ == "__main__":
    unittest.main()
