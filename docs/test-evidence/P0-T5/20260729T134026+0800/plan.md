# P0-T5 Execution Plan

- Starting commit: `b71181ba14addc3f5d9c17cb51cb764d1d560f7a`.
- Set P0-T5 to `in_progress` before product implementation.
- Record an Accepted ADR that preserves injected-page untrusted provenance and capability limitations from the design baseline.
- Create private `@vem/injected-selector` with only the internal `@vem/protocol` dependency and no new external production dependency.
- Implement mode capabilities, bounded SelectionSummary projection, selector target filters, overlay, memory-only store and cleanup lifecycle.
- Never read form current values or serialize private subtrees, query/fragment, raw sensitive paths, prompt-as-instruction, raw provider errors or absolute paths.
- Keep all injected selections `page-untrusted` and require external confirmation for strict prepared-edit policy regardless of `event.isTrusted`.
- Use exact `happy-dom@20.11.1` only for actual DOM contract tests.
- Wire the React/Vite demo to the selector without implementing Vite injection, coordinator, MCP, claims, source registry or editing.
- Run demo build, DOM/privacy/lifecycle tests, workspace/build/type/lint/roadmap/license, offline install and 98 preflight regressions.
- Record bounded evidence and SHA-256 manifest.
- Mark prompt complete, remove checkpoint and commit the stage atomically only after all gates pass.
