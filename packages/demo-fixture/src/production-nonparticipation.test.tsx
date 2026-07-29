import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import { build, createServer, type PluginOption, type ViteDevServer } from "vite";
import { vemSourceAnchor } from "../../vite-plugin/src/index.js";
import { App } from "./App.js";

const root = resolve(process.cwd(), "packages/demo-fixture");
const productionEntry = resolve(root, "src/production-user-attributes.tsx");
let activeServer: ViteDevServer | undefined;

afterEach(async () => {
  await activeServer?.close();
  activeServer = undefined;
});

describe("real Vite development transform", () => {
  test("runs VEM before React Oxc and retains Fast Refresh and chained locations", async () => {
    const vem = vemSourceAnchor({ projectRoot: root, sourceRegistryRevision: "fixture-dev-registry-1" });
    activeServer = await createServer({
      root,
      configFile: false,
      appType: "custom",
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [vem, react()],
    });
    const names = activeServer.config.plugins.map((plugin) => plugin.name);
    expect(names.indexOf("vem:source-anchor")).toBeLessThan(names.indexOf("vite:react-babel"));
    const transformed = await activeServer.transformRequest("/src/App.tsx");
    expect(transformed).not.toBeNull();
    expect(transformed?.code).toMatch(/data-vem-source-anchor[^\n]+vem1_[a-f0-9]{32}/u);
    expect(transformed?.code).toMatch(/(?:react-refresh|RefreshReg|\$RefreshSig\$)/u);
    const map = transformed?.map;
    expect(map && "sources" in map
      ? map.sources.some((source) => source?.endsWith("src/App.tsx"))
      : false).toBe(true);
    const snapshot = vem.getPrivateRegistrySnapshot();
    expect(snapshot.records.length).toBeGreaterThan(10);
    expect(snapshot.records.every((record) => record.relativeFile === "src/App.tsx")).toBe(true);
  });
});

describe("production non-participation", () => {
  test("is byte/module-graph/behavior equivalent and preserves user attributes", async () => {
    const beforeBehavior = renderToStaticMarkup(<App />);
    const baseline = await productionBuild([react()]);
    const vem = vemSourceAnchor({ projectRoot: root, sourceRegistryRevision: "fixture-build-must-not-run" });
    const configured = await productionBuild([vem, react()]);
    const afterBehavior = renderToStaticMarkup(<App />);

    expect(configured).toEqual(baseline);
    expect(afterBehavior).toBe(beforeBehavior);
    expect(vem.getPrivateRegistrySnapshot().records).toHaveLength(0);

    const serialized = JSON.stringify(configured);
    expect(serialized).toContain("user-owned-production-value");
    expect(serialized).toContain("preserve-broad-vem-attribute");
    expect(serialized).toContain("preserve-broad-data-attribute");
    expect(serialized).not.toMatch(/vem1_[a-f0-9]{32}/u);
    for (const ownedSignature of [
      "P0-T15-source-registry-v1",
      "P0-T15-private-registry-v1",
      "vem:source-anchor",
      "@vem/vite-plugin",
      "fixture-build-must-not-run",
      "p0-t15-demo-dev",
      "/@vem",
    ]) {
      expect(serialized).not.toContain(ownedSignature);
    }
  });
});

async function productionBuild(plugins: PluginOption[]) {
  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins,
    build: {
      write: false,
      sourcemap: true,
      minify: false,
      rollupOptions: { input: productionEntry },
    },
  });
  if (Array.isArray(result)) throw new Error("UNEXPECTED_MULTI_OUTPUT");
  if (!("output" in result)) throw new Error("UNEXPECTED_WATCH_OUTPUT");
  return normalizeOutput(result as BuildOutput);
}

interface BuildAsset {
  type: "asset";
  fileName: string;
  source: string | Uint8Array;
}

interface BuildChunk {
  type: "chunk";
  fileName: string;
  code: string;
  imports: string[];
  dynamicImports: string[];
  modules: Record<string, unknown>;
  map: { toString(): string } | null;
}

interface BuildOutput {
  output: Array<BuildAsset | BuildChunk>;
}

function normalizeOutput(result: BuildOutput): unknown[] {
  return result.output.map((item) => item.type === "asset"
    ? {
        type: item.type,
        fileName: item.fileName,
        source: typeof item.source === "string" ? item.source : Buffer.from(item.source).toString("base64"),
      }
    : {
        type: item.type,
        fileName: item.fileName,
        code: item.code,
        imports: item.imports,
        dynamicImports: item.dynamicImports,
        modules: Object.keys(item.modules).sort(),
        map: item.map?.toString() ?? null,
      });
}
