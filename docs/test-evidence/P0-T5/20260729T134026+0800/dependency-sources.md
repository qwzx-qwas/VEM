# Exact dependency source

Observed and locked on 2026-07-29:

- `happy-dom@20.11.1`: https://www.npmjs.com/package/happy-dom?activeTab=versions

The dependency is exact in `packages/injected-selector/package.json` and `pnpm-lock.yaml`, MIT-classified, and used only for DOM contract tests. The package has no new external production dependency; its only production dependency is internal `@vem/protocol`.
