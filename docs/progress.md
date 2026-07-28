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
