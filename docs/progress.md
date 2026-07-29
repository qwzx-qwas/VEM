# Implementation Progress

This file records implementation task completion or externally blocked evidence only. Design-baseline history has moved to [`docs/history/DESIGN_CHANGELOG.md`](history/DESIGN_CHANGELOG.md), and the human-readable current snapshot is in [`docs/STATUS.md`](STATUS.md).

Each future entry must include task ID, date, changed files, commands, test evidence, Edge/browser evidence where relevant, security/data-lifecycle verification, limitations, and next eligible task. `ROADMAP.yaml` remains the task/phase/decision status source.

## P0-T0A0 — Read-only migration readiness inventory

- Date: 2026-07-28
- State/outcome: `done` / `passed`
- Decision: n/a
- Changed files: `ROADMAP.yaml`, `docs/STATUS.md`, `docs/progress.md`, and the 15-artifact evidence run at `docs/test-evidence/P0-T0/20260728T155608+0800/`
- Commands: Git top-level/HEAD/status/diff/manifest probes; `stat`, `findmnt`, `df`, and read-only target permission probes; temporary bootstrap validator and evidence generator/verifier; `sha256sum -c SHA256SUMS`
- Test evidence: bootstrap validation passed for 9 phases, 136 tasks, 25 contracts, dependency DAGs, decision chains, bidirectional contract mappings, exact authoritative headings, normative coverage, and internal links; evidence verifier passed before and after deterministic regeneration; all artifact checksums passed
- Inventory evidence: baseline `f96f79e545b540cee6d53d5910bb4422d31f6b14`; `/mnt/d/VEM` and `/mnt/d/vem` share device/inode; dirty tracked and untracked payload manifests are content-hashed; the project prefix normalizes without exact or case-fold collisions
- Target evidence: `/home/qwzx/src/VEM` and `/home/qwzx/src` remained absent; an external read-only probe confirmed the nearest existing owner directory is writable/searchable ext4 with about 992 GB available; no target mutation occurred
- Edge/browser evidence: not applicable to this inventory-only task
- Security/data-lifecycle verification: no environment dump or file body is stored; payload is represented by bounded path/type/mode/size/hash records; no token, password, URL secret, target write, toolchain install, commit, chmod, or writer cutover occurred
- Known limitations/degradations: the formal preflight evidence schema is intentionally deferred to P0-T0A2; readiness does not authorize migration and does not claim any Edge/toolchain/product capability
- Next eligible task: `P0-T0A1`, only after explicit owner authorization for the project-at-root layout commit and single-writer cutover; otherwise none


## P0-T0A1 - Prefix-normalized migration and single-writer cutover

- Date: 2026-07-28
- State/outcome: `done` / `passed`
- Decision: owner authorization recorded in `docs/decisions/OPEN_DECISIONS.yaml`
- Changed files: project-at-root layout at `/home/qwzx/src/VEM`, migration state marker, roadmap/status/progress, and `docs/test-evidence/P0-T0/20260728T165102+0800/`
- Commands: local no-hardlink/no-checkout clone, prefix-normalized copy, Git add/commit, manifest/hash parity checks, Git root/parent/clean checks, Windows `icacls` deny-write cutover, source write-refusal probe, bootstrap validator
- Test evidence: layout commit `5f55a3ff790c8751468e2262e58ef0d5dc72b5c4` has parent `f96f79e545b540cee6d53d5910bb4422d31f6b14`; 58 frozen payload files match by normalized relative path/type/size/content hash; nested bundle prefix is absent; target is ext4 and clean after completion
- Edge/browser evidence: not applicable to this migration-only task
- Security/data-lifecycle verification: no stash, discard, source deletion, toolchain install, network probe, or product capability change; staging remains readable and rejects writes; the exact ACL rollback command is retained in migration evidence
- Known limitations/degradations: the rollback ACL is owner-profile-specific and must be removed with the recorded command before staging can become a writer again; formal preflight schema and Node/pnpm selection remain P0-T0A2
- Next eligible task: `P0-T0A2`

## P0-T0A2 — Evidence schema and exact Node/pnpm bootstrap

- Date: 2026-07-28
- State/outcome: `done` / `passed`
- Decision: project owner accepted Node `24.18.0`, pnpm `10.34.0`, and `corepack prepare pnpm@10.34.0 --activate`; evidence is `docs/test-evidence/P0-T0/20260728T194140+0800/owner-decision.json`
- Changed files: `ROADMAP.yaml`, `docs/STATUS.md`, `docs/decisions/OPEN_DECISIONS.yaml`, `docs/adr/0001-edge-execution-preflight.md`, `docs/tasks/ATOMIC_TASK_PROMPTS.md`, `scripts/preflight/`, and the evidence run at `docs/test-evidence/P0-T0/20260728T194140+0800/`
- Commands: dependency-free toolchain probe; Python unit/contract/security tests; Draft 2020-12 cross-validation; bootstrap roadmap/requirements/decision/heading/link validator; artifact and evidence SHA-256 verification
- Test evidence: 20 targeted tests passed; JSON Schema 2020-12 validation passed; bootstrap validation passed for 9 phases, 136 tasks, 25 contracts and 27 internal links; evidence validator and all evidence checksums passed
- Toolchain evidence: canonical Git root `/home/qwzx/src/VEM` is ext4; observed Node exactly matches `24.18.0`; Corepack `0.35.0` expresses the owner-accepted exact pnpm activation command without executing registry access in this task
- Edge/browser evidence: not applicable; Edge direct launch and Playwright channel remain P0-T0C and P0-T0G
- Security/data-lifecycle verification: closed bounded schema rejects duplicate/unknown keys, ranges, version mismatch, result mismatch, depth/size overflow, path traversal, bearer/credential URLs and secret-bearing keys; runner owner is derived from effective UID; no environment dump, package install, registry credential, raw CA, browser profile or product artifact capability was introduced
- Known limitations/degradations: pnpm activation, `pnpm --version`, registry/proxy/CA, symlink and watcher/HMR execution are deliberately deferred to P0-T0B; this task does not claim the aggregate P0-T0F or Edge automation P0-T0G verdict
- Next eligible task: `P0-T0B`

## P0-T0B — Registry, ext4, and watcher/HMR profile

- Date: 2026-07-28
- State/outcome: `done` / `passed`
- Decision: n/a; consumed the owner-accepted Node `24.18.0`, pnpm `10.34.0`, and exact Corepack activation decision from P0-T0A2
- Changed files: `ROADMAP.yaml`, `docs/STATUS.md`, `docs/progress.md`, `docs/tasks/ATOMIC_TASK_PROMPTS.md`, `scripts/preflight/profile_probe.py`, `scripts/preflight/watch_probe.mjs`, `scripts/preflight/tests/test_profile_probe.py`, and `docs/test-evidence/P0-T0/20260728T195939+0800/`
- Commands: bounded Python registry/default-CA probe; isolated temporary `COREPACK_HOME` activation; exact pnpm version, lockfile-only and frozen install commands; ext4 disk/case/symlink/long-path probes; native Node `fs.watch` create/modify/rename probe; Python unit/contract/security tests; Draft 2020-12, dependency-free evidence/artifact, bootstrap, and SHA-256 verification
- Test evidence: all 36 preflight tests passed; exact Node `24.18.0` and pnpm `10.34.0` passed; temporary `is-number@7.0.0` lockfile and frozen install passed with lockfile SHA-256 `88818e6e51b71df8b8120ce055aeb14e3fdccc193f10d1ba65bc0e3b294ed5fc`; fail-closed DNS/TLS/proxy/timeout, wrong-CA classification, case/symlink/long-path, no-polling, aggregate mismatch, activation short-circuit and timeout-cleanup cases passed
- Filesystem/watcher evidence: canonical root is ext4 with 992,385,945,600 bytes available; case sensitivity, symlink and long path passed; native `node:fs.watch` observed 10 create, 10 modify and 10 rename events with polling disabled, p50 `0.290 ms` and p95 `0.564 ms`
- Edge/browser evidence: not applicable; this native watcher result is only filesystem readiness, while direct Edge launch remains P0-T0C and the real Windows/WSL HTTP-WebSocket-HMR path remains P0-T0D
- Security/data-lifecycle verification: no global proxy/CA change, project package metadata, registry credential, raw CA, environment dump, response header/cookie, unbounded log, temporary Corepack cache, lockfile, package fixture or node_modules tree was retained; success and blocked paths both clean same-filesystem fixtures
- Known limitations/degradations: current registry throughput was about 30,395 bytes/second for a bounded 1 MiB sample, so exact Corepack activation uses a 300-second hard timeout; P0-T0B does not claim Edge, cross-OS HMR, private runtime ACL, Playwright channel, or the aggregate P0-T0F verdict
- Next eligible task: `P0-T0C`

