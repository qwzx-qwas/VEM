# ADR 0001: Edge execution preflight and reproducible bootstrap

- Status: Accepted for the P0-T0A2 exact toolchain decision; aggregate environment verdict remains P0-T0F
- Date: 2026-07-28
- Contracts: `EDGE-PREFLIGHT-001`
- Decision owner: project owner for exact toolchain; P0-T0F evidence gate for aggregate verdict

## Context

P0 runs as WSL Node/Vite/MCP on an ext4 canonical Git worktree with Windows Edge Stable as the Tier-1 browser. The migrated canonical root is discovered with `git rev-parse --show-toplevel`; `/home/qwzx/src/VEM` is the current owner profile, not a portable hard-coded CI path. The DrvFS staging tree `/mnt/d/VEM` is readable rollback evidence and is not a writer.

Preflight evidence must be machine-classified, bounded, hash-addressed, root-relative where it names repository artifacts, and safe to retain. A successful command is only one evidence item and cannot by itself authorize a phase. Registry/proxy/CA, watcher/HMR, Edge launch, Windows/WSL transport, private runtime ACL, two-process and Playwright channel verdicts remain separate P0-T0B through P0-T0G gates.

## P0-T0A2 accepted decision

- Node: exact `24.18.0`. The canonical runner already exposes this version and the official Node release page identifies it as a 24.x LTS release: <https://nodejs.org/en/blog/release/v24.18.0>.
- pnpm: exact `10.34.0`. This is the selected maintained 10.x release candidate, recorded from the immutable upstream tag: <https://github.com/pnpm/pnpm/releases/tag/v10.34.0>.
- Bootstrap mechanism: `corepack prepare pnpm@10.34.0 --activate`, followed by `pnpm --version` and an exact equality check.
- Node version command: `node --version`, normalized only by removing its leading `v`.
- pnpm selection and its exact activation command are fixed here, but network activation and registry behavior are deliberately deferred to P0-T0B. P0-T1 may not substitute another version ad hoc.

The project owner accepted both exact versions on 2026-07-28 after reviewing the generated evidence. A later replacement requires a new recorded owner decision plus regenerated evidence and tests; it is not a silent document edit.

## Evidence schema

`scripts/preflight/evidence.schema.json` is the canonical v1 JSON shape. `scripts/preflight/preflight.py` enforces the same closed-object, size, depth, exact-version, machine-derived result, relative artifact path and secret-redaction rules without requiring a package installation.

Evidence contains:

- a closed task identity enum covering P0-T0A2 and the downstream P0-T0B–G preflight evidence producers;

- schema/task/run/timestamp and direct contract identity;
- execution profile, canonical Git root, filesystem and runner owner;
- argv arrays, exit state and bounded summaries rather than shell strings or raw logs;
- exact/observed tool versions and selection sources;
- independently classified checks and a deterministically derived aggregate;
- canonical-root-relative artifact paths with lowercase SHA-256.

Evidence must not contain environment dumps, authorization/cookie/password/token/private-key fields, bearer values, credential-bearing URLs, registry authentication, raw CA material or unbounded stdout/stderr. Unknown keys and unknown result values fail closed.

## Consequences and boundaries

- The validator is dependency-free and usable before the monorepo exists.
- P0-T0A2 does not install pnpm, contact a package registry, run Edge, test HMR, claim private runtime ACL, create product packages or claim the aggregate preflight passed.
- Browser/MCP/selection/confirmation/capture/cache/queue/artifact lifecycle capabilities are unaffected and remain unavailable.
- P0-T0B consumes the exact pnpm decision and proves registry/bootstrap execution. P0-T0F combines all independent evidence into the only bootstrap aggregate verdict. P0-T0G separately proves fixed Playwright with real `channel: msedge`.
