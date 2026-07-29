# P0-T16 evidence summary

## Delivered prototype

- Added private `@vem/source-registry`, consuming the immutable P0-T15 transform snapshot without adding an external dependency.
- Publication validates a closed `ProjectRevisionContext`, exact transform namespace/version/parser/matrix, bounded record count/bytes, canonical project-relative POSIX locations, record revision, recomputed source-anchor identity hash and unique membership before any state mutation.
- The same source-registry revision and content is idempotent only when its coordinator sequence is not stale. Reusing a revision for different content is a collision, and a different project instance requires an explicit reset that clears all retained state.
- Lookup accepts a closed bounded request and returns exactly one immutable direct result only for current project/build/source revision membership. It includes the relative source location, a coordinator-derived opaque relative-file identity, a namespaced evidence hash, no candidates and no conflicts.
- Publishing a new revision retains only the current and one previous diagnostic snapshot. A previous revision can never satisfy ordinary lookup.

## Security and lifecycle boundary

- Unknown fields, malformed anchor IDs, anchor hash/identity mismatch, duplicate anchors, path traversal or non-canonical path segments, incompatible transforms, oversized input, stale project/build/source/sequence and missing anchors fail closed with bounded messages.
- All state is memory-only and project-reset bounded. The implementation contains no source read, filesystem write, browser storage, HTTP/WebSocket transport, browser ingress, MCP surface, HMR transaction, heuristic candidate, cross-revision reattachment, persistent recovery or edit authorization.
- A registry membership result proves only the current registry edge. It does not upgrade page evidence, prove a user gesture, authorize an edit or claim a DOM-to-source cryptographic binding.

## Verification

- Thirteen P0-T16 tests and 62 existing tests passed across 11 source test files; seven workspace tests also passed.
- Root build/typecheck/lint, workspace/roadmap validation, 235-package/zero-vendored license audit, frozen and isolated clean frozen install, real demo production build with zero VEM-owned signatures, and 98 preflight regressions passed.
- No new browser run was required for this in-memory seam. The existing real Edge Stable channel gate remains valid, and the production build continued to transform 23 modules into four local files totaling 1,092,834 bytes with zero external URLs and zero VEM-owned signatures.

## Boundary

P0-T16 supplies current-revision direct membership lookup for the read-only pilot harness. Coordinator discovery/transport, browser ingress, MCP tools/resources, selection-to-source resolution, source content reads, heuristic candidates, HMR causality, cross-revision successor proof and persistent state remain later tasks.