## P0-T0C — Edge Stable direct launch and policy classification

- Date: 2026-07-28
- State/outcome: `done` / `passed`
- Decision: n/a
- Changed files: `ROADMAP.yaml`, `docs/STATUS.md`, `docs/progress.md`, `docs/tasks/ATOMIC_TASK_PROMPTS.md`, `scripts/preflight/edge_probe.py`, `scripts/preflight/tests/test_edge_probe.py`, and `docs/test-evidence/P0-T0/20260728T204048+0800/`
- Commands: bounded fixed-inline PowerShell discovery/policy and marker-scoped cleanup; direct WSL invocation of the standard Windows `msedge.exe`; Python unit/contract/security tests; Draft 2020-12, dependency-free evidence/artifact, bootstrap, residue, and SHA-256 verification
- Test evidence: all 52 preflight tests passed, including missing binary, malformed interop, nonzero launch, DOM mismatch, timeout, restrictive and malformed policy, aggregate mismatch, profile/process cleanup, secret rejection, exact command-order, and shared-evidence cases
- Edge/browser evidence: real Edge Stable `150.0.4078.99` at the standard x86 Program Files path launched with `--headless=new`, an isolated task-owned profile, and a local sentinel page; exit code was 0, the expected DOM sentinel was observed in 116 bounded stdout bytes, and no Playwright or Chromium substitute was used
- Security/data-lifecycle verification: effective Windows ExecutionPolicy was `Restricted` and was not bypassed; no `.ps1` adapter, `--no-sandbox`, remote-debugging port, user Edge profile, registry write, arbitrary policy value, raw DOM/stderr, command line, environment dump, cookie, token, or browser data was retained; the Windows residue probe reported zero task-owned process and temp-path residue
- Known limitations/degradations: enterprise Edge policy is currently classified `unmanaged`; this task proves only direct binary smoke and does not claim Playwright `channel: msedge`, Windows/WSL HTTP-WebSocket-HMR reachability, runtime ACL, or the aggregate P0-T0F verdict
- Next eligible task: `P0-T0D`

## P0-T0D — Windows/WSL HTTP, WebSocket, watch/HMR and restart path

- Date: 2026-07-28
- State/outcome: `done` / `passed`
- Decision: n/a
- Changed files: `ROADMAP.yaml`, `docs/STATUS.md`, `docs/progress.md`, `docs/tasks/ATOMIC_TASK_PROMPTS.md`, `scripts/preflight/network_server.mjs`, `scripts/preflight/network_probe.py`, `scripts/preflight/tests/test_network_probe.py`, and `docs/test-evidence/P0-T0/20260728T211720+0800/`
- Commands: dependency-free Node HTTP/WebSocket/native-watch server; Python two-generation orchestrator; fixed-inline read-only Windows port/process queries; two real direct Edge launches; Python unit/integration/contract/security tests; Draft 2020-12, dependency-free evidence/artifact, bootstrap, independent WSL/Windows residue, and SHA-256 verification
- Test evidence: all 67 preflight tests passed; P0-T0D adds closed profile/event validation, pass-without-evidence rejection, honest null identity on blocked paths, secret rejection, non-loopback and process-residue classification, malformed WebSocket origin rejection, and a real local HTTP/WebSocket/fs.watch/ACK server integration test
- Edge/browser evidence: Edge Stable `150.0.4078.99` reached WSL localhost on port `46335` in two generations; WSL server PIDs `36352` and `36391` and Windows Edge PIDs `24720` and `40428` were independently observed; both correlated updates produced browser ACK and expected DOM sentinel with Edge/server exit code 0
- Security/data-lifecycle verification: the server bound only `127.0.0.1`; the WSL non-loopback address refused the live port; Windows observed the port closed after each generation; strict routes/origin/generation/update checks rejected malformed ingress; no token, cookie, user profile, broad bind, polling fallback, raw DOM/stderr, environment dump or product protocol was retained; WSL server/temp and Windows Edge/profile residue were all zero
- Known limitations/degradations: an initial bounded diagnostic run correctly exposed DrvFS watch unreliability, so the final probe keeps watch fixtures on canonical ext4 and Windows Edge profiles in Windows temporary storage; this is HMR-style preflight only and does not claim product coordinator, private runtime ACL, Playwright channel or the aggregate P0-T0F verdict
- Next eligible task: `P0-T0E`

## P0-T0E — Private ext4 runtime ACL

- Date: 2026-07-28
- State/outcome: `done` / `passed`
- Decision: n/a
- Changed files: `ROADMAP.yaml`, `docs/STATUS.md`, `docs/progress.md`, `docs/tasks/ATOMIC_TASK_PROMPTS.md`, `scripts/preflight/runtime_acl_probe.py`, `scripts/preflight/tests/test_runtime_acl_probe.py`, and `docs/test-evidence/P0-T0/20260728T213829+0800/`
- Commands: dependency-free runtime filesystem/owner/mode probe; WSL self-launch as root followed by immediate `runuser -u nobody`; fixed identity/traverse/read/write/create checks; conservative idempotent cleanup; Python unit/contract/security tests; Draft 2020-12, dependency-free evidence/artifact, bootstrap, residue and SHA-256 verification
- Test evidence: all 83 preflight tests passed; P0-T0E adds mode-drift, wrong-owner, symlink-component, no-follow cleanup, unexpected stale-file preservation, idempotent cleanup, XDG tmpfs explicit fallback, Windows-mounted XDG hard rejection, other-subject allowed/ambiguous failure, secret rejection and aggregate-consistency cases
- Edge/browser evidence: not applicable to this ACL-only gate; real Edge binary and Windows/WSL network evidence remain P0-T0C/D
- Runtime evidence: the selected ext4 root is owner UID/GID 1000 with mode `0700` on device 2096; the task child was `0700`, fixture `0600`, owner read/write passed, and observed `nobody` UID 65534 was denied traverse/read/write/create; current Windows staging filesystem `9p` was explicitly rejected as POSIX ACL evidence
- Security/data-lifecycle verification: no real token, capability, socket, environment dump, directory listing, unrelated filename or ACL body was retained; root privilege only launched the fixed `nobody` argv checks and performed no write; cleanup deleted only the known regular fixture and empty `.preflight-*` child, succeeded twice, preserved the pre-existing runtime root identity/mode and left zero residue
- Known limitations/degradations: the real XDG runtime base is owner-private `tmpfs`, so it was visibly rejected for this ext4-specific gate and the passwd-home `.cache/vem` fallback was selected; a `9p`/DrvFS XDG candidate would fail closed rather than fall back; this task does not implement runtime discovery or issue the aggregate P0-T0F verdict
- Next eligible task: `P0-T0F`

## P0-T0F — Bootstrap preflight aggregate verdict

- Date: 2026-07-28
- State/outcome: `done` / `passed`
- Decision: n/a; machine aggregate verdict is `passed`
- Changed files: roadmap/status/progress/prompt, `docs/adr/0002-bootstrap-preflight-verdict.md`, `scripts/preflight/aggregate_probe.py`, its tests, and `docs/test-evidence/P0-T0/20260728T215135+0800/`
- Commands: fixed-input manifest/artifact/schema aggregator; full Python regression; Draft 2020-12, dependency-free evidence/artifact, bootstrap and SHA-256 validation
- Test evidence: all 90 preflight tests passed, including missing/tampered/duplicate/traversal/symlink manifest and deterministic/order-sensitive digest cases
- Edge/browser evidence: consumed immutable P0-T0C/D real Edge and Windows/WSL evidence; no browser rerun; Playwright `channel: msedge` remains P0-T0G
- Security/data-lifecycle verification: seven required manifests and files rehashed; no owner statements, ACL details, raw logs or secrets copied; canonical digest `1f77525ea06e3a1525cb54c8a3bd401d0753b8384a45970b930a0626d710d4ff` is explicitly not a digital signature
- Known limitations/degradations: aggregate passed authorizes P0-T1 only; ADR 0001 stayed byte-identical to preserve upstream hashes; P0-T0G remains required before browser-dependent product tasks
- Next eligible task: `P0-T1`

