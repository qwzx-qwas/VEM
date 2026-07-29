# Exact dependency sources

Observed and locked on 2026-07-29:

- `react@19.2.8`: https://www.npmjs.com/package/react?activeTab=versions
- `react-dom@19.2.8`: https://www.npmjs.com/package/react-dom?activeTab=versions
- `vite@8.1.5`: https://www.npmjs.com/package/vite?activeTab=versions
- `@vitejs/plugin-react@6.0.4`: https://www.npmjs.com/package/@vitejs/plugin-react?activeTab=versions
- `@types/react@19.2.17`: https://www.npmjs.com/package/@types/react?activeTab=versions
- `@types/react-dom@19.2.3`: https://www.npmjs.com/package/@types/react-dom?activeTab=versions

All versions are exact in `packages/demo-fixture/package.json` and `pnpm-lock.yaml`. Registry resolution emitted an upstream optional WASI peer warning inside Rolldown; the native Node 24 build path completed successfully, and no direct dependency was added to suppress or mask that optional path.
