import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { PrivateInMemoryRegistry, transformIntrinsicJsx, type SourceAnchorRecord } from "../../vite-plugin/src/index.js";
import {
  P0_TRANSFORM_COMPATIBILITY,
  RevisionScopedSourceRegistry,
  type SourceRegistryPublication,
} from "./index.js";

const revision = {
  projectInstanceId: "fixture-project-1",
  coordinatorSequence: 1,
  buildRevision: "fixture-build-1",
  sourceRegistryRevision: "fixture-registry-1",
};

function publication(overrides: Partial<SourceRegistryPublication> = {}): SourceRegistryPublication {
  const filename = resolve(process.cwd(), "packages/demo-fixture/src/App.tsx");
  const transformed = transformIntrinsicJsx({
    code: `export function App(){ return <main><button>Save</button></main>; }`,
    filename,
    relativeFile: "src/App.tsx",
    sourceRegistryRevision: overrides.revision?.sourceRegistryRevision ?? revision.sourceRegistryRevision,
  });
  const privateRegistry = new PrivateInMemoryRegistry(
    overrides.revision?.sourceRegistryRevision ?? revision.sourceRegistryRevision,
  );
  privateRegistry.replaceFile("src/App.tsx", transformed.records);
  return {
    schemaVersion: "P0-T16-source-registry-publication-v1",
    revision,
    transform: { ...P0_TRANSFORM_COMPATIBILITY },
    snapshot: privateRegistry.snapshot(),
    publishedAt: "2026-07-29T15:02:32+08:00",
    ...overrides,
  };
}

function recordAt(input: SourceRegistryPublication, index: number): SourceAnchorRecord {
  const record = input.snapshot.records[index];
  if (!record) throw new Error("SOURCE_RECORD_FIXTURE_MISSING");
  return record;
}

describe("revision-scoped publication and direct lookup", () => {
  test("publishes a real P0 transform snapshot and returns one registry-matched relative location", () => {
    const input = publication();
    const registry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    const published = registry.publish(input);
    expect(published).toMatchObject({ ok: true, status: "published", recordCount: 2, revision });
    if (!published.ok) return;
    expect(published.publicationDigest).toMatch(/^[a-f0-9]{64}$/u);

    const anchor = input.snapshot.records.find((record) => record.intrinsicTag === "button");
    expect(anchor).toBeDefined();
    if (!anchor) return;
    const result = registry.lookup({ revision, sourceAnchorId: anchor.sourceAnchorId });
    expect(result).toMatchObject({
      ok: true,
      status: "direct",
      integrity: "registry-matched",
      freshness: "current",
      source: {
        sourceAnchorId: anchor.sourceAnchorId,
        sourceRegistryRevision: revision.sourceRegistryRevision,
        relativeFile: "src/App.tsx",
        line: 1,
        intrinsicTag: "button",
        enclosingComponent: "App",
      },
      candidates: [],
      conflicts: [],
    });
    if (!result.ok) return;
    expect(result.source.normalizedRelativeFileIdentity).toMatch(/^vemfile1_[a-f0-9]{32}$/u);
    expect(result.source.normalizedRelativeFileIdentity).not.toContain("src/App.tsx");
    expect(result.evidenceHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(result.source)).toBe(true);
  });

  test("treats same revision and content as idempotent regardless of publication time or later sequence", () => {
    const registry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    const first = registry.publish(publication());
    const second = registry.publish(publication({
      revision: { ...revision, coordinatorSequence: 9 },
      publishedAt: "2026-07-29T15:03:32+08:00",
    }));
    expect(first).toMatchObject({ ok: true, status: "published" });
    expect(second).toMatchObject({ ok: true, status: "idempotent", revision });
    if (first.ok && second.ok) expect(second.publicationDigest).toBe(first.publicationDigest);
    expect(registry.diagnosticState()).toMatchObject({ retainedRevisionCount: 1 });
  });

  test("rejects same-revision content collision atomically", () => {
    const registry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    const original = publication();
    expect(registry.publish(original).ok).toBe(true);
    const firstRecord = recordAt(original, 0);
    const secondRecord = recordAt(original, 1);
    const changedRecord = { ...firstRecord, line: 99 };
    const collision = publication({
      snapshot: Object.freeze({ ...original.snapshot, records: Object.freeze([changedRecord, secondRecord]) }),
    });
    expect(registry.publish(collision)).toMatchObject({ ok: false, error: { code: "REVISION_COLLISION" } });
    expect(registry.lookup({ revision, sourceAnchorId: firstRecord.sourceAnchorId }).ok).toBe(true);
    expect(registry.diagnosticState().retainedRevisionCount).toBe(1);
  });

  test("publishes a newer revision, retains one previous diagnostic and never looks it up as current", () => {
    const registry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    const first = publication();
    expect(registry.publish(first).ok).toBe(true);
    const nextRevision = {
      ...revision,
      coordinatorSequence: 2,
      buildRevision: "fixture-build-2",
      sourceRegistryRevision: "fixture-registry-2",
    };
    const second = publication({ revision: nextRevision });
    expect(registry.publish(second)).toMatchObject({ ok: true, status: "published" });
    expect(registry.diagnosticState()).toMatchObject({
      currentSourceRegistryRevision: "fixture-registry-2",
      previousSourceRegistryRevision: "fixture-registry-1",
      retainedRevisionCount: 2,
    });
    const oldAnchor = recordAt(first, 0);
    expect(registry.lookup({ revision, sourceAnchorId: oldAnchor.sourceAnchorId })).toMatchObject({
      ok: false,
      error: { code: "STALE_REVISION", currentSourceRegistryRevision: "fixture-registry-2" },
    });
    const current = registry.lookup({ revision: nextRevision, sourceAnchorId: recordAt(second, 0).sourceAnchorId });
    expect(current.ok).toBe(true);
    if (current.ok) {
      const oldRegistry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
      oldRegistry.publish(first);
      const old = oldRegistry.lookup({ revision, sourceAnchorId: oldAnchor.sourceAnchorId });
      expect(old.ok).toBe(true);
      if (old.ok) expect(current.source.normalizedRelativeFileIdentity).not.toBe(old.source.normalizedRelativeFileIdentity);
    }
    const thirdRevision = {
      ...nextRevision,
      coordinatorSequence: 3,
      buildRevision: "fixture-build-3",
      sourceRegistryRevision: "fixture-registry-3",
    };
    expect(registry.publish(publication({ revision: thirdRevision }))).toMatchObject({ ok: true, status: "published" });
    expect(registry.diagnosticState()).toMatchObject({
      currentSourceRegistryRevision: "fixture-registry-3",
      previousSourceRegistryRevision: "fixture-registry-2",
      retainedRevisionCount: 2,
    });
  });
});

