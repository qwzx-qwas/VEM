# R1 Independent Runner Remediation

> Owner-authorized after immutable `R0-RECOVERY=stop`. R1 does not reopen R0 or P0 and does not authorize external model calls.

## Atomic sequence

| Order | Task | Independently observable result |
|---|---|---|
| 1 | R1-T1 | Independent charter and dual-terminal no-product-unlock validation |
| 2 | R1-T2 | Multi-message final-response classification and crash-safe failure evidence |
| 3 | R1-T3 | New frozen recovery-only preregistration and instrumentation hashes |
| 4 | R1-T4 | Separately authorized external batch and immutable R1 verdict |

## Boundaries

- `P0-VALUE=stop`, P0 failed, `R0-RECOVERY=stop`, and R0 failed remain immutable.
- No existing phase or task depends on R1.
- R1-T1 through R1-T3 perform no external model call.
- R1-T4 requires a new explicit owner authorization bound to the R1-T3 preregistration hash.
- Any future R1 continue can only support a new owner-reviewed independent research proposal; it cannot unlock P0-T7 or P1.

## Frozen R1-T3 preregistration

- Evidence root: `docs/test-evidence/R1-T3/20260729T203631+0800/`
- Preregistration hash: `8d93104c915fdb0acce9f31bdf7c34bbc4d19f0ac74e1b2609a10ddce35ca7f1`
- Instrumentation hash: `388b1e0d89deea9a91c2d8c3701131fa358d60f988a78fd9d9098cd4c07cd231`
- Planned external runs: 5 counterbalanced task pairs / 10 fresh processes
- Preregistration authorization flag: `externalExecutionAuthorized=false`; separate `OWNER-R1-T4-EXTERNAL-BATCH` authorization was later recorded and consumed for the immutable R1-T4 run

## Immutable R1-T4 verdict

- Evidence root: `docs/test-evidence/R1-T4/20260729T213524+0800/`
- Verdict: `R1-RECOVERY=stop`; R1 phase is `failed`
- Executed: 2 of 10 authorized calls; 8 were not executed after the preregistered stop
- Direct arm: successful, exact source location, capsule audit and sealed evidence passed
- VEM arm: process exited zero but emitted two conflicting schema-valid responses; `STRUCTURED_RESPONSE_CONFLICT` was sealed before return
- Evidence integrity: both per-run manifests and the aggregate `RESULTS.sha256` pass
- Non-supersession: `R0-RECOVERY=stop`, `P0-VALUE=stop`, both failed phases and all product locks remain unchanged
