# R2 Independent Final-Output Authority Remediation

> Owner-authorized after immutable `R1-RECOVERY=stop`. R2 does not reopen R1, R0 or P0. R2-T4 was later separately authorized against the frozen R2-T3 hash and is now terminal.

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
- R2-T4 received explicit owner authorization bound to the R2-T3 preregistration hash and exact 10-process limit.
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
- R2-T4 authorization was recorded at `docs/test-evidence/R2-T4/OWNER_AUTHORIZATION_20260729.json`.

## Terminal R2-T4 outcome

- Evidence root: `docs/test-evidence/R2-T4/20260729T230343+0800/`
- Nine fresh processes completed before the frozen batch stopped; the tenth process was not executed.
- All nine authoritative final files were consistent with the last JSONL agent message and mapped to withheld ground truth; thread IDs were unique, with zero protocol failures and zero wrong attribution.
- Run nine used the frozen-auditor forbidden `AGENTS.md` marker in a command event and reproduced `CAPSULE_AUDIT_V2_ESCAPE`.
- The audit exception escaped the frozen runner before audit-failure evidence was sealed. A no-external-call post-abort sealer preserved that failure fact and hash-sealed the existing run evidence without changing any preregistered source binding.
- Immutable verdict: `R2-RECOVERY=stop`, with `capsule-integrity-failed` and `failure-evidence-not-sealed-before-return`; the incomplete 9/10 batch is also recorded as an adjust reason, but stop takes precedence.
- R2 is `failed`; R1/R0/P0 stops and the zero-product-unlock boundary remain unchanged.
