import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  PrivateInMemoryRegistry,
  SOURCE_ANCHOR_ATTRIBUTE,
  SOURCE_ANCHOR_PREFIX,
  SourceAnchorError,
  transformIntrinsicJsx,
  vemSourceAnchor,
  type SourceAnchorRecord,
} from "./index.js";

const projectRoot = resolve(process.cwd(), "packages/demo-fixture");
const fixtureFile = resolve(projectRoot, "src/App.tsx");

function transform(code: string, overrides: Partial<Parameters<typeof transformIntrinsicJsx>[0]> = {}) {
  return transformIntrinsicJsx({
    code,
    filename: fixtureFile,
    relativeFile: "src/App.tsx",
    sourceRegistryRevision: "fixture-registry-1",
    ...overrides,
  });
}

describe("P0 source-anchor identity and JSX transform", () => {
  test("records the accepted ADR, exact matrix and serve-only plugin boundary", () => {
    const adr = readFileSync(
      resolve(process.cwd(), "docs/adr/0006-source-anchor-production-nonparticipation.md"),
      "utf8",
    );
    expect(adr).toContain("Status: Accepted");
    for (const contract of ["REV-ID-001", "EVIDENCE-TRUST-001", "PROD-LEAK-001"]) {
      expect(adr).toContain(contract);
    }
    for (const exact of ["Vite `8.1.5`", "React DOM `19.2.8`", "plugin-react@6.0.4", "oxc-parser@0.142.0", "magic-string@1.1.0"]) {
      expect(adr).toContain(exact);
    }
    const plugin = vemSourceAnchor({ projectRoot, sourceRegistryRevision: "fixture-registry-1" });
    expect(plugin).toMatchObject({ name: "vem:source-anchor", apply: "serve", enforce: "pre" });
  });

  test("injects deterministic opaque anchors into intrinsic JSX after spreads only", () => {
    const code = `
      export function App(props: Record<string, unknown>) {
        return <section><Button /><button aria-label="save" {...props}>Save</button><UI.Box /><my-widget /></section>;
      }
    `;
    const first = transform(code);
    const second = transform(code);
    expect(first.records).toHaveLength(3);
    expect(first.records.map((record) => record.sourceAnchorId)).toEqual(
      second.records.map((record) => record.sourceAnchorId),
    );
    expect(first.records.every((record) => record.sourceAnchorId.startsWith(SOURCE_ANCHOR_PREFIX))).toBe(true);
    expect(first.records.every((record) => record.sourceAnchorId.length === 37)).toBe(true);
    expect(first.code).toMatch(/\{\.\.\.props\} data-vem-source-anchor="vem1_[a-f0-9]{32}">/u);
    expect(first.code).toMatch(/<Button \/>/u);
    expect(first.code).toMatch(/<UI\.Box \/>/u);
    expect(first.code).not.toMatch(/<Button [^>]*data-vem-source-anchor/u);
    expect(first.code).not.toMatch(/<UI\.Box [^>]*data-vem-source-anchor/u);
    expect(first.records.map((record) => record.intrinsicTag)).toEqual(["section", "button", "my-widget"]);
    expect(new Set(first.records.map((record) => record.jsxAstPath)).size).toBe(3);
  });

  test("keeps component, original Unicode-aware location and high-resolution source content", () => {
    const code = `const label = "😀";\nexport function App() {\n  return <button>Save</button>;\n}`;
    const result = transform(code);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      enclosingComponent: "App",
      intrinsicTag: "button",
      line: 3,
      column: 11,
      sourceRegistryRevision: "fixture-registry-1",
    });
    expect(result.map.sources).toEqual(["src/App.tsx"]);
    expect(result.map.sourcesContent).toEqual([code]);
    expect(result.map.mappings.length).toBeGreaterThan(code.length);
    expect(Object.isFrozen(result.records)).toBe(true);
    expect(Object.isFrozen(result.records[0])).toBe(true);
  });

  test("supports classic JSX source syntax without changing its runtime pragma", () => {
    const code = `/** @jsx React.createElement */\nexport function Classic(){ return <div className="x" />; }`;
    const result = transform(code, { filename: fixtureFile.replace(/\.tsx$/u, ".jsx") });
    expect(result.records).toHaveLength(1);
    expect(result.code).toContain("@jsx React.createElement");
    expect(result.code).toContain(`${SOURCE_ANCHOR_ATTRIBUTE}="${result.records[0]?.sourceAnchorId}"`);
  });

  test("keeps structural identity stable across non-identity text edits but revision-scopes records", () => {
    const first = transform(`export function App(){ return <button>Save</button>; }`);
    const second = transform(`export function App(){ return <button>Delete</button>; }`, {
      sourceRegistryRevision: "fixture-registry-2",
    });
    expect(first.records[0]?.sourceAnchorId).toBe(second.records[0]?.sourceAnchorId);
    expect(first.records[0]?.sourceRegistryRevision).not.toBe(second.records[0]?.sourceRegistryRevision);
  });

  test("fails closed on a reserved attribute, parser error and anchor bound", () => {
    expect(() => transform(`export const App=()=> <div data-vem-source-anchor="user" />;`)).toThrowError(
      expect.objectContaining({ code: "RESERVED_ATTRIBUTE_CONFLICT" }),
    );
    expect(() => transform(`export const raw = "VEM_FIXTURE_SECRET_NOT_REAL"; <div`)).toThrowError(
      expect.objectContaining({ code: "PARSER_ERROR", message: "The supported JSX parser could not transform this source file." }),
    );
    expect(() => transform(`export const App=()=> <><div/><span/></>;`, { maxAnchorsPerFile: 1 })).toThrowError(
      expect.objectContaining({ code: "ANCHOR_LIMIT_EXCEEDED" }),
    );
    try {
      transform(`export const raw = "VEM_FIXTURE_SECRET_NOT_REAL"; <div`);
    } catch (error) {
      expect(String(error)).not.toContain("VEM_FIXTURE_SECRET_NOT_REAL");
    }
  });
});

