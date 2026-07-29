# P0-T16 Execution Plan

- Starting commit: `ecf06912cbac4f3d7997ddcab34d42e352be742c`.
- Set P0-T16 to `in_progress` before implementation.
- Create private `@vem/source-registry` with internal protocol and transform dependencies only.
- Define closed bounded publication, compatibility, direct lookup and safe error/result types.
- Consume immutable P0-T15 snapshots and require exact namespace/version/parser/matrix compatibility.
- Atomically validate project revision, record revision, normalized relative paths/locations, unique anchors, publication byte/record bounds and canonical digest before mutation.
- Treat same revision/same digest as idempotent and same revision/different digest as collision.
- Retain only current and one previous revision; previous data is diagnostic and can never satisfy ordinary lookup.
- Require caller project/build/source context equality and non-stale sequence for current lookup.
- Return one registry-matched direct result with trusted-local relative location, coordinator-side opaque file identity and evidence hash; return no heuristic candidates.
- Reset all state on project-instance restart and never order sequences across instances.
- Prove no filesystem/browser storage, transport, source reads, page path ingress, HMR reattachment, MCP or editing implementation.
- Run source/workspace/build/type/lint/roadmap/license, frozen/offline install, demo non-leakage build and 98 preflight regressions.
- Record bounded evidence and SHA-256 manifest.
- Mark the prompt complete, remove checkpoint and commit atomically only after every gate passes.
