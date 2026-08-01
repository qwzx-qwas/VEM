# R0 Independent Recovery Research

> Owner-authorized on 2026-07-29 after the immutable P0-T17D `stop`. This is a research recovery route, not a reopened P0 or an implementation-phase bypass.

## Outcome

R0 asks one bounded question: after fixing audit false positives and adding runner-observed event timing, is there enough correctly isolated evidence to propose a separate research implementation phase?

The answer cannot change P0-T17D, P0 failed, P0-T7 eligibility, or P1–P8 dependencies.

## Atomic sequence

| Order | Task | Independently observable result |
|---|---|---|
| 1 | R0-T1 | Versioned recovery charter plus validator-enforced no-product-unlock boundary |
| 2 | R0-T2 | Trusted monotonic event-receipt timing ledger and canonical evidence schema |
| 3 | R0-T3 | Frozen recovery-only task bank, capsule bindings, instrumentation hashes and thresholds |
| 4 | R0-T4 | Separately authorized external runs and immutable `R0-RECOVERY` verdict |

Only one task may be in progress. R0-T4 external payloads require a new explicit owner authorization after R0-T3 preregistration is frozen.

## Boundary

- P0-T17D remains `done/stop`; P0 remains `failed`.
- `R0-RECOVERY` is a new decision chain and does not supersede `P0-VALUE`.
- R0 has no phase dependency because depending on failed P0 would make it ineligible; its tasks may read completed P0 evidence by hash.
- No existing phase or task may depend on R0.
- R0 implements no Coordinator, MCP, browser ingress, HMR verification, extension, capture, artifact or distribution capability.
- A `continue` verdict only permits an owner-reviewed proposal for a new independent research implementation phase. It does not unlock P0-T7 or P1.

## Measurement floor

The outer runner records monotonic nanosecond receipt points for process lifecycle and each received Codex JSONL event. These observations can bound runner-visible latency but cannot identify server-side model compute or shell-internal execution time. Every arm uses the same ledger path and stores the ledger implementation hash.

The recovery-only task bank remains separate from P1/P3/P4 holdouts. Direct and VEM arms use fresh contexts, counterbalanced order, equal capsule base inputs, identical prompt/tool/cache policy and withheld evaluator ground truth.

## Terminal result

R0-T4 attempt 1 ended with immutable `R0-RECOVERY=stop`. The first authorized arm caused the frozen runner to submit more than one agent-message completion as the unique structured response; the receipt ledger rejected the duplicate. This matched the preregistered `event-ledger-integrity-failed` stop condition, so the remaining nine calls were not executed. No R0 continue authority or product unlock exists.