describe("private in-memory registry and plugin scope", () => {
  test("replaces per-file records and returns a bounded immutable non-published snapshot", async () => {
    const code = readFileSync(fixtureFile, "utf8");
    const plugin = vemSourceAnchor({ projectRoot, sourceRegistryRevision: "fixture-registry-1" });
    const hook = plugin.transform;
    expect(typeof hook).toBe("function");
    if (typeof hook !== "function") return;
    expect(await hook.call({} as never, code, `${fixtureFile}?raw`)).toBeNull();
    expect(await hook.call({} as never, code, resolve(process.cwd(), "package.json"))).toBeNull();
    const transformed = await hook.call({} as never, code, fixtureFile);
    expect(transformed).not.toBeNull();
    const snapshot = plugin.getPrivateRegistrySnapshot();
    expect(snapshot).toMatchObject({
      schemaVersion: "P0-T15-private-registry-v1",
      sourceRegistryRevision: "fixture-registry-1",
      persistence: "memory-only",
      publication: "not-implemented",
      lookup: "not-implemented",
    });
    expect(snapshot.records.length).toBeGreaterThan(10);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.records)).toBe(true);
    await hook.call({} as never, `export const App=()=> <main/>;`, fixtureFile);
    expect(plugin.getPrivateRegistrySnapshot().records).toHaveLength(1);
  });

  test("detects a cross-file opaque-ID collision rather than choosing a candidate", () => {
    const registry = new PrivateInMemoryRegistry("fixture-registry-1");
    const base: SourceAnchorRecord = {
      schemaVersion: "P0-T15-source-registry-v1",
      transformVersion: "1",
      sourceRegistryRevision: "fixture-registry-1",
      sourceAnchorId: "vem1_00000000000000000000000000000000",
      relativeFile: "src/A.tsx",
      enclosingComponent: "A",
      jsxAstPath: "Program.body[0]",
      intrinsicTag: "div",
      line: 1,
      column: 1,
    };
    registry.replaceFile(base.relativeFile, [base]);
    expect(() => registry.replaceFile("src/B.tsx", [{ ...base, relativeFile: "src/B.tsx" }])).toThrowError(
      expect.objectContaining({ code: "ANCHOR_HASH_COLLISION" }),
    );
    expect(() => registry.replaceFile("src/A.tsx", [{ ...base, sourceRegistryRevision: "other-revision" }])).toThrowError(
      expect.objectContaining({ code: "SOURCE_REGISTRY_REVISION_INVALID" }),
    );
    expect(() => registry.replaceFile("src/A.tsx", [{ ...base, jsxAstPath: "x".repeat(1_100_000) }])).toThrowError(
      expect.objectContaining({ code: "REGISTRY_SIZE_EXCEEDED" }),
    );
  });

  test("exposes safe stable errors without raw source or path values", () => {
    expect(new SourceAnchorError("ANCHOR_HASH_COLLISION")).toMatchObject({
      code: "ANCHOR_HASH_COLLISION",
      message: "Two distinct source identities produced the same opaque anchor.",
    });
    expect(() => vemSourceAnchor({ projectRoot, sourceRegistryRevision: "../bad revision" })).toThrowError(
      expect.objectContaining({ code: "SOURCE_REGISTRY_REVISION_INVALID" }),
    );
  });
});

describe("development-plane side-effect boundary", () => {
  test("contains no persistence, publication, client or endpoint implementation", () => {
    const source = ["anchor.ts", "plugin.ts", "types.ts"]
      .map((name) => readFileSync(resolve(process.cwd(), "packages/vite-plugin/src", name), "utf8"))
      .join("\n");
    for (const forbidden of [
      "writeFile",
      "appendFile",
      "mkdir",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "transformIndexHtml",
      "configureServer",
      "resolveId",
      "load(",
      "fetch(",
      "WebSocket",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
