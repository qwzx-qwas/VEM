# PLANS.md

Use this template for one eligible atomic roadmap task. A plan is not permission to implement adjacent work.

Abbreviations follow `docs/DESIGN.md`; ADR means Architecture Decision Record（架构决策记录）, E2E means End-to-End（端到端）, and TTL means Time To Live（生存时间）.

## Task identity

- ID:
- Title:
- Phase:
- Task status:
- Task dependencies:
- Phase dependencies:
- Dependency evidence:

## Observable goal

One result that can be tested independently.

## Relevant design contracts

- `docs/DESIGN.md` sections:
- Contract IDs from `docs/requirements.yaml` (`REQ-TRACE-001`, `LICENSE-POLICY-001`, `EDGE-PREFLIGHT-001`, `MCP-COMPAT-001`, `PRIV-MIN-001`, `SEL-PROV-001`, `TOP-P0-001`, `VER-TXN-001`, `SEC-PAIR-001`, `OBS-FRESH-001`, `DATA-LIFE-001`, `CAP-RACE-001`, `FALLBACK-POLICY-001`, as applicable):
- Direct `ROADMAP.yaml` task `contracts` and bidirectional match evidence against `docs/requirements.yaml`:
- ADRs:
- Protocol types/tools/resources affected:
- Delivery milestone and capability actually available at this phase:
- Pinned MCP revision/client capability affected:
- Primary/compat MCP initialization matrix, no-task path and optional Tasks adapter affected:
- Milestone stop/go product evidence affected (held-out projects, no-VEM baseline, install/pair/edit/uninstall outcomes):
- Browser tier/mode affected:
- Transport topology affected:
- Real process owner, startup command, private runtime discovery, proxy endpoint and restart behavior:
- EDGE-PREFLIGHT-001 evidence and Tier-1 runner owner/path, if affected:
- Canonical Git worktree/evidence commit, selected Windows-or-WSL process owner, Node/pnpm exact versions, package registry/proxy/CA, filesystem type and file-watch/HMR evidence, if affected:

## Capability and fallback

- Required capabilities/providers:
- Expected degraded modes:
- Fallback policy under test:
- Security floor that must not be crossed:

## Trust and security boundaries

- Untrusted inputs introduced or consumed:
- SelectionProvenance, prompt/confirmation binding and whether a claim is being mistaken for user authorization:
- Identity derived by each receiving layer:
- MCP consumer identity, immutable selection claim, TTL/release/conflict behavior:
- Schema/size/depth/rate/semantic validation:
- Token/permission impact, including scoped-bearer risk or an accepted proof-of-possession ADR:
- Pairing state, terminal one-time bootstrap code entropy/TTL/atomic consumption, exact origin/Host, optional host permission, CSP, connection epoch, token generation, rotation/revocation and browser-restart impact:
- Privacy/redaction impact:
- P0 minimum outbound allowlist, private field/URL/prompt-data marking and compatible text-output impact:
- Screenshot consent, capture epoch and activation/navigation/document invalidation latch including A-B-A, pre/post active-tab/document checks, per-window serialization/rate limit, local mask/crop, dynamic canvas/video/animation handling, sensitive-page and capture-audit impact:
- Remote/localhost/path risks:
- Page origin/redacted-path policy and any explicit sensitive-detail capability:

## Data path and lifecycle

- Control-plane messages:
- Large/binary data:
- Queue/backpressure/ACK/idempotency impact:
- If capture is introduced: minimum isolated binary lane, concurrency, high/low water mark, cancellation and proof that auth/HMR remain responsive:
- ProjectRevisionContext/RevisionContext projection, ordering/equality rules and project-instance reset:
- Cache key and invalidation:
- Runtime observation namespace/target mutation/viewport epochs, provider integrity, hit revalidation and verification cache bypass:
- Source-anchor migration across revision, if affected:
- Verification prepare barrier, before Observation, target module/dependency scope, journal cursor, relevant-module intersection, unrelated-update ignore rule, bounded update batch, receipt, replay, ambiguity and complete causality, if affected:
- Stored artifacts:
- Storage class (ephemeral browser state, crash-safe control journal, bounded audit metadata, memory-first capture, or P6 durable artifact) and honest restart capability:
- TTL (Time To Live, 生存时间), quota, lease, deletion, and orphan cleanup:

