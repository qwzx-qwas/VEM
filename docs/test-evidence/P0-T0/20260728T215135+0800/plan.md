# P0-T0F Atomic Plan

## Task identity and observable boundary

- ID/status: `P0-T0F` / `done`; phase `P0` / `in_progress`.
- Dependencies: P0-T0D and P0-T0E are `done`; all earlier P0-T0A0–C prerequisite evidence is also complete. No phase dependency or decision gate applies.
- Direct contract: `EDGE-PREFLIGHT-001`, mapped bidirectionally between `ROADMAP.yaml` and `docs/requirements.yaml`; authoritative text is `docs/DESIGN.md` sections 3.1 and 3.1.1 plus `docs/adr/0001-edge-execution-preflight.md`.
- Observable result: consume the immutable P0-T0A0, A1, A2, B, C, D and E evidence runs, verify their manifests/fields/ordering/current repository relationship, and emit the only machine-derived bootstrap aggregate verdict plus a human-readable rerun summary.

## Inputs and trust rules

- Required runs are fixed by task ID and canonical run directory, not selected by newest filename: A0 `20260728T155608+0800`, A1 `20260728T165102+0800`, A2 `20260728T194140+0800`, B `20260728T195939+0800`, C `20260728T204048+0800`, D `20260728T211720+0800`, E `20260728T213829+0800`.
- Every `SHA256SUMS` is parsed as a closed relative-basename manifest with unique entries and lowercase SHA-256, and every listed file is rehashed. Required files must be covered; missing, extra traversal, duplicate, malformed, symlink, tampered or unlisted required evidence blocks aggregation.
- A0 must retain its pre-schema `ready` classification and source baseline; A1 must prove owner authorization, layout commit parent, clean canonical ext4 target, prefix parity and read-only rollback; A2–E must pass the shared closed schema, artifact hashes, exact Node/pnpm and common root/owner constraints.
- Timestamps must be offset-aware and nondecreasing across the seven task runs. Current HEAD must descend from the authorized layout commit; canonical Git root, ext4 filesystem and runner owner must still match. Evidence age alone is not staleness because each run is an immutable prerequisite; changed hash/root/owner/ancestry/status or a failed current consistency probe is stale.

## Scope, privacy and lifecycle

- This task is read-only with respect to prior evidence and environment capability. It does not rerun package, Edge, network or ACL probes, repair failures, create a workspace, change proxy/CA/ACL/tool versions, or upgrade a partial result.
- The aggregator records bounded task IDs, run IDs, timestamps, verdicts, manifest hashes and safe classifications only. It does not copy owner statements, ACL SID/rules, environment data, raw logs, paths beyond already-approved canonical/staging identities, browser payloads or secrets.
- Aggregate `passed` requires all seven independent verdicts plus every consistency/hash/redaction check to pass. Any missing/tampered/mixed/stale input produces `blocked` and a bounded rerun task list; a human summary cannot override the machine result.
- Output is a new immutable evidence bundle with a reproducible input-manifest digest. No signature key exists in this phase, so “signed-hash” is implemented honestly as SHA-256 manifests and a canonical aggregate digest, not described as a digital signature.

## Planned changes and tests

1. Add a dependency-free aggregate probe that securely parses/verifies prior manifests and evidence, applies task-specific plus cross-run invariants, derives the verdict/rerun list, emits a closed detail record and shared P0-T0F evidence.
2. Preserve ADR 0001 byte-for-byte because A2–E immutably hash it; add ADR 0002 to record the aggregate procedure/verdict, exact required run set, immutable-hash/current-consistency semantics, runner owner/rerun command and the explicit boundary that P0-T0G is a later Playwright gate.
3. Add missing/stale/tampered/duplicate/traversal/symlink manifest, mixed verdict, wrong task/root/owner/version/ordering/ancestry, redaction, deterministic canonical digest and rerun-list tests. Run the real aggregate, complete preflight suite, both schema validators, bootstrap validation and SHA-256 verification.

## Pass/block rule

- Pass only when all required evidence is present, immutable hashes validate, A0/A1 task-specific facts pass, A2–E shared evidence passes, cross-run identity/version/time/ancestry/status invariants hold and the aggregate canonical digest reproduces.
- On failure, retain all prior evidence, list only the affected task IDs and safe recovery instruction (“rerun that probe after resolving its classified prerequisite”), and remain blocked. P0-T0F passed authorizes only P0-T1 scaffold/validator work; real Playwright `channel: msedge` remains P0-T0G and no product/browser capability is claimed here.
