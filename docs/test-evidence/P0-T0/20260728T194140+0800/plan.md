# P0-T0A2 Atomic Plan

## Task identity

- ID/status: `P0-T0A2` / `in_progress`
- Phase: `P0` / `in_progress`
- Dependency: `P0-T0A1` is `done`; layout commit `5f55a3ff790c8751468e2262e58ef0d5dc72b5c4` has parent `f96f79e545b540cee6d53d5910bb4422d31f6b14`, target is clean ext4, staging rejects writes
- Required product decision: none; exact Node/pnpm owner acceptance is an explicit task completion input recorded in `docs/decisions/OPEN_DECISIONS.yaml`
- Direct/reverse contract: `EDGE-PREFLIGHT-001` in `ROADMAP.yaml` and `docs/requirements.yaml`
- Authority: `docs/DESIGN.md` sections 3.1 and 3.1.1

## Observable goal

Produce one dependency-free, replayable, machine-classified evidence schema plus an exact Node/pnpm bootstrap candidate at the canonical migrated Git root, without performing registry, watcher or browser probes.

## Boundaries

- Canonical writer/root: `/home/qwzx/src/VEM`, discovered through Git; filesystem must classify as ext4.
- Read-only rollback: `/mnt/d/VEM`; no source ACL change or second writer.
- Selected execution profile: WSL Node/Vite/MCP on ext4 plus Windows Edge Stable at later gates.
- No browser, transport, MCP, page-untrusted input, selection, confirmation, privacy projection, capture, queue, cache, verification or retained product artifact behavior changes.
- Evidence is bounded control metadata, not durable product artifact storage. It has no lease/TTL because it is committed test evidence; raw output and secrets are excluded.
- No fallback or trusted-local bypass is introduced. Failure/blocked classifications remain visible and cannot become pass through configuration.
- Project license/package/vendored assets are unaffected; no dependency is added.

## Planned changes and tests

1. Add closed JSON schema plus dependency-free validator/probe with exact-version and secret rejection.
2. Add valid/invalid fixtures and unit/contract/security tests.
3. Record ADR candidate Node `24.18.0`, pnpm `10.34.0`, exact activation/version commands and deferred gates.
4. Generate bounded evidence; run bootstrap roadmap check, unit tests, compile check, schema validation, artifact hash verification and diff review.
5. After explicit owner version acceptance, record the decision, set task `done`, update progress/status, and add the user-requested completion note under the prompt.

## Stop conditions

- Canonical root is not the target ext4 Git top-level.
- Node does not exactly match the selected supported 24.x version.
- Corepack cannot express the exact pnpm activation command.
- Schema accepts ranges, unknown results, path traversal, secrets, oversized/deep data or a non-derived aggregate.
- Owner does not accept the exact versions; leave the task `in_progress` and do not start P0-T0B.