## P0-T1 — pnpm TypeScript workspace and license-policy baseline

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: existing owner-authored Apache-2.0 `LICENSE` and owner answer are recorded without guessing a legal name; contribution baseline is Apache-2.0 §5 and publication remains limited to private P0 proof-of-value
- Changed files: exact root workspace metadata/lockfile, strict TS/Vitest/ESLint config, `packages/workspace-smoke/`, `scripts/workspace/`, `scripts/license/`, dependency/vendored policy, generated `THIRD_PARTY_NOTICES.md`, roadmap/status/decision/prompt records, and `docs/test-evidence/P0-T1/20260729T103857+0800/`
- Commands: exact Corepack pnpm lockfile generation and frozen install; offline clean-install smoke; workspace check; Vitest; TypeScript build/typecheck; ESLint; pnpm full-graph license scan; deterministic notices/provenance audit; Python preflight regression and bootstrap roadmap/contract check; immutable evidence SHA verification
- Test evidence: clean offline frozen install passed with no fixture residue; 8 Vitest tests passed; build, strict typecheck and lint passed; all 130 package/version records classified (97 MIT, 15 Apache-2.0, 7 ISC, 6 BSD-2-Clause, 2 BSD-3-Clause, 2 reviewed MPL-2.0 and 1 BlueOak-1.0.0); notices matched lockfile hash; zero vendored assets; all 90 existing preflight tests and bootstrap 9-phase/136-task/25-contract checks passed
- Edge/browser evidence: not applicable; P0-T1 installs no Playwright and does not claim `channel: msedge`; P0-T0G remains the next browser gate
- Security/data-lifecycle verification: all packages are private and dev-only; unknown/AGPL/forbidden/unreviewed licenses and unregistered/hash-mismatched/symlinked vendored assets fail closed; no product persistent state, browser profile, token, runtime discovery, production dependency, vendored code, font, icon, image or generated asset was introduced; clean-install writes only a bounded random `/tmp/vem-p0-t1-clean-install-*` fixture and removes it
- Known limitations/degradations: two `lightningcss` packages are MPL-2.0 transitive development tooling with a lockfile-scoped review that must be revisited for any distribution; public package/extension/store distribution remains unauthorized; Playwright and Edge automation remain P0-T0G
- Next eligible task: `P0-T0G` by roadmap order; `P0-T2` also has its task dependency satisfied but must not run concurrently

## P0-T0G — Playwright Windows Edge Stable channel gate

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: ADR 0003 accepts exact Playwright `1.62.0`, real `channel: msedge`, required headed/headless modes, and a checksum-verified task-local Windows Node `24.18.0` harness; the failed direct WSL pipe seam is explicitly not accepted
- Changed files: exact workspace lockfile/notices, ADR 0003, Playwright Windows runner/probe/tests, roadmap/status/prompt/progress records, and `docs/test-evidence/P0-T0/20260729T110955+0800/`
- Commands: exact pnpm dependency lock; official portable Node SHA-256 verification; real headed/headless Windows Edge launch; shared and Draft 2020-12 schema validation; full Python/TypeScript/workspace/license/offline-install regressions; Windows and WSL residue verification
- Test evidence: Edge Stable `150.0.4078.105` passed both modes with the same discovered browser version and bounded sentinel; all 98 preflight tests, 8 Vitest tests, build, strict typecheck, ESLint, 133-package license audit, workspace check, offline clean frozen install and both schema validators passed
- Security/data-lifecycle verification: the user's Edge profile was never used; Playwright's default `--no-sandbox` was removed; ExecutionPolicy remained `Restricted` without bypass; policy was classified unmanaged; runner output was one bounded redacted JSON line; task profiles, matching Edge processes, staged modules, portable Node ZIP/extraction and interrupted WSL download were removed with zero residue
- Known limitations/degradations: the portable Windows Node runner is a gate harness only and does not change the WSL Node/Vite/MCP product topology; no selector, protocol, extension, source resolution, runtime discovery, screenshot or other product capability was added
- Next eligible task: `P0-T2` by roadmap order; P0-T3 and P0-T4 dependencies are also satisfied but tasks must remain atomic

## P0-T2 — REQ-TRACE-001 repository validator

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Changed files: requirements schema metadata, exact YAML dependency/notices, `scripts/roadmap/`, package command, roadmap/status/prompt/mastery/progress and `docs/test-evidence/P0-T2/20260729T115639+0800/`
- Commands: `pnpm roadmap:validate`, Vitest, build/typecheck/lint, license/workspace/offline install, Python preflight regression and Git whitespace check
- Test evidence: 11 REQ-TRACE fixtures and 19 total Vitest tests passed; live validation passed for 9 phases, 136 tasks and 25 contracts; 98 preflight tests and all workspace gates passed
- Security/data-lifecycle verification: validator is read-only, confines paths to the repository, requires exact unique anchors and emits bounded error codes; it stores no source body, environment dump or credentials
- Known limitations/degradations: existing authority strings remain supported relative to `design_source`; future extracted sections should use explicit `{path, anchor}` entries; CI wiring remains P0-T10
- Next eligible task: `P0-T3` by roadmap order; P0-T4 is also eligible but must not run concurrently

## P0-T3 — MCP compatibility and minimum protocol baseline

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: project owner explicitly accepted primary `2025-06-18`, compatibility revisions `2025-03-26` and `2025-11-25`, exact `@modelcontextprotocol/sdk@1.30.0`, P0 Tasks mode `none`, and the no-mixed-task-vocabulary boundary; evidence is `docs/test-evidence/P0-T3/20260729T120836+0800/owner-decision.json`
- Changed files: ADR 0004, decision/roadmap/status/prompt/progress records, exact workspace lock/notices, `packages/protocol/`, bounded handshake probe/tests, workspace package verification, and `docs/test-evidence/P0-T3/20260729T120836+0800/`
- Commands: three ephemeral read-only Codex MCP initialization probes; deterministic protocol schema generate/check; build, Vitest, workspace tests, lint, typecheck, roadmap/workspace/license gates; offline clean frozen install; complete bootstrap preflight regression; evidence SHA-256 verification
- Test evidence: Codex MCP client `0.144.5` requested `2025-06-18`, advertised only `elicitation` and no Tasks, and accepted all three server-selected revisions; 31 Vitest and 7 workspace tests passed; closed Draft 2020-12 schema cross-validation, build, lint, typecheck, roadmap validation for 9 phases/136 tasks/25 contracts, 217-package license audit, offline frozen install and 98 preflight tests passed
- Security/data-lifecycle verification: strict contracts bind project/session/connection epoch, claim, selection/document/source identity, prompt hash, trusted reporter, 15-minute maximum TTL and one consumption; EvidenceGraph retains per-edge provenance and conflict-first semantics; origin/path/query/form/credential output is bounded or rejected; handshake evidence is a six-field allowlist with no prompt, environment, authorization, page text or source path
- Known limitations/degradations: this task defines protocol contracts only and does not start an MCP server, advertise tools/resources/Tasks, implement coordinator state, confirmation lifecycle, claims, source resolution, wait journal or product runtime capability; those remain P0-T12A/B/C
- Next eligible task: `P0-T4` by roadmap order

## P0-T4 — React/Vite privacy and malicious-input fixture

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; exact current dependencies are React/React DOM `19.2.8`, Vite `8.1.5`, plugin-react `6.0.4`, `@types/react@19.2.17` and `@types/react-dom@19.2.3`
- Changed files: private `packages/demo-fixture/`, exact workspace lock/notices, root demo/test/build-output wiring, roadmap/status/prompt/progress records and `docs/test-evidence/P0-T4/20260729T132101+0800/`
- Commands: exact registry version queries; lockfile-only and frozen install; license regeneration/audit; real Vite build and bounded artifact verification; SSR/manifest Vitest; workspace/build/lint/typecheck/roadmap gates; offline clean frozen install; full preflight regression; evidence SHA verification
- Test evidence: Vite transformed 17 modules and emitted four local files totaling 1,053,984 bytes including sourcemap under hard 1.5 MB/12-file caps; six new fixture tests and 31 existing tests passed; seven workspace tests, 224-package/zero-vendored license audit, offline install and 98 preflight tests passed
- Security/data-lifecycle verification: nine stable closed categories contain only `VEM_FIXTURE` fake credentials; private form values, private subtrees, sensitive path/query/fragment/title, prompt injection, Unicode controls, secret diagnostics, raw error and unknown nested runtime payload are present; injection renders as escaped text and no external request-bearing element exists
- Known limitations/degradations: this is intentionally unsafe page data for downstream rejection tests, not a privacy filter; no selector, projection, proxy, MCP, marker transform, source registry, browser automation or production leakage claim was added
- Next eligible task: `P0-T5` by roadmap order; `P0-T15` also has dependencies satisfied but tasks remain atomic

