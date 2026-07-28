# P0-T0A0 Execution Plan

## Task Identity

- ID: `P0-T0A0`
- Phase: `P0`
- Initial task/phase state: `todo` / `todo`
- Task and phase dependencies: none
- Required decision verdicts: none
- Direct contract: `EDGE-PREFLIGHT-001`
- Authority: `docs/DESIGN.md` sections 3.1 and 3.1.1

## Observable Goal

Produce one owner-reviewable, replayable read-only migration readiness inventory without
creating `/home/qwzx/src/VEM`, changing the staging payload through a probe, installing a toolchain,
authorizing a layout commit, or switching the canonical writer.

## Boundaries

- Browser, transport, MCP, selection, confirmation, capture, queue, cache, HMR, and artifact
  lifecycle product capabilities are not introduced.
- Inputs are local filesystem and Git metadata. No environment dump, file body, token, URL,
  or secret is serialized; payload contents are represented by hashes and path metadata.
- `/mnt/d/VEM` and `/mnt/d/vem` identity is established by Git top-level plus device/inode.
- The target check is exact-path/case/ext4/capacity/owner/permission only. A read-only
  sandbox result is not promoted; permission is confirmed using an external read-only probe.

## Planned Checks

1. Bootstrap-validate roadmap, requirements, decisions, headings, mappings, and links.
2. Freeze baseline, dirty diff, untracked, and prefix-normalized payload manifests.
3. Reject exact or case-folded target-path collisions.
4. Confirm the absent target's nearest existing ancestor is owner-writable ext4 with capacity.
5. Recheck that target and target parent remain absent.

## Done When

- Every `P0-T0A0` classification in `environment.json` passes and overall is `ready`.
- `SHA256SUMS` verifies all evidence artifacts.
- Regenerating the prefix-normalized manifest is deterministic.
- `ROADMAP.yaml`/`docs/progress.md` are updated only after these checks.
- P0-T0A1 remains independently gated by explicit owner authorization.
