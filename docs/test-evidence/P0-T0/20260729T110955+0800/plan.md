# P0-T0G Execution Plan

## Task identity and eligibility

- Task/phase: `P0-T0G` / `P0`
- Initial state: `todo`; changed to `in_progress` before dependency or probe edits
- Dependency: `P0-T1` is `done`; starting commit `1f5779559aadce599aa0b03beb60063ac936c050`
- Contract: `EDGE-PREFLIGHT-001`
- Authority: `docs/DESIGN.md` §3.1–3.1.1, accepted ADR 0001, and the resulting P0-T0G decision in ADR 0003

## Observable goal

Pin Playwright `1.62.0` and prove that a checksum-verified task-local Windows Node `24.18.0`
runner can automate the real Windows Edge Stable binary through an explicit `msedge` channel
profile in both headless and headed modes, with bounded timeouts, isolated profiles, policy
classification, and zero residue.

## Seams and boundaries

- The real browser is the standard Windows Edge Stable binary. No bundled Playwright Chromium,
  Chrome, user profile, remote-debugging endpoint, or `--no-sandbox` substitute is permitted.
- Windows had no installed Node runner. Direct WSL Node-to-Windows Edge pipe launch was tried and
  rejected after Edge exited without opening the debugging pipe; it is not counted as passing.
- The accepted seam uses the official checksum-verified portable Windows Node only inside the
  task, stages locked `playwright-core` in Windows TEMP, and keeps the product topology unchanged.
  The portable toolchain is removed after the gate and is not a system or product installation.
- Each mode receives a unique task-owned Windows temporary user-data directory. Cleanup verifies
  both profile absence and marker-scoped process absence after normal exit, timeout, or failure.
- The existing fixed-inline PowerShell discovery/policy adapter is reused read-only. ExecutionPolicy
  remains unmodified and no `.ps1` file or policy bypass is allowed.
- Evidence uses the closed P0 preflight schema and stores bounded classifications/hashes, never raw
  DOM, command strings, environment dumps, cookies, tokens, user-profile data, or unbounded logs.
- No selector, protocol, fixture product, MCP, Vite integration, production dependency, persistent
  product state, screenshot, or later browser capability is introduced.

## Planned implementation and tests

1. Add exact `@playwright/test@1.62.0`, update the deterministic notices, and add a non-product
   `msedge` Playwright launch profile plus dependency-free evidence orchestrator.
2. Add unit/contract/security tests for exact version, channel/binary identity, headed/headless
   completeness, missing Edge, policy block, timeout, profile/process cleanup, closed schema,
   secret rejection, aggregate mismatch, and bounded summaries.
3. Run both real modes, validate evidence with the shared validator and Draft 2020-12 schema,
   verify repository artifact hashes and all workspace/preflight regressions, then record residue.
4. Only after all required checks pass, mark P0-T0G `done` and annotate its prompt. Otherwise keep
   it incomplete or record a genuine external blocker; the direct P0-T0C smoke cannot upgrade it.

## Stop conditions

- Missing or non-Stable Edge, inability to retain the `msedge` launch profile, either headed or
  headless failure, restrictive enterprise policy, timeout, profile/process residue, schema/hash
  failure, or any target regression prevents completion and blocks P0-T3/P0-T4.
