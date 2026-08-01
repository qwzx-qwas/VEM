# R0-T4 fail-closed verdict

- The frozen preregistration and eight runtime source bindings passed before execution.
- One authorized external process was started for `r0-ux-01-sync-state` / `direct-search`.
- The frozen runner attempted to record a second `item.completed` agent message as the unique structured response.
- `TrustedReceiptLedger` rejected it with `RECEIPT_LEDGER_RESPONSE_DUPLICATE`.
- The preregistered `event-ledger-integrity-failed` stop condition fired; the remaining nine calls were not executed.
- No complete run, raw stream, receipt ledger, correctness metric or cost metric was sealed.
- The immutable R0-RECOVERY attempt-1 verdict is `stop`; P0-T17D `stop`, P0 `failed` and all product locks remain unchanged.
