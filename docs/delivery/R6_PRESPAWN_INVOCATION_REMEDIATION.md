# R6 Pre-spawn Invocation Contract Remediation

## Scope and authority

The owner statement `修复它` authorizes an independent local-only R6 remediation of the pre-spawn `invocation.env` incompatibility observed and sealed by R5-T4. R5-T4 remains `done` with `R5-RECOVERY=stop`; R5 remains `failed`; R4-T4/R4 remain `blocked` with `R4-RECOVERY=pending`; all earlier stop evidence remains immutable.

This authorization covers R6-T1 through R6-T3: charter and validator work, explicit fixed outer-process environment, shared terminalizer invocation validation, zero-model compatibility probes, tests, and a new preregistration. It does not authorize any external model call. R6-T4 requires a new exact owner authorization after R6-T3 freezes all hashes and limits.

## Atomic sequence

1. `R6-T1`: fix the independent recovery charter and mechanically preserve R5 stop, R4 blocked/pending, five earlier stops, empty dependencies, and zero product unlock.
2. `R6-T2`: make the capsule invocation expose a fixed `PATH=/usr/bin:/bin` outer env, reuse the terminalizer's invocation predicate, and execute zero-model compatibility/security probes.
3. `R6-T3`: freeze fresh task/capsule/source bindings, the explicit env contract, termination policy, attempt budget, thresholds, and `externalExecutionAuthorized=false`.
4. `R6-T4`: only after a new exact authorization, execute the bounded batch and record an immutable `R6-RECOVERY` verdict.

R6-T4 attempt one completed with immutable `adjust`: the exact pre-spawn invocation worked, but the sole process reached the frozen 120000 ms runner deadline after emitting reconnect progress and before any provider terminal or authoritative final response. The process tree and evidence sealed correctly; runner deadline termination was non-retryable, so no second process started. The required adjust route was explicitly planned at attempt-one close:

5. `R6-T5`: local-only retry-horizon/deadline compatibility remediation against immutable attempt-one evidence.
6. `R6-T6`: freeze a new attempt-two runner/policy/preregistration with `externalExecutionAuthorized=false`.
7. `R6-T7`: only after another exact authorization, execute decision attempt two with `supersedes_attempt: R6-T4`.

R6-T5 was separately authorized and is complete. Its local-only replay verified every bound R6-T4 manifest entry and receipt/raw-stream relation, preserved attempt one, and made no external process, model or provider call. The derived compatibility contract requires explicit retry-horizon provenance and fixes only bounded floors/ceilings: horizon at least 120006 ms, terminal-observation margin from 31574 through 120000 ms, and outer deadline from 151580 through 600000 ms. It preserves the 5000/5000 ms termination windows, `SIGTERM`→`SIGKILL`, provider-timeout-only one-retry rule, 20-process cap and per-attempt evidence/budget accounting. R6-T5 selected no exact attempt-two deadline and did not freeze or authorize R6-T6; proof hash is `82585caca431e25e6bc0f8a7737cdab4a437ecd5cf8ebbb88eb6158c5c719fcb`.

R6-T6 was then separately authorized and is complete without an external model call. It freezes five fresh deadline-remediation tasks, ten counterbalanced arms, equal-base read-only capsules, a new R6-T7 runner/source closure and an exact Codex `0.144.5` deadline candidate: 480000 ms bounded observation horizon plus 120000 ms terminal margin, yielding a 600000 ms outer deadline from process spawn. The horizon is explicitly an instrumentation observation policy, not a claim about provider internals. Preregistration hash is `41ce5ab1a65437defdfcd86c0b4ec4db3e922af8a6c5e5642d44384ea910627e`; `externalExecutionAuthorized=false`. R6-T7 still requires a distinct authorization binding the new preregistration, instrumentation/data/deadline/policy/environment hashes, 10-arm target and 20-process cap.

## Security and data lifecycle boundary

- The outer process receives no inherited host environment or secret-bearing values.
- Bubblewrap continues to set the inner capsule environment separately; the R3 permission profile still denies generated-command auth and `/proc` access and keeps `/work` read-only.
- R6-T1 through R6-T3, R6-T5 and R6-T6 use local probes/replay only. They send no participant fixture, prompt, auth data, or other content to a provider.
- Evidence is bounded immutable audit metadata under `docs/test-evidence/R6-*`; no new durable product artifact class is introduced.
- R6 has no dependency edge into P0 or P1–P8 and cannot unlock product implementation.

## Stop conditions

- R5 stop, R4 blocked/pending, or any prior terminal chain drifts.
- The invocation can inherit host env, contains any non-allowlisted key/value, or disagrees with the terminalizer predicate.
- A compatibility probe would start `codex exec`, probe provider reachability, or require external data transfer.
- Source/preregistration/environment/termination-policy drift occurs.
- R6-T4 lacks a new authorization bound to the new preregistration, destination, model, data scope, environment contract, deadline, signal policy, retry boundary, and process cap.
- R6-T6 is attempted without separate authority to select and freeze an exact policy satisfying the R6-T5 compatibility contract, or R6-T7 lacks another exact external authorization.
