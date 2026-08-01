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

R6-T6 was then separately authorized and is complete without an external model call. It freezes five fresh deadline-remediation tasks, ten counterbalanced arms, equal-base read-only capsules, a new R6-T7 runner/source closure and an exact Codex `0.144.5` deadline candidate: 480000 ms bounded observation horizon plus 120000 ms terminal margin, yielding a 600000 ms outer deadline from process spawn. The horizon is explicitly an instrumentation observation policy, not a claim about provider internals. Preregistration hash is `41ce5ab1a65437defdfcd86c0b4ec4db3e922af8a6c5e5642d44384ea910627e`; the separately recorded R6-T7 authorization was required before execution.

R6-T7 attempt two completed with immutable `adjust`. The exact authorization validated with canonical hash `a11336fb6fa5f11b5eb7a2b5f6471be1612617367e172d28899d3be08be82f2a`; one direct process/fresh thread started. Trusted receipts observed WebSocket reconnect through 5/5, fallback to HTTPS at about 137057 ms, and HTTPS reconnect through 3/5 before the runner sent `SIGTERM` at about 599996 ms. No provider `turn.failed`, `turn.completed`, agent message or authoritative final response was observed. The process group terminated and evidence sealed; because this was runner deadline termination rather than sealed observed provider timeout, no retry or next arm started. The result is 0/10 successful arms from one process, 19 attempts unused, with canonical verdict hash `254a47f33b9a1348e87eef99181e7c581d0a244ef1a154119240c1c8e481a961`.

Attempt two exposed a dual-transport horizon rather than a process-tree defect. Repeated reconnect payloads can have identical raw hashes across WebSocket and HTTPS phases, so remediation must correlate by ordered trusted receipts and adjacent fallback evidence rather than assume hash uniqueness. The next adjust route is:

8. `R6-T8`: separately authorized, local-only dual-transport terminal-horizon remediation against immutable attempt-two evidence.
9. `R6-T9`: only if R6-T8 permits a bounded continuation, freeze a fresh attempt-three runner/policy/preregistration with `externalExecutionAuthorized=false`.
10. `R6-T10`: only after another exact authorization, execute decision attempt three with `supersedes_attempt: R6-T7`.

R6-T8 was separately authorized after commit `d3dca37e0aa2560238e81bc6639081cb6ecd321f` was pushed and its remote SHA verified. Its zero-model replay pairs each JSONL chunk with the same ordered stdout receipt occurrence and uses the explicit fallback receipt as the transport boundary; two reconnect raw hashes repeat across WebSocket and HTTPS and are correctly retained as distinct receipts. The immutable evidence establishes only a 600000 ms incomplete dual-transport lower bound and a 154113 ms maximum observed HTTPS reconnect gap. The bounded compatibility contract therefore requires at least a 600001 ms explicit terminal horizon plus a 308226 ms observation margin, for an outer deadline from 908227 through 1200000 ms. It selects no exact policy, makes no external call, keeps `externalExecutionAuthorized=false`, and leaves R6-T9 separately gated.

R6-T9 was separately authorized and completed without an external model call. It froze five fresh attempt-three tasks, ten counterbalanced arms, thirteen runtime sources and exact Codex `0.144.5` policy: an 891774 ms version-bound observation horizon plus the evidence-derived 308226 ms minimum terminal margin for a 1200000 ms outer deadline. Preregistration hash is `b3f281d44bbc08ae74b534a9903c935bff17192a9d03df4c01aad637e91d4e52`; R6-T10 remained separately gated until the owner bound the published commit and all hashes.

R6-T10 attempt three completed with immutable `adjust`. The exact authorization validated with canonical hash `61767b2f1a7fc0dbd3c3734f2f672ad345eebb1a5febd3c56d124687f05509c4`. One direct process/fresh thread started; ordered receipts observed WebSocket reconnect 2/5–5/5, fallback on `Network unreachable` at about 123049 ms, HTTPS reconnect 1/5–5/5, and a provider `turn.failed` at about 992292 ms. The terminal message was `error sending request`, not timeout, so the frozen classifier returned nonretryable `protocol-or-unknown-failure`. The process exited 1 with an empty final file, process group empty and all audit/permission/manifests sealed. No retry or next arm started: 0/10 arms completed, 19 process attempts remain. Canonical verdict hash is `b2c75c2bafa45bf80f83a2158779f70591ab06dbde025f4ad144809a5ef9fb16`.

Attempt three exposed a non-timeout provider-terminal failure rather than another runner deadline. The required adjust route is:

11. `R6-T11`: separately authorized, local-only failure-class remediation against immutable attempt-three evidence.
12. `R6-T12`: only if R6-T11 permits bounded continuation, freeze a fresh attempt-four runner/policy/preregistration with `externalExecutionAuthorized=false`.
13. `R6-T13`: only after another exact authorization, execute decision attempt four with `supersedes_attempt: R6-T10`.