## P0-T5 — Injected selector, PRIV-MIN projection and ephemeral lifecycle

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: ADR 0005 accepts injected-page selection as permanently `page-untrusted`; `event.isTrusted`, same-origin, overlay state and nonce cannot improve integrity, and strict edit policy always requires external confirmation
- Changed files: ADR 0005, private `packages/injected-selector/`, React/Vite fixture wiring, exact test dependency lock/notices, workspace build references, roadmap/status/prompt/progress records and `docs/test-evidence/P0-T5/20260729T134026+0800/`
- Commands: exact frozen install; license regeneration/audit; real selector/demo production build; DOM/privacy/lifecycle Vitest; workspace/build/lint/typecheck/roadmap gates; offline clean frozen install; full preflight regression; Git whitespace and evidence SHA checks
- Test evidence: 13 new selector tests and 37 existing tests passed; pointer hover is frame-coalesced; the real demo transformed 23 modules into four local files totaling 1,092,648 bytes including sourcemap with zero external URL; seven workspace tests, 231-package/zero-vendored license audit, frozen/offline install and 98 preflight tests passed
- Security/data-lifecycle verification: overlay/private/hidden/metadata/zero-area targets fail closed; form values are never read; sensitive text, raw URL path/query/fragment and control/bidi characters are removed or rejected; summaries are immutable, explicitly untrusted and byte-bounded; Map/WeakMap/WeakRef state clears on page/document/project/detach/stop/explicit lifecycle events with no durable storage
- Known limitations/degradations: injected selection cannot prove user intent or authorize editing; no extension/CDP identity, screenshot, source anchor/registry, proxy/coordinator/MCP, claim, ConfirmationBinding consumption, Vite injection transform or persistence was added
- Next eligible task: `P0-T15`

## P0-T15 — Serve-only intrinsic JSX source anchors and production non-participation

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: ADR 0006 accepts only the exact Node 24.18.0, Vite 8.1.5, React/DOM 19.2.8, plugin-react 6.0.4, TypeScript 6.0.3, oxc-parser 0.142.0 and MagicString 1.1.0 matrix; source identity is registry-revision scoped and VEM never participates in production application runtime
- Changed files: ADR 0006, private `packages/vite-plugin/`, demo plugin/production fixtures and verifier, exact dependency lock/notices, workspace references, roadmap/status/prompt/progress records and `docs/test-evidence/P0-T15/20260729T141939+0800/`
- Commands: exact registry version/license queries and frozen install; Oxc/MagicString direct transform probe; real Vite dev/Fast Refresh transform; paired production output equivalence build; real demo leakage build; Vitest/workspace/build/type/lint/roadmap/license gates; offline clean frozen install; full preflight regression; evidence SHA checks
- Test evidence: 12 new source-anchor/production tests and 50 existing tests passed; demo transform produced 42 deterministic anchors with chained source maps; paired production outputs were byte/module-graph/source-map/behavior equivalent; real build emitted four files/1,092,834 bytes with zero VEM-owned signature; seven workspace tests, 235-package/zero-vendored license audit, frozen/offline install and 98 preflight tests passed
- Security/data-lifecycle verification: explicit reserved attributes fail closed in dev while all user data attributes survive production; project realpath, extension/query/virtual/node_modules scope, parser/source/anchor/AST path/project-registry byte bounds, collision and revision checks are enforced; registry is immutable memory-only output with no persistence/publication/lookup; no post-build deletion exists
- Known limitations/degradations: no registry publication/lookup, source resolution, HMR revision, browser client/HTML/endpoint injection, runtime owner/usage evidence, Coordinator/MCP or compatibility outside the accepted matrix was added; P0-T16 owns publication and lookup
- Next eligible task: `P0-T16`

## P0-T16 — Revision-scoped source registry publication and lookup prototype

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a
- Changed files: private `packages/source-registry/`, workspace references/lock metadata, roadmap/status/prompt/progress records, and `docs/test-evidence/P0-T16/20260729T150232+0800/`
- Commands: targeted P0-T16 Vitest/typecheck/lint; full Vitest; build/typecheck/lint; workspace/roadmap/license checks; real demo production build; frozen and isolated clean frozen install; full Python preflight regression; Git diff/whitespace and evidence SHA checks
- Test evidence: 13 P0-T16 tests and 62 existing tests passed across 11 source test files; seven workspace tests, build, strict typecheck, lint, 9-phase/136-task/25-contract roadmap validation, 235-package/zero-vendored license audit, frozen/clean install and all 98 preflight tests passed
- Registry evidence: a real P0-T15 immutable transform snapshot publishes atomically and idempotently under exact compatibility; current membership returns one immutable `registry-matched` direct source with normalized relative location, opaque file identity and evidence hash; one previous revision is diagnostic-only and old lookup is stale
- Edge/browser verification: no browser rerun was required because this task is an in-memory registry prototype; it preserves the already-passed P0-T0G real Edge channel gate and P0-T15 production non-participation boundary without adding browser ingress
- Security/data-lifecycle verification: closed publication and lookup inputs reject unknown fields, oversized records, non-canonical/traversing paths, mismatched anchor identity hash, duplicate/colliding anchors, incompatible transform, stale project/build/source/sequence and project restart reuse; state is memory-only and bounded to current plus one previous revision, with no filesystem/source read, persistence, transport, browser, MCP, HMR, candidate or edit-authority implementation
- Known limitations/degradations: direct lookup is coordinator-side prototype data only and does not prove DOM binding or user authorization; no Coordinator discovery/channel, selection-to-registry ingress, heuristic source candidate, cross-revision successor/reattachment, source content read, MCP surface or crash recovery is claimed
- Next eligible task: `P0-T17A`

## P0-T17A — Versioned read-only pilot harness and canonical evidence bundle

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; this task deliberately produces no `P0-VALUE` verdict
- Changed files: private `packages/pilot-harness/`, workspace references/lock/notices, roadmap/status/prompt/progress records, and `docs/test-evidence/P0-T17/20260729T164018+0800/`
- Commands: targeted harness Vitest/typecheck/lint; full Vitest/build/typecheck/lint; roadmap/workspace/license gates; isolated clean frozen install; real demo production build; full Python preflight regression; Git whitespace/diff review
- Test evidence: 8 P0-T17A target tests and 83 total Vitest tests across 12 files passed; root build, strict typecheck and lint passed; roadmap validation remained at 9 phases/136 tasks/25 contracts; workspace fixed Node/pnpm, 235-package/zero-vendored license audit, clean frozen install, production demo and 98 preflight tests passed
- Harness evidence: `VersionedReadOnlyPilotHarness` accepts only 3–5 closed, hash-bound, root-confined regular-file inputs and fixed read/hash/validate/rank/evaluate operations; it verifies the exact Git fixture commit, rehashes every input after building, rejects symlink/path escape/holdout overlap/timing or cache divergence/direct-as-candidate misuse, and emits immutable namespaced raw-record hashes
- Bundle evidence: `CanonicalEvidenceBundleBuilder` emits deterministic key-sorted JSON, a SHA-256 content hash, strict Draft 2020-12 validation and a bounded human summary; final evidence exposes only opaque hashes/match booleans and excludes ground-truth paths, participant prompt text, selection text, raw page paths, physical paths and registry relative paths
- Edge/browser verification: no browser rerun was required for this offline harness; the existing real Edge channel gate and production non-participation evidence remain unchanged
- Security/data-lifecycle verification: participant task manifests contain only the ground-truth content hash, while evaluator-only build requests provide the separately hashed ground-truth file after trials; the implementation imports no filesystem write or network API, accepts no output path/arbitrary command/URL, writes no product state and claims no persistence, Coordinator, MCP, browser, capture or verdict capability
- Known limitations/degradations: P0-T17A validates synthetic trial inputs but does not execute fresh Codex arms, collect real timings, consume a later holdout, calculate statistics or decide `continue|adjust|stop`; those remain solely P0-T17B
- Next eligible task: `P0-T17B`

