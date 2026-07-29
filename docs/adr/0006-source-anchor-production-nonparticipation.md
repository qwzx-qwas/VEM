# ADR 0006: P0 source anchors and production non-participation

- Status: Accepted
- Date: 2026-07-29
- Contracts: `REV-ID-001`, `EVIDENCE-TRUST-001`, `PROD-LEAK-001`
- Authority: accepted design baseline 1.14

## Context

P0 needs a direct host-source anchor for the React/Vite fixture, but a development marker must not turn VEM into an application runtime or participate in production builds. Broad React/Vite support would overclaim compatibility before parser, plugin-order, sourcemap, Fast Refresh and production-equivalence fixtures exist.

## Accepted matrix

- Node `24.18.0`; pnpm `10.34.0`; TypeScript `6.0.3`.
- Vite `8.1.5` with its Rolldown/Oxc build chain.
- React and React DOM `19.2.8`; `@vitejs/plugin-react@6.0.4` on its Oxc path.
- `oxc-parser@0.142.0` for `.jsx/.tsx` source parsing and `magic-string@1.1.0` for edits and high-resolution source maps.
- JSX automatic and classic source syntax are supported only within the tested fixture. Other Vite, React, parser, framework or already-transformed inputs report a limitation and are not silently treated as compatible.

## Transform decision

- The VEM plugin is `apply: "serve"`, `enforce: "pre"` and configured before the React plugin. It receives source JSX before React/Oxc conversion. A failed order or absence of JSX is not upgraded to a successful anchor transform.
- Only realpath-confined project `.jsx/.tsx` files are eligible. Virtual IDs, query variants other than Vite's source query handling, `node_modules`, project-external paths and ordinary JavaScript are skipped.
- Only lowercase intrinsic JSX names receive the reserved `data-vem-source-anchor` literal. Custom components and member/namespaced JSX names are untouched.
- An explicit user-authored reserved attribute is a development conflict and fails closed. The generated attribute is inserted after source attributes and spreads, so an unknown spread cannot overwrite the opaque marker. Production never transforms or removes either the reserved name or any broad `data-*` attribute.
- Parsing diagnostics are bounded and do not echo source. Missing parser support or unusable source-map input returns a stable limitation/error rather than a partial registry.

## Anchor identity and registry output

The marker namespace is `vem1_`. Its digest is the first 128 bits of SHA-256 over canonical JSON containing:

1. algorithm namespace `vem-source-anchor-v1`;
2. normalized POSIX project-relative real path;
3. enclosing component/function identity or `module`;
4. normalized structural JSX AST path;
5. lowercase intrinsic tag; and
6. transform version `1`.

The complete source identity remains `(sourceRegistryRevision, sourceAnchorId)`. The opaque ID is not runtime identity, is not comparable across registry revisions and does not improve page-selection trust. Any duplicate ID with different canonical input fails closed as `ANCHOR_HASH_COLLISION`.

Each in-memory record contains only schema/transform version, source registry revision, opaque anchor, normalized relative file, enclosing component, JSX path, intrinsic tag and original 1-based line/column. Output is immutable, bounded and deterministic. P0-T15 exposes a private snapshot for the build integration only; it does not publish, persist or implement lookup. P0-T16 owns revision-scoped publication and lookup.

## Source maps and development behavior

MagicString emits a high-resolution map with original content. Vite remains responsible for chaining it through the later React/Oxc transform. Attribute-only edits must preserve JSX automatic/classic execution, React Fast Refresh boundaries, original source line/column and user attributes in the tested matrix.

## Production non-participation

The same plugin object is present in demo configuration but Vite excludes it for `build` via `apply: "serve"`. Production must not call or resolve marker transform, registry snapshot, client, endpoint or publication paths. No post-build deletion is permitted. A fixed fixture built without VEM and with VEM configured must have the same module graph, HTML, JavaScript, CSS, assets and rendered SSR behavior byte-for-byte; user broad and same-name attributes remain present. Leakage scans match only VEM-owned module IDs, endpoint/registry signatures and generated `vem1_` marker values.

## Consequences and boundaries

This ADR accepts one narrow development transform seam. It does not accept source registry publication/lookup, source resolution, runtime owner/usage evidence, HMR revision tracking, client or HTML injection, endpoint configuration, Coordinator/MCP participation, cross-framework support or production artifact repair. Unsupported combinations remain unavailable until their own compatibility and Edge evidence exists.
