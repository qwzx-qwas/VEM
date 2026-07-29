# R2 Independent Final-Output Authority Remediation

> Owner-authorized after immutable `R1-RECOVERY=stop`. R2 does not reopen R1, R0 or P0 and does not authorize external model calls.

## Atomic sequence

| Order | Task | Independently observable result |
|---|---|---|
| 1 | R2-T1 | Independent charter and triple-terminal no-product-unlock validation |
| 2 | R2-T2 | Authoritative final-output file, single-file capsule bind and honest failure classification |
| 3 | R2-T3 | New frozen recovery-only preregistration and instrumentation hashes |
| 4 | R2-T4 | Separately authorized external batch and immutable R2 verdict |

## Boundaries

- `P0-VALUE=stop`, `R0-RECOVERY=stop`, `R1-RECOVERY=stop` and all three failed phases remain immutable.
- No existing phase or task depends on R2.
- R2-T1 through R2-T3 perform no external model call.
- R2-T4 requires new explicit owner authorization bound to the R2-T3 preregistration hash.
- Any future R2 continue can only support a new owner-reviewed independent research proposal; it cannot unlock P0-T7 or P1.

## Remediation target

- `codex exec --json` remains the complete audit event stream.
- `--output-last-message /run/vem/final-response.json` is the sole authoritative response channel.
- Only a runner-created mode-0600 host file is writable inside the capsule; `/work` remains read-only.
- The final file is bounded, schema-validated and checked against the last terminal agent-message after all streams close.
- Protocol failures do not count as wrong attribution when no response was selected.

## Frozen R2-T3 preregistration

- Evidence root: `docs/test-evidence/R2-T3/20260729T225128+0800/`
- Preregistration hash: `dddd48ade2a92b2e12ec7600c9cdc0bd65eee6d47023d01d70b8bd71b47c273a`
- Instrumentation hash: `09e237ddec722207ee3b2e22c714ca5631700ff7393877a66fdd75d04c46b8a0`
- Planned external runs: 5 counterbalanced task pairs / 10 fresh processes
- Preregistration authorization flag: `externalExecutionAuthorized=false`
- R2-T4 remains ineligible until the owner separately authorizes the exact preregistration hash and run count.
