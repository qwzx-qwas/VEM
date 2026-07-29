# ADR 0005: Injected-page selection provenance and privacy boundary

- Status: Accepted
- Date: 2026-07-29
- Contracts: `BROWSER-MODE-001`, `SEL-PROV-001`, `PRIV-MIN-001`, `DATA-LIFE-001`
- Authority: accepted design baseline 1.14

## Context

P0 needs a selection interaction before the extension, coordinator and MCP surfaces exist. Vite injected mode shares the page's main world and cannot prove that a click, keyboard event, overlay state, nonce or same-origin message came from a trusted user rather than page script. The first selector must still enforce the outbound privacy floor and must not create persistent state.

## Decision

- The only P0-T5 provider is `injected-page`; its observer is `page-runtime` and its confirmation integrity is always `page-untrusted`.
- `event.isTrusted` is recorded only as an untrusted diagnostic boolean and never changes provenance, policy or capability.
- Every selection reports `requiresExternalConfirmation: true`. Strict prepared editing is denied with `EXTERNAL_CONFIRMATION_REQUIRED`; P0-T5 does not create or consume a ConfirmationBinding.
- The capability report truthfully denies trusted gesture, extension identity, screenshots, source resolution, persistent storage and prepared edit.
- The selector filters its own overlay, non-renderable metadata elements, hidden/zero-area targets and complete private subtrees before hover or click selection.
- Hover remains local and requestAnimationFrame-coalesced. The overlay has no pointer events and is removed on stop.

## Privacy projection

- Projection is an allowlist. It never reads input, textarea or select current `value`.
- A form control may expose only tag/role/box and an explicit redaction reason; sensitive accessible labels/placeholders are removed.
- `data-vem-private` and configured private-selector descendants are unselectable and produce no summary.
- Page context contains exact origin plus a policy-redacted path; query, fragment, raw sensitive path/title and credentials are absent.
- Text removes control/bidi characters, normalizes whitespace, is independently bounded and is labeled `untrusted-page-data`. Instruction-shaped content is never promoted to a prompt or error.
- Errors expose a stable code and safe recovery text only; raw provider/page error messages are not echoed.
- The serialized summary has a hard byte bound and closed fields.

## Lifecycle

Selection snapshots and element handles exist only in memory. Explicit clear, document change, project-instance change, `pagehide`, selector disposal or process restart invalidates them. The implementation uses no local/session storage, IndexedDB, cookies, filesystem or durable artifact API.

## Consequences and boundaries

This decision provides a minimal injected selection and privacy projection for the P0 demo. It does not authenticate the browser, prove user intent, resolve source, publish registry data, start a coordinator/MCP server, authorize edits, capture pixels or claim extension/CDP capabilities. P0-T12B later supplies claims and ConfirmationBinding lifecycle; P0-T15/T16 supply anchors and registry; P1 hardens interaction and recovery.
