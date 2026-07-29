from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

PREFLIGHT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PREFLIGHT_ROOT.parents[1]
sys.path.insert(0, str(PREFLIGHT_ROOT))

import playwright_probe  # noqa: E402


def discovery() -> dict:
    return {
        "interop": {
            "result": "pass",
            "classification": "direct-exe-inline-powershell",
            "powershellVersion": "5.1.26100.1",
            "windowsVersion": "Microsoft Windows NT 10.0.26200.0",
            "scriptExecutionPolicy": "Restricted",
        },
        "binary": {
            "result": "pass",
            "classification": "edge-stable-binary",
            "location": "program-files-x86",
            "productVersion": "150.0.4078.105",
        },
        "policy": {
            "result": "pass",
            "classification": "unmanaged",
            "keyCount": 0,
            "propertyCount": 0,
            "readErrorCount": 0,
            "relevant": [],
        },
    }


def mode(name: str) -> dict:
    return {
        "schemaVersion": playwright_probe.RUNNER_SCHEMA,
        "result": "pass",
        "classification": "msedge-channel-sentinel",
        "mode": name,
        "channel": "msedge",
        "nodeVersion": playwright_probe.NODE_VERSION,
        "playwrightVersion": playwright_probe.PLAYWRIGHT_VERSION,
        "browserVersion": "150.0.4078.105",
        "sentinelObserved": True,
        "sandboxBypassRemoved": True,
    }


def valid_profile() -> dict:
    return {
        "schemaVersion": playwright_probe.PROFILE_SCHEMA,
        "taskId": playwright_probe.TASK_ID,
        "runId": "20260729T110955+0800",
        "recordedAt": "2026-07-29T11:09:55+08:00",
        "toolchain": {
            "result": "pass",
            "nodeVersion": playwright_probe.NODE_VERSION,
            "playwrightVersion": playwright_probe.PLAYWRIGHT_VERSION,
            "packageLicense": "Apache-2.0",
            "channel": "msedge",
            "portableNodeSha256": "a" * 64,
            "officialChecksumVerified": True,
        },
        "discovery": discovery(),
        "modes": [mode("headless"), mode("headed")],
        "cleanup": {
            "result": "pass",
            "classification": "clean-exit",
            "residualBeforeCleanup": 0,
            "residualAfterCleanup": 0,
            "profilesRemoved": True,
            "stagingRemoved": True,
        },
        "overall": "pass",
    }


class ProfileValidationTests(unittest.TestCase):
    def test_valid_profile_passes(self) -> None:
        playwright_probe.validate_profile(valid_profile())

    def test_both_modes_are_required(self) -> None:
        profile = valid_profile()
        profile["modes"] = [mode("headless"), mode("headless")]
        with self.assertRaisesRegex(playwright_probe.PlaywrightProbeError, "duplicate"):
            playwright_probe.validate_profile(profile)

    def test_channel_and_versions_are_exact(self) -> None:
        profile = valid_profile()
        profile["modes"][0]["channel"] = "chromium"
        with self.assertRaisesRegex(playwright_probe.PlaywrightProbeError, "channel"):
            playwright_probe.validate_profile(profile)
        profile = valid_profile()
        profile["toolchain"]["playwrightVersion"] = "1.62.1"
        with self.assertRaisesRegex(playwright_probe.PlaywrightProbeError, "metadata"):
            playwright_probe.validate_profile(profile)

    def test_browser_identity_must_match_discovery(self) -> None:
        profile = valid_profile()
        profile["modes"][0]["browserVersion"] = "149.0.0.0"
        with self.assertRaisesRegex(playwright_probe.PlaywrightProbeError, "differs"):
            playwright_probe.validate_profile(profile)

    def test_policy_and_cleanup_fail_closed(self) -> None:
        profile = valid_profile()
        profile["discovery"]["policy"]["relevant"] = [{
            "name": "RemoteDebuggingAllowed", "scope": "machine", "numericValue": 0,
            "valueClass": "numeric",
        }]
        with self.assertRaisesRegex(ValueError, "restrictive policy"):
            playwright_probe.validate_profile(profile)
        profile = valid_profile()
        profile["cleanup"]["residualAfterCleanup"] = 1
        with self.assertRaisesRegex(playwright_probe.PlaywrightProbeError, "residue"):
            playwright_probe.validate_profile(profile)

    def test_sandbox_bypass_and_secrets_are_rejected(self) -> None:
        profile = valid_profile()
        profile["modes"][0]["sandboxBypassRemoved"] = False
        with self.assertRaisesRegex(playwright_probe.PlaywrightProbeError, "sandbox"):
            playwright_probe.validate_profile(profile)
        profile = valid_profile()
        profile["authToken"] = "opaque"
        with self.assertRaisesRegex(ValueError, "secret-bearing key"):
            playwright_probe.validate_profile(profile)

    def test_runner_parser_requires_one_bounded_json_line(self) -> None:
        encoded = json.dumps(mode("headless"))
        self.assertEqual(playwright_probe.parse_runner_output(encoded)["result"], "pass")
        with self.assertRaisesRegex(playwright_probe.PlaywrightProbeError, "exactly one"):
            playwright_probe.parse_runner_output(encoded + "\n" + encoded)


class StaticRunnerBoundaryTests(unittest.TestCase):
    def test_runner_uses_msedge_and_removes_no_sandbox(self) -> None:
        source = (REPOSITORY_ROOT / "scripts/preflight/playwright_windows_runner.mjs").read_text(encoding="utf-8")
        self.assertIn('channel: "msedge"', source)
        self.assertIn('ignoreDefaultArgs: ["--no-sandbox"]', source)
        self.assertNotIn("executablePath:", source)
        self.assertNotIn("connectOverCDP", source)
        self.assertNotIn("remote-debugging-port", source)


if __name__ == "__main__":
    unittest.main()
