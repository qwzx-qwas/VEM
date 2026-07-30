# R6-T5 retry-horizon / outer-deadline remediation

- Immutable R6-T4 receipts replay reconnect 2/5, 3/5 and 4/5.
- The 120000 ms runner deadline occurred without a provider terminal.
- Reconnect progress remains non-authorizing and runner termination remains non-retryable.
- Attempt two must bind an explicit finite provider horizon and observation margin.
- R6-T5 selects no exact deadline, freezes no preregistration and makes no external call.