describe("fail-closed context, compatibility and bounds", () => {
  test("rejects stale project, build, source revision and sequence independently", () => {
    const input = publication();
    const registry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    registry.publish(input);
    const sourceAnchorId = recordAt(input, 0).sourceAnchorId;
    const cases = [
      [{ ...revision, projectInstanceId: "old-project" }, "STALE_PROJECT"],
      [{ ...revision, buildRevision: "old-build" }, "STALE_REVISION"],
      [{ ...revision, sourceRegistryRevision: "old-registry" }, "STALE_REVISION"],
      [{ ...revision, coordinatorSequence: 0 }, "STALE_SEQUENCE"],
    ] as const;
    for (const [staleRevision, code] of cases) {
      expect(registry.lookup({ revision: staleRevision, sourceAnchorId })).toMatchObject({ ok: false, error: { code } });
    }
    expect(registry.lookup({ revision: { ...revision, coordinatorSequence: 2 }, sourceAnchorId }).ok).toBe(true);
  });

  test("rejects non-monotonic publication and different project until explicit reset", () => {
    const registry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    expect(registry.publish(publication()).ok).toBe(true);
    const nonMonotonicRevision = {
      ...revision,
      buildRevision: "fixture-build-2",
      sourceRegistryRevision: "fixture-registry-2",
    };
    expect(registry.publish(publication({ revision: nonMonotonicRevision }))).toMatchObject({
      ok: false,
      error: { code: "STALE_SEQUENCE" },
    });
    const otherProjectRevision = {
      ...nonMonotonicRevision,
      projectInstanceId: "fixture-project-2",
      coordinatorSequence: 0,
    };
    expect(registry.publish(publication({ revision: otherProjectRevision }))).toMatchObject({
      ok: false,
      error: { code: "PROJECT_INSTANCE_MISMATCH" },
    });
    expect(registry.diagnosticState()).toMatchObject({ currentSourceRegistryRevision: "fixture-registry-1" });

    registry.resetProject("fixture-project-2");
    expect(registry.publish(publication({ revision: otherProjectRevision }))).toMatchObject({
      ok: true,
      status: "published",
      revision: otherProjectRevision,
    });
  });

  test("rejects unsupported transform and keeps registry empty", () => {
    const registry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    const incompatible = publication({
      transform: { ...P0_TRANSFORM_COMPATIBILITY, parser: "oxc-parser@0.141.0" } as never,
    });
    expect(registry.publish(incompatible)).toMatchObject({ ok: false, error: { code: "TRANSFORM_INCOMPATIBLE" } });
    expect(registry.diagnosticState().retainedRevisionCount).toBe(0);

    const reordered = publication({
      transform: {
        matrix: P0_TRANSFORM_COMPATIBILITY.matrix,
        parser: P0_TRANSFORM_COMPATIBILITY.parser,
        markerPrefix: P0_TRANSFORM_COMPATIBILITY.markerPrefix,
        transformVersion: P0_TRANSFORM_COMPATIBILITY.transformVersion,
        anchorNamespace: P0_TRANSFORM_COMPATIBILITY.anchorNamespace,
      },
    });
    expect(registry.publish(reordered)).toMatchObject({ ok: true, status: "published" });

    const unknown = { ...publication(), unexpected: true } as SourceRegistryPublication;
    const closedRegistry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    expect(closedRegistry.publish(unknown)).toMatchObject({ ok: false, error: { code: "PUBLICATION_INVALID" } });
  });

  test("rejects duplicate anchors, traversal and oversize publication atomically", () => {
    const base = publication();
    const registry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    const baseRecord = recordAt(base, 0);
    const duplicate = publication({
      snapshot: Object.freeze({ ...base.snapshot, records: Object.freeze([baseRecord, baseRecord]) }),
    });
    expect(registry.publish(duplicate)).toMatchObject({ ok: false, error: { code: "REVISION_COLLISION" } });

    const traversalRecord: SourceAnchorRecord = { ...baseRecord, relativeFile: "../outside.tsx" };
    const traversal = publication({
      snapshot: Object.freeze({ ...base.snapshot, records: Object.freeze([traversalRecord]) }),
    });
    expect(registry.publish(traversal)).toMatchObject({ ok: false, error: { code: "PUBLICATION_INVALID" } });

    const oversizedRecord: SourceAnchorRecord = { ...baseRecord, jsxAstPath: "x".repeat(1_600_000) };
    const oversized = publication({
      snapshot: Object.freeze({ ...base.snapshot, records: Object.freeze([oversizedRecord]) }),
    });
    expect(registry.publish(oversized)).toMatchObject({ ok: false, error: { code: "PUBLICATION_LIMIT_EXCEEDED" } });
    expect(registry.diagnosticState().retainedRevisionCount).toBe(0);
  });

  test("returns missing-anchor without candidates and resets all state on project restart", () => {
    const registry = new RevisionScopedSourceRegistry(revision.projectInstanceId);
    registry.publish(publication());
    expect(registry.lookup({ revision, sourceAnchorId: "vem1_00000000000000000000000000000000" })).toEqual({
      ok: false,
      status: "error",
      error: {
        code: "ANCHOR_NOT_FOUND",
        message: "The anchor is not a member of the current source registry.",
        retryable: true,
        currentSourceRegistryRevision: "fixture-registry-1",
      },
    });
    registry.resetProject("fixture-project-2");
    expect(registry.diagnosticState()).toMatchObject({
      projectInstanceId: "fixture-project-2",
      retainedRevisionCount: 0,
      persistence: "memory-only",
      transport: "not-implemented",
      sourceReads: "not-implemented",
      reattachment: "not-implemented",
    });
    expect(registry.lookup({ revision, sourceAnchorId: recordAt(publication(), 0).sourceAnchorId })).toMatchObject({
      ok: false,
      error: { code: "REGISTRY_NOT_PUBLISHED" },
    });
  });

  test("contains no persistence, source-read, transport, candidate or reattachment implementation", () => {
    const source = ["registry.ts", "types.ts"]
      .map((name) => readFileSync(resolve(process.cwd(), "packages/source-registry/src", name), "utf8"))
      .join("\n");
    for (const forbidden of [
      "readFile",
      "writeFile",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "fetch(",
      "WebSocket",
      "node:http",
      "node:net",
      "candidateRank",
      "reattach(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
