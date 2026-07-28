# ADR 0002: Bootstrap preflight aggregate verdict

- Status: Accepted
- Date: 2026-07-28
- Contract: `EDGE-PREFLIGHT-001`
- Verdict: `passed`
- Runner owner: `qwzx`
- Canonical Git root: `/home/qwzx/src/VEM` on ext4

## Decision

The P0 bootstrap preflight aggregate is `passed`. P0-T1 may create the exact-version workspace and repository validator. This verdict does not claim Playwright `channel: msedge`; that remains the separate P0-T0G gate after P0-T1.

The dependency-free aggregator consumes exactly these immutable runs: P0-T0A0 `20260728T155608+0800`, A1 `20260728T165102+0800`, A2 `20260728T194140+0800`, B `20260728T195939+0800`, C `20260728T204048+0800`, D `20260728T211720+0800`, and E `20260728T213829+0800`.

It verifies every input `SHA256SUMS` entry and required-file coverage; A0 readiness; A1 owner authorization, layout parent/parity and read-only cutover; the A2–E closed shared schema and repository artifact hashes; exact Node `24.18.0` and pnpm `10.34.0`; nondecreasing offset-aware timestamps; common canonical root, ext4 filesystem and runner owner; current roadmap completion; and that current HEAD descends from layout commit `5f55a3ff790c8751468e2262e58ef0d5dc72b5c4`.

The canonical JSON digest over the seven ordered input records is `1f77525ea06e3a1525cb54c8a3bd401d0753b8384a45970b930a0626d710d4ff`. This is hash-addressed evidence, not a digital signature; no signing key is claimed.

## Failure and rerun rule

Missing, malformed, duplicate, path-escaping, symlinked, tampered, mixed-verdict, wrong-root/owner/version, time-order, task-status or Git-ancestry evidence makes the aggregate `blocked`. Prior passing bundles remain immutable. Resolve the classified prerequisite and rerun only its owning P0-T0 task, then rerun P0-T0F; a human summary cannot upgrade the machine verdict.

Canonical rerun command:

```bash
python3 scripts/preflight/aggregate_probe.py --run-id '<YYYYMMDDTHHMMSS+ZZZZ>' --details 'docs/test-evidence/P0-T0/<run-id>/aggregate-results.json' --output 'docs/test-evidence/P0-T0/<run-id>/environment.json'
```

ADR 0001 remains unchanged because P0-T0A2–E evidence immutably hashes it. This result ADR is a new artifact of P0-T0F rather than a rewrite of upstream evidence history.
