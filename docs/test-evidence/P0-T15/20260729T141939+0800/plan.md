# P0-T15 Execution Plan

- Starting commit: `237febb1130616f5c247de977abb723cfc005627`.
- Set P0-T15 to `in_progress` before transform implementation.
- Record an Accepted source-anchor/PROD-LEAK ADR with a narrow exact React/Vite/Oxc matrix and explicit degradations.
- Create private `@vem/vite-plugin` using exact `oxc-parser@0.142.0` and `magic-string@1.1.0` after lock/license verification.
- Implement a serve-only pre transform for project-local `.jsx/.tsx` intrinsic elements, never custom components or already-transformed JavaScript.
- Generate deterministic namespaced opaque IDs from normalized relative file, enclosing component, normalized JSX AST path, intrinsic tag and transform version; fail closed on collision.
- Detect explicit reserved-attribute conflicts, define spread precedence and preserve source locations with a high-resolution sourcemap.
- Keep registry output bounded and private in memory; do not publish, persist or implement lookup/source resolution.
- Configure the fixture plugin before React and retain automatic/classic JSX and Fast Refresh compatibility tests.
- Prove production build does not execute or resolve VEM transform/client/endpoint/registry code and is byte/module-graph/behavior equivalent to baseline without post-build cleanup.
- Prove user broad and same-name data attributes are preserved in production and scans use only VEM-owned signatures.
- Run build, DOM/transform/production tests, workspace/type/lint/roadmap/license, frozen/offline install and 98 preflight regressions.
- Record bounded evidence and SHA-256 manifest.
