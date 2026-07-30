# R6 Pre-spawn Invocation Contract Remediation

## Scope and authority

The owner statement `修复它` authorizes an independent local-only R6 remediation of the pre-spawn `invocation.env` incompatibility observed and sealed by R5-T4. R5-T4 remains `done` with `R5-RECOVERY=stop`; R5 remains `failed`; R4-T4/R4 remain `blocked` with `R4-RECOVERY=pending`; all earlier stop evidence remains immutable.

This authorization covers R6-T1 through R6-T3: charter and validator work, explicit fixed outer-process environment, shared terminalizer invocation validation, zero-model compatibility probes, tests, and a new preregistration. It does not authorize any external model call. R6-T4 requires a new exact owner authorization after R6-T3 freezes all hashes and limits.

## Atomic sequence

1. `R6-T1`: fix the independent recovery charter and mechanically preserve R5 stop, R4 blocked/pending, five earlier stops, empty dependencies, and zero product unlock.
2. `R6-T2`: make the capsule invocation expose a fixed `PATH=/usr/bin:/bin` outer env, reuse the terminalizer's invocation predicate, and execute zero-model compatibility/security probes.
3. `R6-T3`: freeze fresh task/capsule/source bindings, the explicit env contract, termination policy, attempt budget, thresholds, and `externalExecutionAuthorized=false`.
4. `R6-T4`: only after a new exact authorization, execute the bounded batch and record an immutable `R6-RECOVERY` verdict.

## Security and data lifecycle boundary

- The outer process receives no inherited host environment or secret-bearing values.
- Bubblewrap continues to set the inner capsule environment separately; the R3 permission profile still denies generated-command auth and `/proc` access and keeps `/work` read-only.
- R6-T1 through R6-T3 use local probes only. They send no participant fixture, prompt, auth data, or other content to a provider.
- Evidence is bounded immutable audit metadata under `docs/test-evidence/R6-*`; no new durable product artifact class is introduced.
- R6 has no dependency edge into P0 or P1–P8 and cannot unlock product implementation.

## Stop conditions

- R5 stop, R4 blocked/pending, or any prior terminal chain drifts.
- The invocation can inherit host env, contains any non-allowlisted key/value, or disagrees with the terminalizer predicate.
- A compatibility probe would start `codex exec`, probe provider reachability, or require external data transfer.
- Source/preregistration/environment/termination-policy drift occurs.
- R6-T4 lacks a new authorization bound to the new preregistration, destination, model, data scope, environment contract, deadline, signal policy, retry boundary, and process cap.
