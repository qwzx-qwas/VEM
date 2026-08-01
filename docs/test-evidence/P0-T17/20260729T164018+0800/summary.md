# P0-T17A evidence summary

## Delivered harness

- Added private `@vem/pilot-harness` with an explicit two-layer split: `VersionedReadOnlyPilotHarness` validates and evaluates immutable raw inputs, while `CanonicalEvidenceBundleBuilder` validates, canonicalizes, hashes and summarizes the final bundle.
- The participant task manifest binds plan/harness/task versions, SHA-256 namespace, 3–5 task identities, prompt hashes, fixture commits, selection and registry input hashes, timing/cache policy, arm order, separate setup-cost boundary and later-holdout exclusion hash. It carries only a ground-truth content hash, never an evaluator ground-truth path or value.
- The evaluator-only build request supplies separately hashed ground-truth and completed trial records after the participant arms. Output raw records retain all relevant input hashes, trial arm/order, monotonic nanosecond duration and direct/degraded correctness fields.

## Fail-closed and privacy boundary

- Inputs must be root-relative regular files with bounded size, no path escape or symlink component, exact closed shapes and matching SHA-256. The harness verifies the exact Git fixture commit and rehashes every input after bundle construction to detect concurrent change.
- Timing-boundary, cache policy and setup/per-task split are manifest-wide. Arm order is counterbalanced, a current direct primary cannot be repackaged as degraded candidates, chosen ranks must resolve exactly, and any pilot task overlapping the later-holdout exclusion list is rejected.
- Canonical output contains hashes and evaluation booleans only. It excludes physical/evaluator paths, prompt text, selection text, raw URL paths, ground-truth source values and registry relative paths.
- The harness imports no filesystem write or network API, accepts no output path, arbitrary command or URL, writes no product state and exposes no Coordinator/MCP/browser capability.

## Verification

- Eight targeted tests cover determinism/immutability, strict schema validation, hash tamper and concurrent mutation, missing ground truth, holdout overlap, path/symlink rejection, write-operation rejection, timing/commit drift, direct-versus-degraded rules, privacy projection and canonical JSON.
- All 83 Vitest tests across 12 files, root build/typecheck/lint, roadmap/workspace/license gates, clean frozen install, demo production build and 98 preflight regressions passed.
- The production demo remained unchanged at 23 transformed modules, four local files, 1,092,834 bytes, zero external URLs and zero VEM-owned signatures.

## Boundary

This task does not run the real 3–5 task micro-pilot, start fresh Codex contexts, observe real timings, consume later holdouts or produce a `continue|adjust|stop` verdict. P0-T17B remains the only task authorized to perform those actions.