## P0-T17B — UX-GATE-001 value micro-pilot

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: `P0-VALUE=adjust`; attempt 1 is immutable and does not authorize P0-T7
- Evidence: owner authorization, two abandoned-before-results preregistrations, active plan, raw Codex events, ten per-arm records, canonical bundle, result hashes and verdict are under `docs/test-evidence/P0-T17B/`; active preregistration hash is `2bf456e2220cf61fb78c97c1854d6575847d783b66404ba3db3746380573b1bb` and canonical bundle hash is `d7eaabf23afd3456c7adbd4cf9f1abd6c381c69149d7650b5ac9b361c642f65e`
- Pilot result: all 10 processes exited 0 with 10 unique thread IDs; 10/10 structured responses mapped exactly to ground truth, all 5 VEM direct-primary records matched, and wrong attribution, target change, reselection and operator correction were all zero
- Cost result: VEM was faster on only 2/5 pairs; direct median was `30,373,336,505 ns`, VEM median was `39,209,353,423 ns`, median saving was zero, total setup was `51,592,551 ns`, and all three preregistered cost conditions triggered `adjust`
- Commands: preregistration/runner hash verification; ten authorized `codex exec --ephemeral` read-only arms; `RESULTS.sha256`; independent bundle schema/hash and verdict recomputation; targeted/full Vitest, build/typecheck/lint, roadmap/workspace/license, clean frozen install, production demo, 98 preflight tests and Git whitespace check
- Test evidence: 5 P0-T17B scoring tests and 8 P0-T17A harness tests passed; root build, strict typecheck, lint and 88 Vitest tests passed; result manifest, all 10 raw records, canonical schema/hash and recomputed verdict passed; roadmap validation now covers 9 phases, 138 tasks and 25 contracts
- Edge/browser verification: no browser rerun was required for this offline value pilot; existing real Edge channel evidence remains unchanged
- Security/data-lifecycle verification: participant copies contained only two fixture source files plus VEM context in the assisted arm; evaluator ground-truth/holdout identifiers did not appear in result events; later holdout remained untouched; all payloads were sent only after explicit owner authorization
- Known limitations/degradations: this five-task personal-project engineering smoke makes no statistical or percentage product claim; raw events show repo-local visual UI skill discovery in some VEM arms and the participant workspace lived under the repository evidence tree, so P0-T17C must make the equal-base-context/capsule boundary explicit before a new attempt
- Next eligible task: `P0-T17C`; P0-T17D attempt 2 remains dependent on its remediation and P0-T7 remains decision-gated

## P0-T17C — Participant capsule and equal-base-context remediation

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `P0-VALUE` remains pending on P0-T17D attempt 2
- Changed files: `scripts/pilot/capsule.mjs`, capsule tests, bounded remediation evidence generator, roadmap/requirements/delivery/status/prompt/progress records, and `docs/test-evidence/P0-T17C/20260729T173959+0800/`
- Commands: real Bubblewrap filesystem and capsule-local Codex binary probes; attempt-one raw-event leak audit; SHA-256 evidence verification; targeted/full Vitest; build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo; 98 preflight tests; Git whitespace check
- Test evidence: 5 new capsule tests and 93 total Vitest tests across 14 files passed; 5 capsule pairs produced one shared base-context hash and five distinct VEM treatment hashes; 10 filesystem probes, 10 Codex binary probes, positive/negative event audits, evidence hashes, 9-phase/138-task/25-contract roadmap validation and all repository gates passed
- Capsule evidence: participant workspaces are created under a random `/tmp/vem-p0-t17c-capsule-*` root outside repository/evidence, mounted read-only at `/work`; system binaries and the pinned Codex installation are read-only, Codex home is tmpfs, and control manifests are not mounted
- Security/data-lifecycle verification: repository, home, `/mnt`, root, project rules/skills, evaluator ground truth and holdout are absent inside the outer capsule; only `App.tsx`, `fixtures.ts`, response schema and assisted-arm `vem-context.json` are visible; auth is a runtime-only mode-0600 read-only mount and is never copied or recorded; command/stdout/stderr path escape audits fail closed; all ten probe capsules were removed with zero residue
- Known limitations/degradations: Linux Bubblewrap is the selected P0 capsule provider; API network remains available to the Codex process while model-generated commands retain the inner read-only Codex sandbox; this task proves the runner boundary only and does not execute attempt 2 or change the decision
- Next eligible task: `P0-T17D`; P0-T7 remains locked until the current attempt records `continue`

## P0-T17D — P0-VALUE attempt 2

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: `P0-VALUE=stop`; the immutable attempt-two verdict makes P0 `failed` and does not authorize P0-T7
- Evidence: explicit owner authorization is at `docs/test-evidence/P0-T17D/OWNER_AUTHORIZATION_20260729.md`; the preregistered plan, inputs, ten raw runs, trials, setup cost, canonical bundle, result manifest and verdict are under `docs/test-evidence/P0-T17D/20260729T174733+0800/`; preregistration hash is `df5859bc0af40b0daca4f2ea8b6030e8d2b950228595595a29aba8976fc70d93` and canonical bundle hash is `80b08ac28f248addc1b1f1af13bc6f4678e5d63836e6a55ad8ca5cbd700c508d`
- Pilot result: all 10 authorized processes exited 0 with 10 unique fresh thread IDs; 10/10 structured responses mapped exactly to ground truth, all 5 VEM records matched direct-primary, wrong attribution was zero, attempt-one evidence stayed immutable, and the later holdout remained untouched
- Cost result: VEM was faster on only 2/5 pairs; direct median was `41,985,459,470 ns`, VEM median was `44,209,203,458 ns`, median saving was zero, total setup was `119,319,692 ns`, and amortized setup was `23,863,938 ns`; all three preregistered cost conditions failed
- Capsule verdict: 7/10 runs triggered the frozen `CAPSULE_COMMAND_PATH_ESCAPE` rule, so the preregistered fail-closed outcome is `stop`; a separate post-hoc analysis at `docs/test-evidence/P0-T17D/ATTEMPT_2_AUDIT_ANALYSIS_20260729.md` found the parser matched source strings `/`, `/>`, and `/projects/:projectId`, with no repository/home/rule/skill marker observed, but does not modify the raw result
- Commands: preregistration/runner/capsule hash verification; ten owner-authorized capsule-contained `codex exec --ephemeral` read-only arms; `RESULTS.sha256`; independent canonical schema/hash and verdict recomputation; literal stdout/stderr marker scan and read-only audit-token replay; targeted/full Vitest; build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo build; 98 preflight tests; Git whitespace check
- Test evidence: 5 P0-T17D tests, 5 capsule tests, 8 harness tests and 98 total Vitest tests across 15 files passed; result checksums, all 10 raw records, canonical schema/hash, independent verdict recomputation, 9-phase/138-task/25-contract roadmap validation and all repository gates passed
- Edge/browser verification: no browser rerun was required for this offline value pilot; the existing real Edge channel and production non-participation evidence remain unchanged
- Security/data-lifecycle verification: Bubblewrap kept repository, home, rules, skills, evaluator ground truth and later holdout outside participant visibility; only task fixtures, response schema and assisted-arm VEM context were mounted read-only, auth was a runtime-only read-only mount, all processes used the inner Codex read-only sandbox, and no participant capsule residue remained
- Known limitations/degradations: this five-task personal-project retest is an engineering smoke, not a statistical product claim; the fail-closed audit parser produced post-hoc-classified false positives, while timing independently failed the continue threshold and would have yielded only `adjust`; the immutable `stop` is not overwritten
- Next eligible task: none in the owner-approved P0 scope; P0-T7 and every dependent task remain ineligible because `P0-VALUE=continue` was not satisfied

## P0-T17E — Terminal-stop capsule audit remediation

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `P0-VALUE=stop` and P0 `failed` remain authoritative
- Changed files: versioned `scripts/pilot/capsule-audit-v2.mjs`, replay generator and 5 tests; ROADMAP/requirements/status/delivery/prompt/progress records; active evidence at `docs/test-evidence/P0-T17E/20260729T182851+0800/`
- Evidence: legacy `scripts/pilot/capsule.mjs` and `p0-t17d.mjs` remain byte-identical to preregistered hashes `13a92abba7c00a89d2dc0e9344f590edd0808a0063723b2a005ac423cf626956` and `25f76241ed3a5a124e595d5b2667b02d668b75314096b0368618e207a16946ae`; v2 auditor/replay hashes are `105e99adedeedf98727980eb4a278f527480584d3695568be38b07ba3976777b` and `0ad68df29ac4160a53a2a94ad37051b6c6ad4004a23f7107d917ed75358165f5`; active replay hash is `48f3c70db5c471e2b1b94d1c18730f0a60e51b730182ec5ade4b89a563b789d7`
- Remediation result: the v2 parser separately audits absolute paths in commands, path-shaped structured output lines, stderr and forbidden markers, while treating route `/`, JSX `/>`, parameterized route data and embedded source JSON as data; all 10 immutable attempt-two streams pass v2 versus 7 legacy false positives
- Commands: targeted v2 Vitest; versioned replay generator; active `SHA256SUMS`; full Vitest/build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo build; 98 preflight tests; Git whitespace and final hash/state checks
- Test evidence: 5 P0-T17E target tests and 103 total Vitest tests across 16 files passed; actual command `/home`, output `/root`, stderr `/mnt`, forbidden rule/skill marker, malformed/oversized JSONL and attempt evidence/source mutation fail closed; roadmap validation covers 9 phases, 139 tasks and 25 contracts; all repository gates passed
- Edge/browser verification: not applicable to this post-hoc offline evidence parser; no browser or external model rerun occurred
- Security/data-lifecycle verification: v2 keeps bounded JSONL/stderr byte and event limits, scans command/output/stderr at their appropriate structure, returns no physical external path on success, and writes only canonical non-authoritative replay metadata under the task evidence root; P0-T17D inputs/results, auth, ground truth and later holdout were not read into participant context or modified
- Known limitations/degradations: v2 is a post-hoc diagnostic and cannot revise P0-T17D; the pilot timing still independently misses every continue cost threshold, so no product-path authorization follows from the 10/10 replay pass
- Next eligible task: none; P0-T7/P0-T9A/P1 remain locked by `P0-VALUE=stop` and failed P0

