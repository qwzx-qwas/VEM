# Codex Prompt: Generate and Execute the Next Atomic Task

You are the implementation coordinator for Visual Element MCP.

Read `AGENTS.md`, `docs/DESIGN.md`, `docs/requirements.yaml`, `ROADMAP.yaml`, `PLANS.md`, and the selected task entry in `docs/tasks/ATOMIC_TASK_PROMPTS.md` when present. Before choosing work, run the repository roadmap validator when it exists. Until P0-T2 creates that validator, perform and record a bootstrap read-only check that parses both YAML files and verifies task/phase/decision status values, unique IDs, dependency existence and acyclicity, logical decision keys, owning phases, valid current-attempt pointers, unique monotonic attempt ordinals, complete immutable supersedes chains, known `requires_decisions` references and exact verdict satisfaction, direct task `contracts`, bidirectional equality with requirements mappings, exact authoritative heading matches, contract section/task/test mappings, expanded normative-section coverage, known contract IDs, and internal documentation links; do not claim the not-yet-created repository validator passed.

Find the earliest `todo` task for which:

1. every task-level dependency is `done`;
2. every phase-level dependency is `passed`;
3. every declared `requires_decisions` entry resolves through the logical decision key to a valid current immutable attempt whose non-pending verdict exactly matches;
4. the task's required browser, transport, security, and lifecycle seams already exist or are part of this exact task.

Do not treat `blocked`, `in_progress`, a phase merely containing done tasks, or a decision task that is `done` with `adjust/stop` as authorization. `done` means the evaluation ran; only `continue` on the valid current attempt permits dependent work. Never overwrite a verdict: adjust requires an explicit remediation task and new linked attempt; stop or abandoned adjust fails the owning phase.

Create a plan for only that task using `PLANS.md`. Explicitly identify:

- observable goal;
- applicable stable contract IDs and their authoritative design/ADR/specification locations;
- `LICENSE-POLICY-001` project-owner decision, dependency class and vendored-asset provenance when scaffold, dependency or distribution work is affected;
- `EDGE-PREFLIGHT-001` Tier-1 runner, Edge channel, Windows/WSL reachability, runtime ACL and two-process evidence before any dependent implementation;
- staging Git-top-level + device/inode identity including `/mnt/d/vem` case aliases, `sourceBaselineHead`, dirty/untracked hashes, owner target `/home/qwzx/src/VEM`, prefix-normalized project-at-root parity, authorized layout-commit parent proof, clean target, single-writer cutover/read-only rollback, canonical-root discovery, fixed Node/pnpm/Playwright, package registry/proxy/CA, selected execution/filesystem profile, file-watch/HMR, direct and Playwright-channel real `msedge` launch, HTTP/WebSocket, non-loopback refusal and machine-classified preflight failures;
- `MCP-COMPAT-001` primary/compat revision, initialization evidence, no-task core path and optional negotiated Tasks adapter;
- Edge/browser mode and capabilities;
- fallback/degradation behavior;
- untrusted inputs and receiving-layer identity derivation;
- `SEL-PROV-001` provider/interaction/confirmation integrity, prompt binding, claim-versus-user-authorization semantics and strict external-confirmation behavior;
- `CONF-BIND-001` immutable selection/source/candidate-set hashes, action allowlist, integrity provider, TTL, atomic reserve-consume, one-use replay prevention, invalidation and phase-consistent terminal states;
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
- for P0-T17A, the two-layer read-only harness, canonical JSON schema, immutable input/raw-record hashes and proof that Codex consumes rather than recomputes bundles;
- for P0-T17B, the 3–5 task direct-search comparison, fresh Codex context per arm, counterbalanced order, withheld ground truth, separate one-time/per-task setup-cost boundary, wrong-source stop condition, continue/adjust/stop verdict and proof that later holdouts were not consumed.

Treat `TEST-GATE-001` as the generic atomic-test/traceability contract, not as an executable command or a substitute for domain contracts. If a task implements normative browser, trust, privacy, identity, lifecycle, verification, fallback or remote behavior, bind the applicable domain contract(s); it may use only `TEST-GATE-001` solely when it adds no domain-specific normative behavior.

Then implement only the selected task. Do not implement an adjacent phase capability except an interface seam explicitly required by the current task.

Run the available repository roadmap validation (or the documented bootstrap check before P0-T2), targeted tests, affected package typecheck/lint, and the relevant browser/security/lifecycle checks immediately. Never skip, delete, weaken, or broadly rewrite tests to manufacture a pass. Never silently weaken authentication, secure transport, privacy, confidence, permissions, or fallback policy.

If tests pass, set the task to `done` and update `docs/progress.md` with evidence. For a decision task, also calculate and store the preregistered non-pending `decision`; never translate `done` into `continue`, overwrite an old attempt, or move `current_attempt` without first adding the required remediation/new-attempt chain. If an external dependency blocks progress, set `blocked` with evidence. A failed test alone is not permission to mark done or start another task.

Finish with the exact report required by `AGENTS.md`.
