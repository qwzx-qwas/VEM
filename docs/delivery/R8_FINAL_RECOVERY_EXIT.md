# R8 Final Recovery Exit

## Scope and authority

The owner allowed one final recovery attempt and directed that any timeout permanently ends recovery experimentation and transitions work to a genuinely model-agnostic MCP product route. R8 does not overwrite R7 or any earlier decision/evidence and does not itself unlock product work.

R8-T1 is local charter work only. No participant process, provider probe or external model call is authorized by this charter. R8-T4 remains separately gated until R8-T3 has frozen and published the exact experiment client, model, destination, data scope, source closure, termination policy and evidence contract.

## Atomic sequence

1. `R8-T1`: record the final-recovery and product-transition boundary, preserve the full prior chain, prove model identity is experiment-only, and forbid R9.
2. `R8-T2`: locally implement the experiment adapter boundary and one-process/no-retry terminal sealer without changing VEM MCP product semantics or making an external call.
3. `R8-T3`: preregister exactly one process, an explicit experiment client/model/destination, timeout-stop policy and full evidence bindings with `externalExecutionAuthorized=false`.
4. `R8-T4`: only under a new exact post-publish authorization, execute one process, seal its evidence and record the immutable exit verdict.

## Implemented local boundary

R8-T2 keeps experiment identity in `scripts/pilot` only. Its descriptor accepts the exact auditable client/model/destination tuple but carries no credential field, makes no compatibility claim and is never forwarded into VEM product runtime. The product-side guard rejects participant model/provider/client/destination fields and concrete participant model identities.

The R8 one-shot controller exposes one start transition and one terminal seal. It has no retry method, caps logical process attempts at one, rejects authorization replay against another result root and writes private run, exception, verdict and SHA256 evidence before returning. A schema-valid complete response is only continue-eligible; it is not an authoritative decision or product unlock. Timeout, transport/runner failure, missing or invalid final output, incomplete terminal evidence, a second start or sealing exception yields stop and never permits R9.

R8-T2 validation is local-only. Its success/timeout/incomplete cases are lifecycle simulations: they do not spawn a participant process or contact a provider. The committed proof records zero participant processes, provider requests, network probes and model calls.

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
