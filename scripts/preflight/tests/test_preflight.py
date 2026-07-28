from __future__ import annotations

import copy
import json
import os
import pwd
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

PREFLIGHT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PREFLIGHT_ROOT.parents[1]
sys.path.insert(0, str(PREFLIGHT_ROOT))

import preflight  # noqa: E402


class EvidenceValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        fixture_root = Path(__file__).parent / "fixtures"
        cls.valid = json.loads((fixture_root / "valid-evidence.json").read_text(encoding="utf-8"))
        cls.invalid_secret_path = fixture_root / "invalid-secret.json"
        cls.invalid_range_path = fixture_root / "invalid-version-range.json"

    def test_valid_fixture_passes(self) -> None:
        preflight.validate_evidence(copy.deepcopy(self.valid))

    def test_registered_future_preflight_task_id_is_accepted(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["taskId"] = "P0-T0B"
        preflight.validate_evidence(evidence)

    def test_unknown_preflight_task_id_is_rejected(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["taskId"] = "P0-T999"
        with self.assertRaisesRegex(preflight.EvidenceError, "taskId must be one of"):
            preflight.validate_evidence(evidence)

    def test_secret_fixture_fails_closed(self) -> None:
        with self.assertRaisesRegex(preflight.EvidenceError, "secret-bearing key"):
            preflight.validate_evidence(preflight.load_json(self.invalid_secret_path))

    def test_version_range_fixture_fails_closed(self) -> None:
        with self.assertRaisesRegex(preflight.EvidenceError, "exact x.y.z"):
            preflight.validate_evidence(preflight.load_json(self.invalid_range_path))

    def test_bearer_value_is_rejected_even_under_innocent_key(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["checks"][0]["classification"] = "Bearer abc.def.ghi"
        with self.assertRaisesRegex(preflight.EvidenceError, "secret-like value"):
            preflight.validate_evidence(evidence)

    def test_credential_bearing_url_is_rejected(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["tools"]["pnpm"]["selectionSource"] = "https://user:pass@example.invalid/release"
        with self.assertRaisesRegex(preflight.EvidenceError, "secret-like value"):
            preflight.validate_evidence(evidence)

    def test_camel_case_secret_key_is_rejected(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["authToken"] = "opaque"
        with self.assertRaisesRegex(preflight.EvidenceError, "secret-bearing key"):
            preflight.validate_evidence(evidence)

    def test_recorded_at_requires_offset(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["recordedAt"] = "2026-07-28T17:30:00"
        with self.assertRaisesRegex(preflight.EvidenceError, "explicit UTC offset"):
            preflight.validate_evidence(evidence)

    def test_unknown_property_is_rejected(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["unexpected"] = True
        with self.assertRaisesRegex(preflight.EvidenceError, "keys mismatch"):
            preflight.validate_evidence(evidence)

    def test_non_24_node_baseline_is_rejected(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["tools"]["node"]["exactVersion"] = "22.12.0"
        evidence["tools"]["node"]["observedVersion"] = "22.12.0"
        with self.assertRaisesRegex(preflight.EvidenceError, "exact 24.x"):
            preflight.validate_evidence(evidence)

    def test_observed_pass_version_must_equal_exact_selection(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["tools"]["node"]["observedVersion"] = "24.17.0"
        with self.assertRaisesRegex(preflight.EvidenceError, "does not match"):
            preflight.validate_evidence(evidence)

    def test_pnpm_activation_must_embed_exact_version(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["tools"]["pnpm"]["activationCommand"][2] = "pnpm@10.33.0"
        with self.assertRaisesRegex(preflight.EvidenceError, "must embed"):
            preflight.validate_evidence(evidence)

    def test_overall_is_derived_from_checks(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["checks"][0]["result"] = "blocked"
        with self.assertRaisesRegex(preflight.EvidenceError, "machine-derived blocked"):
            preflight.validate_evidence(evidence)

    def test_artifact_path_traversal_is_rejected(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["artifacts"][0]["path"] = "../outside"
        with self.assertRaisesRegex(preflight.EvidenceError, "root-relative"):
            preflight.validate_evidence(evidence)

    def test_duplicate_json_key_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "duplicate.json"
            path.write_text('{"schemaVersion":"1.0.0","schemaVersion":"1.0.0"}', encoding="utf-8")
            with self.assertRaisesRegex(preflight.EvidenceError, "duplicate JSON key"):
                preflight.load_json(path)

    def test_artifact_hash_mismatch_is_rejected(self) -> None:
        evidence = copy.deepcopy(self.valid)
        evidence["artifacts"][0]["sha256"] = "0" * 64
        with self.assertRaisesRegex(preflight.EvidenceError, "hash mismatch"):
            preflight.verify_artifacts(evidence, REPOSITORY_ROOT)

    def test_depth_limit_is_fail_closed(self) -> None:
        evidence = copy.deepcopy(self.valid)
        nested: dict[str, object] = {}
        cursor = nested
        for index in range(14):
            child: dict[str, object] = {}
            cursor[f"level{index}"] = child
            cursor = child
        evidence["unexpected"] = nested
        with self.assertRaisesRegex(preflight.EvidenceError, "depth 12"):
            preflight.validate_evidence(evidence)

    def test_pnpm_probe_never_executes_activation_or_version_command(self) -> None:
        args = mock.Mock(node_version="24.18.0", pnpm_version="10.34.0", run_id="20260728T173000+0800")
        responses = [
            ({"id": "git-probe", "argv": ["git"], "exitCode": 0, "result": "pass", "stdoutSummary": str(REPOSITORY_ROOT), "stderrSummary": None}, str(REPOSITORY_ROOT)),
            ({"id": "node-probe", "argv": ["node"], "exitCode": 0, "result": "pass", "stdoutSummary": "v24.18.0", "stderrSummary": None}, "v24.18.0"),
            ({"id": "corepack-probe", "argv": ["corepack"], "exitCode": 0, "result": "pass", "stdoutSummary": "0.35.0", "stderrSummary": None}, "0.35.0"),
            ({"id": "findmnt-probe", "argv": ["findmnt"], "exitCode": 0, "result": "pass", "stdoutSummary": "ext4", "stderrSummary": None}, "ext4"),
        ]
        old_cwd = Path.cwd()
        try:
            import os
            os.chdir(REPOSITORY_ROOT)
            with mock.patch.object(preflight, "_run", side_effect=responses) as run:
                evidence = preflight.probe_toolchain(args)
        finally:
            os.chdir(old_cwd)
        called_argv = [call.args[0] for call in run.call_args_list]
        self.assertNotIn(["pnpm", "--version"], called_argv)
        self.assertFalse(any(argv[:2] == ["corepack", "prepare"] for argv in called_argv))
        self.assertEqual(evidence["tools"]["pnpm"]["result"], "selected")
        self.assertEqual(evidence["executionProfile"]["runnerOwner"], pwd.getpwuid(os.geteuid()).pw_name)
        self.assertTrue(evidence["tools"]["node"]["selectionSource"].endswith("v24.18.0"))
        self.assertTrue(evidence["tools"]["pnpm"]["selectionSource"].endswith("v10.34.0"))


class SchemaDocumentTests(unittest.TestCase):
    def test_schema_is_closed_and_versioned(self) -> None:
        schema = json.loads((PREFLIGHT_ROOT / "evidence.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], preflight.SCHEMA_VERSION)
        self.assertEqual(set(schema["properties"]["taskId"]["enum"]), preflight.ALLOWED_TASK_IDS)


if __name__ == "__main__":
    unittest.main()
