# Exact transform dependency sources

Observed and locked on 2026-07-29:

- `oxc-parser@0.142.0`: https://www.npmjs.com/package/oxc-parser?activeTab=versions
- `magic-string@1.1.0`: https://www.npmjs.com/package/magic-string?activeTab=versions

Both dependencies are exact in `packages/vite-plugin/package.json` and `pnpm-lock.yaml` and are MIT-classified. `vite@8.1.5` remains an exact peer/dev dependency. Registry resolution reported only upstream optional WASI peer warnings for Rolldown/Oxc; the native Linux x64 parser and Node 24 build/test paths completed successfully.
