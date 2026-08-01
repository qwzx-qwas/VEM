# R8 Final Recovery Exit

## Scope and authority

The owner allowed one final recovery attempt and directed that any timeout permanently ends recovery experimentation and transitions work to a genuinely model-agnostic MCP product route. R8 does not overwrite R7 or any earlier decision/evidence and does not itself unlock product work.

R8-T1 is local charter work only. No participant process, provider probe or external model call is authorized by this charter. R8-T4 remains separately gated until R8-T3 has frozen and published the exact experiment client, model, destination, data scope, source closure, termination policy and evidence contract.

## Atomic sequence

1. `R8-T1`: record the final-recovery and product-transition boundary, preserve the full prior chain, prove model identity is experiment-only, and forbid R9.
2. `R8-T2`: locally implement the experiment adapter boundary and one-process/no-retry terminal sealer without changing VEM MCP product semantics or making an external call.
3. `R8-T3`: preregister exactly one process, an explicit experiment client/model/destination, timeout-stop policy and full evidence bindings with `externalExecutionAuthorized=false`.
4. `R8-T4`: only under a new exact post-publish authorization, execute one process, seal its evidence and record the immutable exit verdict.

## Model-agnostic product boundary

- VEM product runtime, MCP protocol, tools, resources and CapabilityReport do not accept or require a participant model ID.
- An experiment records its model only to make that invocation reproducible and authorizable; the value is not a VEM compatibility claim.
- Product contract tests use protocol fixtures and compatible clients without requiring provider reachability.
- A future product route cannot depend on `R8-RECOVERY=continue`; timeout is retained as an external limitation, not converted into an MCP failure.

## Terminal rules

- R8 starts at most one external process and never retries it.
- Any timeout, deadline, transport failure, missing terminal/final output, or sealing failure yields `stop`.
- No R9 or equivalent recovery continuation may follow.
- R8 success does not establish product value and does not reopen P0 or any recovery phase.
