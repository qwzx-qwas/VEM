# P0-T5 evidence summary

## Delivered selector

- Accepted ADR 0005 and a truthful injected-page capability report: every selection remains `page-untrusted`, requires external confirmation and cannot authorize a prepared edit.
- Private `@vem/injected-selector` with pointer-free closed-shadow overlay, requestAnimationFrame-coalesced hover, click selection, Escape disposal and safe target rejection.
- Closed immutable `P0-T5-injected-selection-v1` summary carrying the accepted protocol revision context, bounded box/ancestor/text fields, redacted page route and explicit untrusted-page-data provenance.
- Fail-closed filtering for the overlay, `data-vem-private`, configured private selectors, non-renderable metadata, hidden and zero-area targets.
- PRIV-MIN projection never reads form current values; removes sensitive text and control/bidi characters; drops query, fragment and raw path segments; bounds text to 512 characters and complete JSON to 16,384 bytes maximum.
- Memory-only Map/WeakMap/WeakRef store cleared on explicit clear, `pagehide`, document change, project restart, element detach, stop or process loss, with no durable browser storage API.
- React/Vite fixture imports and starts the selector through a workspace dependency without implementing injection transform, source registry, coordinator or MCP.

## Verification

- Thirteen P0-T5 DOM/privacy/lifecycle tests and 37 existing tests passed across eight source test files.
- Real demo build transformed 23 modules and emitted four local files totaling 1,092,648 bytes including sourcemap, with zero external URL in entry HTML and within the existing 1.5 MB/12-file caps.
- Seven workspace/license tests, root build/typecheck/lint, workspace/roadmap validation, 231-package license audit, frozen and offline-clean frozen install, and 98 bootstrap preflight regressions passed.

## Failure calibration retained

The first DOM run exposed happy-dom's exact `http://localhost:3000` origin and corrected same-origin fixture URLs. The first composite build caught a TypeScript-only test cleanup error, and the first lint run caught the intentional control-character sanitizer; both were fixed without relaxing the privacy rule or excluding source tests.

## Privacy and safety

Form current values and private subtrees are rejected before text projection. Sensitive accessible text, fake credentials, query/fragment, raw route values, control/bidi characters and provider-like raw errors are absent from successful summaries. Instruction-shaped text remains bounded data with `contentTrust: untrusted-page-data`; even a reported trusted click cannot improve integrity.

## Boundary

P0-T5 does not provide trusted user gestures, extension/CDP identity, screenshots, source anchors, source registry, proxy/coordinator/MCP, selection claims, ConfirmationBinding consumption, Vite injection, persistence or edit authorization. Strict edit evaluation always returns `EXTERNAL_CONFIRMATION_REQUIRED`.
