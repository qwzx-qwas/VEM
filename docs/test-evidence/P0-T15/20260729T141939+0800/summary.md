# P0-T15 evidence summary

## Delivered transform

- Accepted ADR 0006 for the exact Node 24.18.0, Vite 8.1.5, React/DOM 19.2.8, plugin-react 6.0.4, TypeScript 6.0.3, oxc-parser 0.142.0 and MagicString 1.1.0 matrix.
- Private `@vem/vite-plugin` configured before React with Vite `apply: "serve"` and `enforce: "pre"`.
- Oxc parses project-local `.jsx/.tsx` before React conversion; only intrinsic elements receive an opaque `vem1_` SHA-256/128-bit anchor inserted after attributes and spreads. Custom/member components are untouched and explicit reserved attributes fail closed.
- Canonical identity includes namespace, normalized relative file, enclosing component, structural JSX path, intrinsic tag and transform version. Records retain original 1-based Unicode-aware line/column and exact source registry revision.
- MagicString returns a high-resolution source map with original content; real Vite dev transform proves later React/Oxc chaining and Fast Refresh output.
- Private registry output is deterministic, immutable, memory-only, non-published and non-lookup. It rejects cross-file collisions, cross-revision records, over 4,096 anchors/file, over 16,384 anchors/project, AST paths over 2,048 characters and complete snapshots over 1 MiB.

## Production non-participation

- A programmatic Vite production build of the same entry with React alone and with VEM configured produced byte-identical output, file names, source maps, imports, dynamic imports and module keys.
- User-authored `data-vem-source-anchor`, broad `data-vem-*` and broad `data-*` attributes survived unchanged; SSR output before and after the builds was identical.
- The real demo build transformed 23 modules into four local files totaling 1,092,834 bytes including sourcemap. It contained zero generated marker, VEM plugin, dev revision, private registry or endpoint signatures and made no external entry-HTML request.
- No build-time stripping was added. Static side-effect tests prove the package contains no filesystem write, persistence, registry publication, client, endpoint, HTML injection, fetch or WebSocket implementation.

## Verification

- Twelve P0-T15 tests and 50 existing tests passed across ten source test files; seven workspace/license tests also passed.
- Root build/typecheck/lint, workspace/roadmap validation, 235-package/zero-vendored license audit, frozen and offline-clean frozen install, and 98 bootstrap preflight regressions passed.
- A deterministic direct transform of the demo produced 42 anchors, 6,524 transformed bytes and a 23,120-byte high-resolution map.

## Failure calibration retained

The first production signature scan correctly stopped the build because `sourceRegistryRevision` is also a legitimate P0-T5 protocol field. The scanner was narrowed to P0-T15-owned marker namespace, registry schemas, plugin/dev revision and endpoint signatures; it was not disabled and now passes with zero owned signatures. Initial TypeScript validation also caught MagicString's class map exact-optional mismatch with Rolldown, so the plugin now returns a plain closed compatible map shape.

## Boundary

P0-T15 does not publish or look up a registry, resolve source for a selection, track HMR revisions, inject a page client/HTML/endpoint, start Coordinator/MCP, infer runtime owners/usages, repair production output or claim support outside the accepted matrix. Those capabilities remain in P0-T16 and later tasks.