R6-T11 was separately authorized and completed without an external process, provider request, network probe or model call. Its fail-closed replay verified the immutable result manifests for attempts one through three and bound each R6-T10 stdout chunk to the ordered receipt ledger. The replay separates WebSocket reconnect 2/5–5/5, the `Network unreachable` fallback, HTTPS reconnect 1/5–5/5 and the final non-timeout `turn.failed/error sending request`; attempt three remains nonretryable `protocol-or-unknown-failure`. The compatibility disposition is `continue-to-preregistration-only`: R6-T12 may separately freeze a distinct evidence-conjunctive future class, but R6-T11 selects no exact attempt-four policy and authorizes neither R6-T12 nor R6-T13. Proof and contract hashes are `0c6b2357c745fe66ce8a88e2d49db8f5f8ae51112470ae058dbcbb5432a30dcf` and `fa512a787a4d72d75704ebebbd06ab78cd796387483f0e625985fb6d9fbce1d2`.

R6-T12 was separately authorized after R6-T11 commit `4944699199b25427918d27a2b1d16989c1047934` was pushed and its remote SHA verified. It completed without a participant process, provider request, network probe or model call. The preregistration freezes five fresh network-terminal tasks, ten counterbalanced equal-base arms, thirteen R6-T13 runtime sources, the fixed outer environment, the 1200000/5000/5000 ms termination boundary and one total retry per arm within a 20-process cap. The selected non-timeout class is retryable only when all six R6-T11 evidence predicates hold; provider timeout remains separate and unknown/different/incomplete non-timeout failures remain nonretryable. Preregistration, instrumentation, data-scope, failure-candidate and termination-policy hashes are `531e9ea500d198c60dfb834c0b210bee9fb2eaf52772fc1ae85876bcd0c5e62d`, `6770f8caa440672c62bf57dfa8c9ef12ddbd2d8a3c119b6d20786f36aea19e06`, `0bd7c96a8241cbc2e78b24e776973001bc2bf59ec51ec8cb97625d245f7a2a80`, `53829a8291de64322223d91b224fa097988c22afcd4b30f6237db36a1b5b2c75` and `caa4ff6248fca549c601cb7bdcd80813bb91ee646606cacce627111deae16372`. R6-T13 remains gated on a new exact authorization binding the published R6-T12 commit and every frozen boundary.

R6-T13 received that exact authorization against published commit `53e2e1093fd107476efdc236afc07a75affabead`; canonical authorization hash is `aa6d64d442416c0a3357e31bd350ef69c6fd748e269faa7b6ea0cf404e520967`. Its first direct process/fresh thread completed the full WebSocket-to-HTTPS timeout sequence and ended before the runner deadline with provider `turn.failed/request timed out`, exit 1, empty final response, empty process group and sealed evidence, so the frozen classifier correctly authorized one retry. Before that retry could spawn, the frozen runner reused the same capsule and its second authoritative-output preparation raised `R2_CAPSULE_OUTPUT_ALREADY_PREPARED`. No retry process or later arm started. A local no-call abort sealer reproduced the defect and sealed the single attempt plus aggregate state; the immutable attempt-four verdict is `stop` for `aggregate-integrity-failed`, with 1 process, 0/10 successful arms and 19 attempts unused. Canonical verdict and `RESULTS.sha256` file hashes are `f83caa14aa56b9c416bef538c8d3b38e8202cd2d40e50e457e116982f4da96b7` and `4e81c4742b02bc3ccae63c733c8816208e742d60dc1608c49d386d56981f4f43`. R6 is failed and no product work is unlocked.

## Security and data lifecycle boundary

- The outer process receives no inherited host environment or secret-bearing values.
- Bubblewrap continues to set the inner capsule environment separately; the R3 permission profile still denies generated-command auth and `/proc` access and keeps `/work` read-only.
- R6-T1 through R6-T3, R6-T5, R6-T6, R6-T8, R6-T9, R6-T11 and R6-T12 use local probes/replay only. They send no participant fixture, prompt, auth data, or other content to a provider.
- Evidence is bounded immutable audit metadata under `docs/test-evidence/R6-*`; no new durable product artifact class is introduced.
- R6 has no dependency edge into P0 or P1–P8 and cannot unlock product implementation.

## Stop conditions

- R5 stop, R4 blocked/pending, or any prior terminal chain drifts.
- The invocation can inherit host env, contains any non-allowlisted key/value, or disagrees with the terminalizer predicate.
- A compatibility probe would start `codex exec`, probe provider reachability, or require external data transfer.
- Source/preregistration/environment/termination-policy drift occurs.
- R6-T4 lacks a new authorization bound to the new preregistration, destination, model, data scope, environment contract, deadline, signal policy, retry boundary, and process cap.
- R6-T6 is attempted without separate authority to select and freeze an exact policy satisfying the R6-T5 compatibility contract, or R6-T7 lacks another exact external authorization.
- R6-T8 starts without separate local-only authority, mutates attempt-one/two evidence, or treats duplicate reconnect raw hashes as unique transport identity.
- R6-T9 starts without an auditable bounded R6-T8 disposition, or R6-T10 lacks another exact external authorization binding every attempt-three boundary.
- R6-T11 starts without separate local-only authority, mutates any prior attempt, or treats reconnect timeout progress as equivalent to the final non-timeout provider terminal.
- R6-T12 starts without an auditable bounded R6-T11 disposition, or R6-T13 lacks another exact external authorization binding every attempt-four boundary.
