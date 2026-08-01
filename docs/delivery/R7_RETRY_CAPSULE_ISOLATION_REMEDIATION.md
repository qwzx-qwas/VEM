# R7 Retry-Capsule Isolation Remediation

## Scope and authority

The owner explicitly authorized a new independent R7 route that does not overwrite `R6-RECOVERY=stop`, R5/R4 or any earlier decision/evidence and does not unlock product work. The authorization covers only local, zero-provider-call R7-T1 through R7-T3: the charter, per-attempt capsule/final-output isolation, exception-safe aggregate sealing, tests and a new preregistration. Every stage is committed and pushed separately.

R7-T4 is not authorized. Any participant process, provider request or external model call requires another exact owner authorization after the R7-T3 preregistration commit is published and all source/data/environment/policy/budget hashes are frozen.

## Atomic sequence

1. `R7-T1`: add the independent contract, phase, decision and charter proof while preserving R6 failed/stop, R5 failed/stop, R4 blocked/pending, all earlier terminal stops, empty dependencies and zero product unlock.
2. `R7-T2`: create a distinct capsule control root and authoritative final-output file per process attempt, preserve equal-base/treatment parity, clean each attempt independently, and seal batch-level exceptions without external calls.
3. `R7-T3`: freeze fresh tasks, retry-isolated runner/source closure, data/environment/failure/termination policies, process budget, local probes and `externalExecutionAuthorized=false`.
4. `R7-T4`: only after a new exact authorization, execute the bounded batch and record an immutable `R7-RECOVERY` verdict.

## Security and data lifecycle boundary

- R7-T1 through R7-T3 do not run a participant `codex exec`, probe provider reachability or send participant data externally.
- Generated-command auth denial, fixed outer environment, read-only participant workspace, bounded process-tree termination and per-attempt evidence retention remain mandatory.
- A retry receives a new private control root and final file but no broader filesystem, network, auth or source capability.
- No R7 phase/task becomes a dependency of P0 or P1–P8, and no product decision is upgraded.

## Stop conditions

- R6-T13/R6 stop, R5 stop, R4 blocked/pending or any earlier terminal evidence drifts.
- A retry reuses any prior attempt control root, authoritative final file, partial stream, cleanup handle or writable mount.
- Per-attempt isolation changes the direct/VEM base-context or treatment boundary.
- An exception can escape without sealed attempt and batch-level evidence, or a same authorization is silently rerun.
- R7-T3 contains `externalExecutionAuthorized=true`, or R7-T4 starts without a new exact authorization.
