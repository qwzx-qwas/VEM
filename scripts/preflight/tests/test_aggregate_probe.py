from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

PREFLIGHT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PREFLIGHT_ROOT.parents[1]
sys.path.insert(0, str(PREFLIGHT_ROOT))

import aggregate_probe  # noqa: E402


def write_bundle(directory: Path, name: str = "evidence.json", content: bytes = b"{}\n") -> None:
    (directory / name).write_bytes(content)
    digest = hashlib.sha256(content).hexdigest()
    (directory / "SHA256SUMS").write_text(f"{digest}  {name}\n", encoding="utf-8")


class ManifestTests(unittest.TestCase):
    def test_valid_manifest_and_required_coverage_pass(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_bundle(root)
            observed = aggregate_probe.verify_manifest(root, {"evidence.json"})
            self.assertEqual(observed, hashlib.sha256((root / "SHA256SUMS").read_bytes()).hexdigest())

    def test_missing_required_or_tampered_evidence_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_bundle(root)
            with self.assertRaisesRegex(aggregate_probe.AggregateError, "not-covered"):
                aggregate_probe.verify_manifest(root, {"missing.json"})
            (root / "evidence.json").write_text("tampered", encoding="utf-8")
            with self.assertRaisesRegex(aggregate_probe.AggregateError, "hash-mismatch"):
                aggregate_probe.verify_manifest(root, {"evidence.json"})

    def test_duplicate_traversal_and_malformed_lines_block(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_bundle(root)
            line = (root / "SHA256SUMS").read_text(encoding="utf-8")
            (root / "SHA256SUMS").write_text(line + line, encoding="utf-8")
            with self.assertRaisesRegex(aggregate_probe.AggregateError, "malformed-or-duplicate"):
                aggregate_probe.verify_manifest(root, {"evidence.json"})
            (root / "SHA256SUMS").write_text(f"{'0' * 64}  ../outside\n", encoding="utf-8")
            with self.assertRaisesRegex(aggregate_probe.AggregateError, "malformed-or-duplicate"):
                aggregate_probe.verify_manifest(root, set())

    def test_symlinked_manifest_target_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            outside = root / "outside"
            outside.write_text("fixture", encoding="utf-8")
            linked = root / "linked"
            linked.symlink_to(outside)
            digest = hashlib.sha256(outside.read_bytes()).hexdigest()
            (root / "SHA256SUMS").write_text(f"{digest}  linked\n", encoding="utf-8")
            with self.assertRaisesRegex(aggregate_probe.AggregateError, "missing-or-unsafe"):
                aggregate_probe.verify_manifest(root, {"linked"})


class AggregateTests(unittest.TestCase):
    def test_canonical_digest_is_deterministic_and_order_sensitive(self) -> None:
        records = [{"taskId": "A", "verdict": "pass"}, {"taskId": "B", "verdict": "pass"}]
        self.assertEqual(aggregate_probe.canonical_digest(records), aggregate_probe.canonical_digest(records))
        self.assertNotEqual(aggregate_probe.canonical_digest(records), aggregate_probe.canonical_digest(list(reversed(records))))

    def test_real_fixed_input_set_aggregates_passed(self) -> None:
        detail = aggregate_probe.build_detail(REPOSITORY_ROOT, "20260728T215135+0800")
        self.assertEqual(detail["overall"], "passed")
        self.assertEqual([item["taskId"] for item in detail["inputs"]], list(aggregate_probe.RUNS))
        self.assertEqual(detail["rerunTasks"], [])
        self.assertTrue(detail["current"]["layoutCommitAncestor"])

    def test_detail_digest_recomputes_exactly(self) -> None:
        detail = aggregate_probe.build_detail(REPOSITORY_ROOT, "20260728T215135+0800")
        self.assertEqual(detail["aggregateDigest"], aggregate_probe.canonical_digest(detail["inputs"]))


if __name__ == "__main__":
    unittest.main()
