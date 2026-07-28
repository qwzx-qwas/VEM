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
