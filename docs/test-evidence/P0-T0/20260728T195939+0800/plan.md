# P0-T0B Atomic Plan

## Task identity and dependency

- ID/status: `P0-T0B` / `in_progress`; phase `P0` / `in_progress`
- Dependency: `P0-T0A2` is `done`; owner accepted Node `24.18.0` and pnpm `10.34.0`; commit `8bdd41be92f0d9e02915bda14df6eabbdb92d6e5`
- Direct/reverse contract: `EDGE-PREFLIGHT-001`; authority is `docs/DESIGN.md` sections 3.1 and 3.1.1
- Phase dependencies and roadmap decisions: none for this task

## Observable goal

Produce one replayable package/network/filesystem profile proving whether the canonical ext4 runner can use the configured npm registry, exact pnpm, symlinks, case-sensitive/long paths, and non-polling file-watch update latency, while leaving no fixture or project metadata residue.

## Boundaries

- Canonical Git root is discovered, must be ext4, and remains the only writer; staging remains read-only rollback.
- A temporary fixture is created on the same ext4 filesystem outside the Git root and is always deleted.
- Registry/proxy/CA values are never dumped: only configured booleans, HTTP/TLS classifications, bounded response hashes and default-CA availability are retained.
- `corepack prepare pnpm@10.34.0 --activate` and an exact `pnpm --version` check are allowed here; no global proxy/CA mutation is allowed.
- File watching uses Node `fs.watch`, explicitly records `polling: false`, exercises create/modify/rename, and saves samples plus p50/p95. It is a local watcher-to-update readiness proxy, not the Windows Edge/WebSocket HMR proof reserved for P0-T0D.
- No formal workspace/package, browser, MCP, selection, confirmation, capture, cache, queue, durable artifact or product capability is introduced.
- Project/dependency licensing is unaffected because the package fixture is temporary and deleted; no vendored asset is retained.

## Tests and evidence

1. Unit-test DNS/TLS/proxy/timeout/integrity classification, proxy credential non-serialization, schema/secret rejection, percentile math, case/symlink/path checks, watcher timeout and cleanup.
2. Activate exact pnpm and verify the version without persisting registry credentials.
3. Probe the configured/default registry with the default trust store; record bounded body hash and classification.
4. Generate a temporary exact-dependency lockfile and run `pnpm install --frozen-lockfile --ignore-scripts`; verify the installed version and cleanup.
5. Run Node `fs.watch` create/modify/rename samples, calculate p50/p95 and reject polling/timeout.
6. Validate unified evidence, bootstrap roadmap mappings, SHA-256 artifacts and clean Git status outside task changes.

## Stop conditions

DNS, TLS/CA, proxy, exact pnpm, frozen install, case, symlink, long path, watcher event/timeout, cleanup or residue uncertainty is classified fail/blocked. No failure silently switches to polling or modifies global configuration.