## P0-T17F — Terminal-stop timing forensics

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `P0-VALUE=stop` and P0 `failed` remain authoritative
- Changed files: bounded `scripts/pilot/analyze-p0-t17d-timing.mjs`, 5 tests, ROADMAP/requirements/status/delivery/prompt/progress records, and active evidence at `docs/test-evidence/P0-T17F/20260729T183822+0800/`
- Evidence: analyzer SHA-256 is `443bad08176cba5e3edca959e2db082d31a48033bcfed2848dc92f0079512777`; bound attempt result-manifest/verdict and active audit replay hashes are `463db09ac15c078d53fb34be7d4083574b1a5c34a84071d0646a6775a22fc7ee`, `38d1dd20b591baadaed2ba4b2ebd93723706387133e366370e62c7f431ee336a`, and `48f3c70db5c471e2b1b94d1c18730f0a60e51b730182ec5ade4b89a563b789d7`; canonical report hash is `664d8e49e0fdb573944aadc14b0affbcfae1fa0f3cc2db4c7104dc8f9eac5afc`
- Forensics result: all 10 run durations exactly equal their trial and canonical raw-record durations; direct/VEM medians reproduce `41,985,459,470 / 44,209,203,458 ns`, VEM is faster on 2/5 pairs, and second arm is faster on 3/5 pairs
- Descriptive event result: direct/VEM report 11/9 completed commands, one recovered nonzero command each, input tokens `230,178 / 188,629`, cached input tokens `138,496 / 56,064`, and command-output bytes `9,063 / 13,156`; these counts are observations, not duration attribution
- Commands: targeted timing-forensics Vitest; canonical report generator; evidence SHA-256; full Vitest/build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo build; 98 preflight tests; Git whitespace and source/evidence binding checks
- Test evidence: 5 P0-T17F target tests and 108 total Vitest tests across 17 files passed; malformed/duplicate/incomplete/oversized events, command pairing, usage bounds, BigInt nanosecond precision, run/trial/bundle mismatches, verdict metric mismatch and terminal evidence mutation fail closed; roadmap validation covers 9 phases, 140 tasks and 25 contracts; all repository gates passed
- Edge/browser verification: not applicable to this post-hoc offline analysis; no browser or external model rerun occurred
- Security/data-lifecycle verification: analysis reads only hash-bound attempt/audit evidence, preserves all decimal integers as strings, records no prompt/source/output bodies in its report, writes only canonical bounded metadata under the task evidence root and does not touch auth, ground truth, holdout, participant context or product state
- Known limitations/degradations: JSONL events provide total-run ordering and final usage but no per-event timestamps; command, token, cache and byte counts cannot identify model/service latency or causally explain arm duration, and the five-task disclosed retest supports no statistical product claim
- Next eligible task: none; P0-T7/P0-T9A/P1 remain locked by `P0-VALUE=stop` and failed P0

## R0-T1 — Independent recovery charter and no-product-unlock validator

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `R0-RECOVERY` remains pending on R0-T4 while `P0-VALUE=stop` remains terminal
- Changed files: `docs/DESIGN.md` R0-RECOVERY-001 authority, independent R0 phase and decision chain in `ROADMAP.yaml`, reverse mapping in `docs/requirements.yaml`, owner decision and delivery charter, four R0 prompts, recovery-boundary validator/tests, charter proof generator/tests, status/progress and `docs/test-evidence/R0-T1/`
- Charter result: R0 has no phase dependency, declares recovery of failed P0, uses a separate decision key with `does_not_supersede: P0-VALUE`, and cannot become a dependency of any existing phase/task; a future R0 continue can only authorize an owner-reviewed proposal for another independent research phase
- Commands: targeted 14-test roadmap validator and 2-test charter proof suites; charter evidence generator and SHA-256; full Vitest/build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo build; 98 preflight tests; Git whitespace and final source/evidence binding checks
- Test evidence: 16 targeted tests and 113 total Vitest tests across 18 files passed; non-failed recovery target, R0 phase dependency, missing authorization, decision phase/supersession drift, existing phase/task dependency leakage and unsupported decision requirement all fail closed; roadmap validation covers 10 phases, 144 tasks and 26 contracts
- Edge/browser verification: not applicable; R0-T1 changes only normative scope, roadmap validation and evidence, with no browser or external model execution
- Security/data-lifecycle verification: owner authorization is recorded without secret material; P0 raw evidence, verdict and phase remain immutable; no auth, participant context, ground truth, holdout, source mutation, network payload or product runtime state is introduced
- Known limitations/degradations: R0-T1 provides governance and mechanical dependency isolation only; it does not implement timing instrumentation, create a recovery corpus, run an experiment, change any terminal verdict or authorize product capability
- Next eligible task: `R0-T2`

## R0-T2 — Trusted outer-runner monotonic receipt ledger

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `R0-RECOVERY` remains pending on R0-T4 and `P0-VALUE=stop` remains terminal
- Changed files: pilot-harness receipt-ledger implementation/export/package test script, ledger and real-process proof tests, R0-T1 lifecycle regression assertion, task/roadmap/status/progress metadata and `docs/test-evidence/R0-T2/20260729T191734+0800/`
- Ledger result: one real local Node process produced 8 trusted receipt points spanning spawn, four stdout JSONL events, one structured response, one stderr chunk and exit; canonical ledger hash is `6171f65f06ca494a4eb274b1b34c81526a492254dd680475eb969adc55a5fd45`
- Commands: 9 targeted receipt/proof tests; full Vitest/build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo build; 98 preflight tests; evidence SHA-256 and Git whitespace checks
- Test evidence: 123 total Vitest tests across 20 files passed; lifecycle, monotonic/invalid clock, bounded bytes/entries, raw hashes, cancellation/error, malformed/duplicate response, terminal completeness, canonical sealing, raw-body exclusion and real-process collection all pass
- Edge/browser verification: not applicable; R0-T2 changes only the research harness and executes one local Node probe, with no browser path or external model call
- Security/data-lifecycle verification: ledger stores only bounded hashes and metadata, never raw event/response/stderr bodies; evidence is canonical, hash-bound and task-root constrained; no auth, participant context, ground truth, holdout, network payload or product runtime state is introduced
- Known limitations/degradations: receipt timestamps are local outer-runner observations only and do not identify provider generation time, model compute time or shell-internal timing; the proof is instrumentation validation, not a product-benefit result
- Next eligible task: `R0-T3`

## R0-T3 — Recovery-only task bank and immutable preregistration

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `R0-RECOVERY` remains pending on R0-T4 and `P0-VALUE=stop` remains terminal
- Changed files: recovery plan/verdict module, preregistration generator, hash-bound future R0-T4 runner, 7 preregistration/verdict/authorization tests, task/roadmap/decision/status/progress metadata and `docs/test-evidence/R0-T3/20260729T193158+0800/`
- Preregistration result: 5 fresh recovery-only tasks and 10 counterbalanced arms are frozen under hash `57fb4b9b033e61eb4e0b4b9a0f14ced28064b6fb17d73f5e7ae60552d0f37359`; runtime instrumentation binds 8 sources under hash `c7851c93a8451436d056cc9b2ed097e4b0fc5c6cc0e9f7289ec22ff710d4067b`
- Commands: 16 targeted R0-T2/R0-T3 tests; preregistration generator; 10 filesystem-isolation and 10 Codex-binary capsule probes; full Vitest/build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo build; 98 preflight tests; final preregistration/source-binding and Git whitespace checks
- Test evidence: 130 total Vitest tests across 21 files passed; fresh task/prompt identity, P0 and product-holdout exclusion, equal capsule base context, treatment-only difference, frozen runner/ledger/auditor hashes, mutation detection, continue/no-benefit/integrity verdicts and separate hash-bound owner authorization all pass
- Edge/browser verification: not applicable; R0-T3 uses a synthetic source-location fixture and local capsule probes only, with no browser or external model execution
- Security/data-lifecycle verification: evaluator ground truth stays under `private/` and is absent from participant capsules; product holdout IDs are copied only into an exclusion record and remain unconsumed; repository/home/rules/skills stay absent from capsules; no auth contents, raw external output, network payload or product runtime state is stored
- Known limitations/degradations: this five-task recovery corpus is an engineering smoke, not a product holdout or statistical claim; receipt time remains runner-local; external execution and any R0 verdict require the separate R0-T4 authorization and cannot alter P0
- Next eligible task: none until `OWNER-R0-T4-EXTERNAL-BATCH` explicitly authorizes the frozen preregistration hash