## Existing implementation to inspect

- Files/directories:
- Existing tests/fixtures:
- Existing commands:
- Fresh install/upgrade/clean-uninstall workflow, if the milestone is user-installable:
- Baseline failures or dirty worktree considerations:
- Project/dependency/vendored-asset license decision and `THIRD_PARTY_NOTICES.md` impact:

## Planned changes

1.
2.
3.

## Tests first / tests changed

- Unit:
- Integration:
- Contract:
- Security:
- Reliability/data lifecycle:
- Real-process topology/private-discovery and restart, if affected:
- Pairing bootstrap guessing/replay/concurrent consumption, if affected:
- Install/upgrade/clean-uninstall and production residue, if affected:
- Edge Stable E2E, if required:
- Playwright Chromium fast E2E, if useful:
- Chrome compatibility, if affected:
- Production leakage, if affected:
- Golden-task metrics, source top-k, payload, ambiguity correctness and false-positive `passed`, if affected:
- Preregistered threshold/evidence-plan location, holdout identity, no-VEM comparison and immutable timing boundaries, if affected:
- If this is P0-T17: 3–5 task micro-pilot identities, direct-search baseline, setup-cost boundary, wrong-attribution stop condition and evidence that later holdouts remain untouched:

## Commands

```bash
# roadmap/schema validation
# targeted tests
# affected package typecheck
# affected package lint
# relevant browser/security/lifecycle command
```

## Done when

- [ ] Observable behavior is implemented.
- [ ] Required capability and degradation behavior is explicit.
- [ ] Boundary validation and identity derivation are tested.
- [ ] Selection provenance, external confirmation and claim-versus-consent semantics are explicit where affected.
- [ ] Minimum outbound privacy remains present in every P0/P1 summary and compatible output path.
- [ ] Pairing/permission/capture consent remains user-visible and fail-closed; pairing bootstrap and capture epoch races are covered where affected.
- [ ] Cross-revision anchor, RevisionContext, pre-edit verification barrier, relevant module intersection, update batching and HMR causality are explicit where affected.
- [ ] Consumer claim and mutable active-selection races are tested where affected.
- [ ] Capture target/epoch/dynamic-mask races, including A-B-A activation, and platform rate limits are tested where affected.
- [ ] User-installable milestones pass fresh install, first connection/pairing and clean uninstall without production residue.
- [ ] Cache/lifecycle behavior is defined where data is retained.
- [ ] Runtime-only DOM/layout/viewport changes invalidate or revalidate cached context, and verification does not pass from stale cache.
- [ ] MCP no-task behavior remains functional; optional task support matches the negotiated wire contract.
- [ ] Targeted tests pass.
- [ ] Affected package typecheck and lint pass.
- [ ] Edge/browser evidence is recorded when relevant.
- [ ] Relevant golden-task metrics are recorded and no false-positive `passed` is accepted.
- [ ] No unrelated feature or refactor is included.
- [ ] The task remains within one principal authority/state/protocol failure domain and the expected 1–3 workday size; otherwise it was split before implementation.
- [ ] Diff was reviewed.
- [ ] Task is changed to `done` and progress is updated only after passing.

## Stop conditions

- A task or phase dependency is incomplete.
- EDGE-PREFLIGHT-001 is incomplete for a task that depends on Tier-1 Edge/Windows/WSL/private-runtime behavior.
- The task changes a normative section without a valid `docs/requirements.yaml` contract/task/test mapping.
- The task's direct `contracts` differ from the reverse mapping in `docs/requirements.yaml`.
- A public protocol or architecture decision must change without an ADR.
- The implementation would silently weaken authentication, transport security, privacy, confidence, or permissions.
- Required behavior cannot be tested in the current task scope.
- An unrelated baseline failure prevents trustworthy verification.
- Completing the task requires a later-phase capability not exposed through an approved seam.
