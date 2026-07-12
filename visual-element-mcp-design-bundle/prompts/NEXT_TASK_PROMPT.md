# Codex Prompt: Generate and Execute the Next Atomic Task

You are the implementation coordinator for Visual Element MCP.

Read `AGENTS.md`, `docs/DESIGN.md`, `docs/requirements.yaml`, `ROADMAP.yaml`, and `PLANS.md`. Before choosing work, run the repository roadmap validator when it exists. Until P0-T2 creates that validator, perform and record a bootstrap read-only check that parses both YAML files and verifies status values, unique IDs, dependency existence, dependency acyclicity, direct task `contracts`, bidirectional equality with requirements mappings, contract section/task/test mappings, normative-section coverage, known contract IDs, and internal documentation links; do not claim the not-yet-created repository validator passed.

Find the earliest `todo` task for which:

1. every task-level dependency is `done`;
2. every phase-level dependency is `passed`;
3. the task's required browser, transport, security, and lifecycle seams already exist or are part of this exact task.

Do not treat `blocked`, `in_progress`, or a phase merely containing done tasks as satisfying dependencies.

Create a plan for only that task using `PLANS.md`. Explicitly identify:

- observable goal;
- applicable stable contract IDs and their authoritative design/ADR/specification locations;
- `LICENSE-POLICY-001` project-owner decision, dependency class and vendored-asset provenance when scaffold, dependency or distribution work is affected;
- `EDGE-PREFLIGHT-001` Tier-1 runner, Edge channel, Windows/WSL reachability, runtime ACL and two-process evidence before any dependent implementation;
- canonical Git/evidence commit, fixed Node/pnpm, package registry/proxy/CA, selected execution/filesystem profile, file-watch/HMR, real `msedge` launch, HTTP/WebSocket, non-loopback refusal and machine-classified preflight failures;
- `MCP-COMPAT-001` primary/compat revision, initialization evidence, no-task core path and optional negotiated Tasks adapter;
- Edge/browser mode and capabilities;
- fallback/degradation behavior;
- untrusted inputs and receiving-layer identity derivation;
- `SEL-PROV-001` provider/interaction/confirmation integrity, prompt binding, claim-versus-user-authorization semantics and strict external-confirmation behavior;
- `PRIV-MIN-001` minimum P0 outbound field allowlist, private field/URL/error redaction and untrusted prompt-data marking;
- ProjectRevisionContext/RevisionContext projection, ordering/equality and project-instance reset behavior;
- MCP consumer identity and immutable selection claim TTL/release/conflicts;
- schemas, size/rate/semantic validation;
- `TOP-P0-001` real Vite/MCP process ownership, user-private runtime discovery, same-origin proxy and project-instance restart behavior, when affected;
- verification prepare barrier, before Observation, fixed target module/dependency scope, coordinator-observed relevant-module intersection, unrelated-update ignore behavior, bounded update batches, journal replay, transaction ambiguity and complete semantics;
- `SEC-PAIR-001` terminal one-time bootstrap code entropy/TTL/atomic consumption plus scoped-bearer generation/restart risk or an accepted proof-of-possession ADR, when affected;
- `CAP-RACE-001` capture epoch invalidated by tab activation/navigation/document/mask events including A-B-A, pre/post active-tab checks, per-window serialization, rate limit, dynamic pixels and mask races, when affected;
- queue/backpressure/ACK/idempotency impact;
- the minimum isolated binary lane before first capture and evidence that binary load does not delay auth/HMR, when affected;
- cache invalidation;
- `OBS-FRESH-001` provider-scoped runtime/target/viewport epochs, revalidation and verification cache bypass;
- TTL (Time To Live, 生存时间), quota, lease, deletion, and orphan behavior;
- `DATA-LIFE-001` storage class and honest restart semantics without claiming P6 durable artifact capabilities early;
- targeted, security, reliability, browser, and production tests.
- golden-task correctness metrics and the zero-false-positive-`passed` gate, when affected.
- fresh install/upgrade/first connection or pairing/clean uninstall and production residue checks at user-installable milestones.
- held-out project and no-VEM baseline evidence required by the current milestone stop/go gate; an internal test pass alone does not authorize the next phase.
- preregistered `UX-GATE-001` thresholds, immutable timing boundaries and evidence-plan checks; do not define success after observing the holdout.
- for P0-T17, the 3–5 task direct-search comparison, setup-cost boundary, wrong-source stop condition, continue-or-adjust verdict and proof that later holdouts were not consumed.

Then implement only the selected task. Do not implement an adjacent phase capability except an interface seam explicitly required by the current task.

Run the available repository roadmap validation (or the documented bootstrap check before P0-T2), targeted tests, affected package typecheck/lint, and the relevant browser/security/lifecycle checks immediately. Never skip, delete, weaken, or broadly rewrite tests to manufacture a pass. Never silently weaken authentication, secure transport, privacy, confidence, permissions, or fallback policy.

If tests pass, set the task to `done` and update `docs/progress.md` with evidence. If an external dependency blocks progress, set `blocked` with evidence. A failed test alone is not permission to mark done or start another task.

Finish with the exact report required by `AGENTS.md`.
