# P0-T1 Execution Plan

## Task identity and eligibility

- Task/phase: `P0-T1` / `P0`
- Initial state: `todo`; changed to `in_progress` before scaffold edits
- Dependency: `P0-T0F` is `done` with aggregate verdict `passed`
- Contracts: `LICENSE-POLICY-001`, `TEST-GATE-001`
- Authority: `docs/DESIGN.md` §2.8 and §3.1–3.1.1
- Starting commit: `d99ab8054940a7c5c45b7426e5f75906f605741d`

## Observable goal

Create one private pnpm/TypeScript workspace that pins the already accepted Node `24.18.0`
and pnpm `10.34.0`, enables strict TypeScript, Vitest, and ESLint, and fails closed on package
license metadata, dependency license classes, third-party notices, and unregistered vendored assets.

## Scope and boundaries

- No browser, Playwright, MCP, source transform, selector, runtime discovery, network protocol,
  persistent product state, or production integration is introduced.
- Project license is recorded as Apache-2.0 from the owner-authored license commit and owner
  mastery answer. The legal name is not guessed. Apache-2.0 §5 is the contribution baseline.
- The publication boundary remains private P0 proof-of-value; this task does not authorize a
  public package, extension, copied third-party code, or store distribution.
- Dependencies are development-only. No vendored code, font, icon, image, or generated asset is
  introduced. An empty provenance registry is still checked against conventional vendored roots.
- Node/pnpm versions must exactly match P0-T0A2. Playwright remains P0-T0G.

## Planned changes and tests

1. Add the root workspace metadata, exact runtime files, strict shared TypeScript config, ESLint,
   Vitest, and one private smoke package.
2. Add a machine-readable dependency policy, vendored-asset registry, deterministic license audit,
   and generated `THIRD_PARTY_NOTICES.md` tied to the lockfile hash.
3. Generate `pnpm-lock.yaml`, run clean frozen install, workspace smoke, build, typecheck, lint,
   tests, license policy/notices/provenance checks, and the pre-P0-T2 bootstrap validation.
4. Only after every check passes, set `P0-T1` to `done` and record progress/evidence.

## Stop conditions

- Exact Node/pnpm mismatch, frozen install failure, unknown/review-required/forbidden dependency
  license, missing notice, unregistered vendored asset, failed test/typecheck/lint, or roadmap
  inconsistency leaves the task incomplete.
- A need for Playwright, browser capability, public distribution, or product code stops this task
  at its boundary instead of widening it.