## R0-T4 — Independent recovery micro-pilot verdict

- Date: 2026-07-29
- State/outcome: `done` / `failed`
- Decision: `R0-RECOVERY=stop`; R0 phase is `failed`, while `P0-VALUE=stop` remains independently terminal
- Changed files: hash-bound owner authorization, immutable failure/verdict/summary/SHA evidence, ROADMAP decision/phase/task state, decision/status/delivery/prompt/progress records
- Execution result: frozen preregistration and all 8 runtime source bindings passed; one authorized external process began for `r0-ux-01-sync-state/direct-search`, then the frozen runner attempted a duplicate structured-response receipt and the ledger rejected it with `RECEIPT_LEDGER_RESPONSE_DUPLICATE`
- Stop behavior: the preregistered `event-ledger-integrity-failed` condition took precedence over the incomplete-run adjust reason; the remaining 9 authorized calls were deliberately not executed
- Evidence: `docs/test-evidence/R0-T4/20260729T194719+0800/`; failure/verdict hashes are `9a6e06c84f06484565700559ebda113cd8bfcaf9b778ae9d9176b7db41e78269` / `5815559a6d2b8d9c71246067a4befefe97f375edb476ffd479ee56c07978e38b`
- Commands: frozen digest/source/authorization checks; one fail-closed external invocation; evidence SHA-256; 17 targeted verdict/preregistration/ledger tests; full Vitest/build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo build; 98 preflight tests; Git whitespace and final source-binding checks
- Test evidence: 133 total Vitest tests across 22 files passed; frozen authorization and source binding, first-arm failure identity, stop-over-adjust precedence, empty unsealed run directory, P0/R0 terminal isolation and R0 charter terminal-state lifecycle all pass
- Edge/browser verification: not applicable; no browser path changed or ran
- Security/data-lifecycle verification: the process ran in the frozen read-only capsule; capsule cleanup completed and no Codex/bwrap child remained; ground truth and product holdout stayed outside participant context
- Known limitations/degradations: failure occurred before sealed-write, so no complete raw stream, receipt ledger, correctness or cost metric exists; the stop is an instrumentation-integrity verdict, not a source-location or product-benefit result
- Next eligible task: none; R0 and P0 are failed, and no product task is unlocked

## R1-T1 — Independent runner-remediation charter

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `R1-RECOVERY` remains pending while `R0-RECOVERY=stop` and `P0-VALUE=stop` remain terminal
- Changed files: R1 normative contract, independent phase/decision/task chain, owner decision, delivery plan, four prompts, validator dual-terminal checks/tests, charter proof/tests and `docs/test-evidence/R1-T1/20260729T201742+0800/`
- Charter result: R1 phase and charter task have empty dependencies, recover failed R0 by immutable evidence only, cannot become an existing phase/task dependency, and explicitly do not supersede either R0 or P0 decision chain
- Commands: 20 targeted validator/R0/R1 charter tests; charter generator and SHA-256; full build/typecheck/lint/roadmap/Vitest gates
- Test evidence: 136 total Vitest tests across 23 files passed; roadmap validates 11 phases, 148 tasks and 27 contracts; proof hash is `d74ec66439511739af86a8b8f19c3594316034ffd11ce35a01ba517dd42bb6a7`
- Edge/browser verification: not applicable; governance and validation only
- Security/data-lifecycle verification: no external call, participant data, auth, ground truth, holdout or product runtime change; product unlock count is zero
- Known limitations/degradations: R1-T1 provides only authority and isolation; it does not repair the runner or authorize an experiment
- Next eligible task: `R1-T2`

## R1-T2 — Multi-message classification and failure evidence sealing

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `R1-RECOVERY` remains pending while `R0-RECOVERY=stop` and `P0-VALUE=stop` remain terminal
- Changed files: remediated recorder/process executor, 6 recorder tests, local proof generator/test, task/status/progress metadata and `docs/test-evidence/R1-T2/20260729T202500+0800/`
- Runner result: all JSONL events are ordinary receipts; schema-valid candidates are classified only after process and stream close, then one final response is selected exactly once. Zero valid or conflicting valid candidates fail closed, while identical repeated valid candidates remain non-conflicting.
- Failure sealing: raw stdout/stderr are created before spawn and incrementally written; raw streams, terminal observation, receipt ledger, failure metadata and SHA-256 manifest are sealed before a failure is returned
- Commands: 7 targeted recorder/proof tests; two real local Node process proofs; full build/typecheck/lint/roadmap/Vitest gates; evidence SHA-256 verification
- Test evidence: 143 total Vitest tests across 25 files passed; roadmap validates 11 phases, 148 tasks and 27 contracts. Instrumentation hash is `c4f972ea540b12b877be0918397352cbdf0980974f086e1dffe81b290b29614a`; success/failure ledger hashes are `959a4d0df4faf5177d7073468e54958a61510224f65062aa40ecc106ceb40027` / `abeaf2364461d5e5d22036a2d69843f0eebf91e99ff7b3141dd143af27c3dd9e`
- Edge/browser verification: not applicable; only local synthetic child processes ran
- Security/data-lifecycle verification: no external call, participant data, authorization payload, ground truth, product holdout or product runtime state was consumed; evidence is bounded and hash-sealed
- Known limitations/degradations: R1-T2 repairs and proves the recorder semantics only; it neither freezes nor authorizes a new experiment
- Next eligible task: `R1-T3`

## R1-T3 — Remediated recovery preregistration

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `R1-RECOVERY` remains pending while `R0-RECOVERY=stop` and `P0-VALUE=stop` remain terminal
- Changed files: fresh R1 recovery plan/fixture, hash-bound future R1-T4 runner, preregistration generator, 8 preregistration/verdict/authorization tests, open owner-authorization record, delivery/task/status/progress metadata and `docs/test-evidence/R1-T3/20260729T203631+0800/`
- Preregistration result: 5 fresh runner-remediation-only tasks and 10 counterbalanced arms are frozen under hash `8d93104c915fdb0acce9f31bdf7c34bbc4d19f0ac74e1b2609a10ddce35ca7f1`; 7 runtime sources are bound under instrumentation hash `388b1e0d89deea9a91c2d8c3701131fa358d60f988a78fd9d9098cd4c07cd231`, distinct from R0
- Failure contract: all agent messages remain ordinary receipts until streams close; exactly one schema-valid nonconflicting response is selected; protocol failures seal raw stdout/stderr, terminal observation, ledger, failure metadata and SHA manifest before return, then stop the batch
- Commands: 15 targeted R1-T2/R1-T3 tests; preregistration generator; 10 filesystem-isolation and 10 Codex-binary capsule probes; full Vitest/build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo build; 98 preflight tests; final preregistration/source-binding and Git whitespace checks
- Test evidence: 151 total Vitest tests across 26 files passed; roadmap validates 11 phases, 148 tasks and 27 contracts; workspace uses exact Node 24.18.0/pnpm 10.34.0; 235-package/zero-vendored license audit and all 20 local capsule probes passed
- Edge/browser verification: not applicable; R1-T3 uses a synthetic source-location fixture and local capsule/version probes only, with no browser or external model execution
- Security/data-lifecycle verification: evaluator ground truth remains under `private/` and absent from participant paths; prior P0/R0 tasks/prompts and product holdouts are excluded; repository/home/rules/skills remain absent from capsules; `externalExecutionAuthorized=false`, no R1-T4 evidence root exists and no external payload was sent
- Known limitations/degradations: the five-task batch is an engineering smoke, not a statistical or product claim; receipt timing does not expose provider/model/shell-internal time; R1 cannot supersede R0/P0 or unlock product work
- Next eligible task: none until the owner explicitly authorizes `R1-T4` bound to preregistration hash `8d93104c915fdb0acce9f31bdf7c34bbc4d19f0ac74e1b2609a10ddce35ca7f1`

## R1-T4 — Separately authorized remediated recovery verdict

- Date: 2026-07-29
- State/outcome: `done` / `failed`
- Decision: `R1-RECOVERY=stop`; R1 phase is `failed`, while `R0-RECOVERY=stop` and `P0-VALUE=stop` remain independently terminal
- Changed files: hash-bound owner authorization, two-run raw/ledger/evaluation/failure evidence, aggregate verdict/hash evidence, task-specific immutable-evidence tests, ROADMAP decision/phase/task state and decision/status/delivery/prompt/progress records
- Execution result: frozen preregistration and all 7 runtime source bindings passed. The direct arm exited zero with the exact line and passed capsule/evidence checks. The paired VEM arm also exited zero but emitted two distinct schema-valid responses: `line:1/sourceAnchorId:null` followed by the correct `line:7/vem1_1fca6dac19137a546084bc64ae003bc0`
- Stop behavior: the remediated recorder classified candidates only after stream close, recorded `STRUCTURED_RESPONSE_CONFLICT`, selected neither response, sealed failure evidence and stopped the remaining 8 authorized calls
- Evidence: `docs/test-evidence/R1-T4/20260729T213524+0800/`; verdict/batch-stop/aggregate-manifest hashes are `a0a9556a63d68fcbe769da96f140e54d1d966421d0c3bad1cbffca1f24ab9baa` / `0638600b21322d4fba52ccf8f93ccc9e2043b9b497c50594a300f647a7e079f0` / `3c1dfe69afc67f35b85196f1ebaa0f2eb7cf78471949ab7ad2b1013165ef21d6`
- Commands: frozen digest/source/authorization checks; 2 external fresh-context arms before preregistered batch stop; per-run and aggregate SHA verification; 19 targeted R1 tests; full Vitest/build/typecheck/lint; roadmap/workspace/license; isolated clean frozen install; production demo build; 98 preflight tests; `.gitignore`, secret-pattern, Git whitespace and final source/evidence binding checks
- Test evidence: 155 total Vitest tests across 27 files passed; roadmap validates 11 phases, 148 tasks and 27 contracts; exact Node 24.18.0/pnpm 10.34.0 workspace, 235-package/zero-vendored license audit and clean install passed
- Edge/browser verification: not applicable; no browser path changed or ran
- Security/data-lifecycle verification: both processes ran inside the frozen read-only capsule with fresh thread IDs; ground truth, prior task prompts and product holdout remained outside participant context; per-run and aggregate hashes passed
- Known limitations/degradations: only 2 of 10 processes ran, so no five-pair cost comparison or product-benefit claim exists; the stop is a conflicting-final-response protocol verdict
- Next eligible task: none; R1, R0 and P0 are failed, and no product task is unlocked

## R2-T1 — Independent final-output remediation charter

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `R2-RECOVERY` remains pending while `R1-RECOVERY=stop`, `R0-RECOVERY=stop` and `P0-VALUE=stop` remain terminal
- Changed files: R2 normative contract, independent phase/decision/task chain, owner decision, delivery plan, four prompts, triple-terminal charter proof/tests, task/status/progress metadata and `docs/test-evidence/R2-T1/20260729T223351+0800/`
- Charter result: R2 phase and charter task have empty dependencies, recover failed R1 by immutable terminal state only, cannot become an existing phase/task dependency, and explicitly do not supersede R1, R0 or P0 decision chains
- Commands: 17 targeted validator/charter tests; roadmap validation; charter generator and SHA-256; build/typecheck/lint; 157-test full Vitest gate outside the sandbox because its local Node child-process probes are denied with EPERM inside the sandbox
- Test evidence: 157 total Vitest tests across 28 files passed; roadmap validates 12 phases, 152 tasks and 28 contracts; proof hash is `46e7522676d366c5b93f2e32b6c682fabb76c5d3fa790a37a60eb6692171c25d`
- Edge/browser verification: not applicable; governance and validation only
- Security/data-lifecycle verification: no external call, participant data, auth, ground truth, holdout or product runtime change; product unlock count is zero
- Known limitations/degradations: R2-T1 provides only authority and isolation; it does not repair the runner or authorize an experiment
- Next eligible task: `R2-T2`

## R2-T2 — Authoritative final-output file and single-file capsule bind

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `R2-RECOVERY` remains pending and all prior stop verdicts remain terminal
- Changed files: new R2 capsule invocation/output mount, authoritative final-response recorder/classifier, 12 tests, local proof generator, roadmap/status/prompt/progress metadata and `docs/test-evidence/R2-T2/20260729T224307+0800/`; frozen R1 sources/evidence were not modified
- Runner result: JSONL agent messages are audit receipts only; the bounded runner-owned `--output-last-message` file is read once after process/stream close, validated and required to equal the last agent-message before selection. The reproduced early-wrong/later-correct stream selects line 7 without a conflict.
- Capsule result: `/work` remains read-only; a read-only output directory is overlaid with exactly one writable mode-0600 final-response file at `/run/vem/final-response.json`; workspace and sibling writes fail while the authoritative file write succeeds
- Failure/classification result: missing, empty, invalid, mismatched, oversized and symlink outputs plus stream cancellation fail closed and seal raw/final observation/terminal/ledger/error/hash evidence; protocol failure with no selected response records `wrongAttribution=false`, while an actually selected incorrect response remains wrong attribution
- Commands: 12 targeted local-process/Bubblewrap/proof tests; roadmap validation; build/typecheck/lint; 169-test full Vitest gate outside the sandbox; proof generator and SHA256SUMS verification
- Test evidence: 169 total Vitest tests across 31 files passed; roadmap validates 12 phases, 152 tasks and 28 contracts; instrumentation/proof hashes are `235e7c8433787ef838c1f30d492e3ef24cb62ebd6ebf26bd43ca9cd559c0f8ab` / `0dcae05aec4d39e37089039354a1c6fa1085387a364a7ae00effa7ac365ecbd8`
- Edge/browser verification: not applicable; only local synthetic processes and Bubblewrap probes ran
- Security/data-lifecycle verification: one runner-owned 0700 control root and 0600 file are used, no participant-selected host path exists, raw/final/error evidence is bounded and hash-sealed, capsule cleanup removes the control file, and no external model/auth/ground-truth/holdout/product state was consumed
- Known limitations/degradations: this task proves the runner authority boundary locally; it does not freeze or authorize a new experiment
- Next eligible task: `R2-T3`

## R2-T3 — Final-output recovery-only preregistration

- Date: 2026-07-29
- State/outcome: `done` / `passed`
- Decision: n/a; `R2-RECOVERY` remains pending and all P0/R0/R1 stop verdicts remain immutable
- Changed files: fresh R2 recovery plan/fixture, hash-bound future R2-T4 runner, preregistration generator, 4 preregistration/authorization/verdict/mutation tests, open owner-authorization record, delivery/task/status/progress metadata and `docs/test-evidence/R2-T3/20260729T225128+0800/`
- Preregistration result: 5 fresh final-output-remediation-only tasks and 10 counterbalanced arms are frozen under hash `dddd48ade2a92b2e12ec7600c9cdc0bd65eee6d47023d01d70b8bd71b47c273a`; 8 runtime sources are bound under instrumentation hash `09e237ddec722207ee3b2e22c714ca5631700ff7393877a66fdd75d04c46b8a0`, distinct from R1
- Authority/failure contract: `--output-last-message` runner file is authoritative, JSONL is audit-only, `/work` is read-only with one writable final file, final file must be bounded/schema-valid/canonically consistent with the last agent-message, and protocol failures are separate from actual wrong attribution while every path seals evidence before return
- Isolation result: 10 filesystem, 10 capsule-local `codex --version` and 10 final-output single-file probes passed; every task pair has the same base context and only the VEM arm receives `vem-context.json`
- Commands: 4 targeted R2-T3 tests; preregistration generator; independent preregistration/source-binding verification; full Vitest/build/typecheck/lint/roadmap; workspace/license; isolated clean frozen install; production demo; 98 preflight tests
- Test evidence: 173 total Vitest tests across 32 files passed; roadmap validates 12 phases, 152 tasks and 28 contracts; exact Node 24.18.0/pnpm 10.34.0, 235-package/zero-vendored license audit, clean install, production non-leakage and all local probes passed
- Edge/browser verification: not applicable; synthetic source-location fixture and local capsule/version/output probes only, with no browser or external model execution
- Security/data-lifecycle verification: evaluator ground truth remains under `private/` and absent from participant paths; all prior tasks/prompts and product holdouts are excluded; repository/home/rules/skills remain absent; the only new capsule write is the runner-owned bounded final file and capsule cleanup removes it
- Known limitations/degradations: this is a five-task recovery engineering smoke, not a product holdout or statistical claim; receipt timing still cannot expose provider/model/shell-internal time; R2 cannot supersede prior stops or unlock product work
- Next eligible task: none until the owner explicitly authorizes exactly 10 R2-T4 calls bound to preregistration hash `dddd48ade2a92b2e12ec7600c9cdc0bd65eee6d47023d01d70b8bd71b47c273a`
