import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { cleanupParticipantCapsule } from "./capsule.mjs";
import {
  assertR7AttemptPair,
  cleanupR7Attempt,
  containR7UnspawnedAttempt,
  createR7AttemptFactory,
  markR7AttemptProcessStarted,
  sealR7Attempt,
  snapshotR7Attempt,
} from "./r7-attempt-factory.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("R7 per-attempt capsule factory", () => {
  test("gives every retry and arm a distinct control root and final file", () => {
    const fixture = makeFixture();
    const factory = makeFactory(fixture);
    const direct1 = factory.prepare(spec("direct-search", 1));
    const vem1 = factory.prepare(spec("vem-assisted", 1, fixture.context));
    const direct2 = factory.prepare(spec("direct-search", 2));
    const vem2 = factory.prepare(spec("vem-assisted", 2, fixture.context));
    const handles = [direct1, vem1, direct2, vem2];

    expect(assertR7AttemptPair(direct1, vem1)).toMatchObject({
      valid: true,
      onlyDifference: "vem-context.json",
    });
    expect(assertR7AttemptPair(direct2, vem2)).toMatchObject({
      valid: true,
      onlyDifference: "vem-context.json",
    });
    expect(new Set(handles.map((handle) => handle.resources.controlRoot)).size).toBe(4);
    expect(new Set(handles.map(
      (handle) => handle.resources.authoritativeResponsePath,
    )).size).toBe(4);
    expect(new Set(handles.map(
      (handle) => handle.resources.permissionProfilePath,
    )).size).toBe(4);
    expect(direct1.boundary.baseContextHash).toBe(direct2.boundary.baseContextHash);
    expect(vem1.boundary.treatmentHash).toBe(vem2.boundary.treatmentHash);
    expect(direct2.capsule.manifest.workspaceFiles.map((file) => file.path)).not
      .toContain("vem-context.json");

    for (const handle of handles) {
      containR7UnspawnedAttempt(handle, "R7_TEST_NOT_SPAWNED");
      expect(cleanupR7Attempt(handle)).toMatchObject({ cleaned: true });
    }
  });

  test("requires a complete terminal seal before cleaning a started attempt", () => {
    const fixture = makeFixture();
    const handle = makeFactory(fixture).prepare(spec("direct-search", 1));
    markR7AttemptProcessStarted(handle);
    expect(() => cleanupR7Attempt(handle)).toThrowError("R7_ATTEMPT_CLEANUP_INVALID");
    expect(() => sealR7Attempt(handle, {
      ...terminal("run-1"),
      ledgerSealed: false,
    })).toThrowError("R7_ATTEMPT_SEAL_INVALID");
    expect(sealR7Attempt(handle, terminal("run-1"))).toMatchObject({
      processStarted: true,
      evidenceSealed: true,
    });
    expect(cleanupR7Attempt(handle)).toMatchObject({
      phase: "cleaned",
      cleaned: true,
    });
  });

  test("rejects duplicate attempt identities and treatment drift", () => {
    const fixture = makeFixture();
    const factory = makeFactory(fixture);
    const direct = factory.prepare(spec("direct-search", 1));
    expect(() => factory.prepare(spec("direct-search", 1)))
      .toThrowError("R7_ATTEMPT_ALREADY_PREPARED");
    expect(() => factory.prepare({ ...spec("vem-assisted", 1, fixture.context), prompt: "drift" }))
      .toThrowError("R7_ATTEMPT_BOUNDARY_DRIFT");
    containR7UnspawnedAttempt(direct, "R7_TEST_NOT_SPAWNED");
    cleanupR7Attempt(direct);
  });

  test("turns cleanup exceptions into a fail-closed lifecycle state", () => {
    const fixture = makeFixture();
    let capsule;
    const factory = makeFactory(fixture, {
      cleanup(value) {
        capsule = value;
        cleanupParticipantCapsule(value);
        throw new Error("injected cleanup failure");
      },
    });
    const handle = factory.prepare(spec("direct-search", 1));
    containR7UnspawnedAttempt(handle, "R7_TEST_NOT_SPAWNED");
    expect(() => cleanupR7Attempt(handle)).toThrowError("R7_ATTEMPT_CLEANUP_FAILED");
    expect(snapshotR7Attempt(handle)).toMatchObject({
      phase: "cleanup-failed",
      cleanupFailed: true,
      cleaned: false,
    });
    expect(capsule.capsuleRoot).toBe(handle.capsule.capsuleRoot);
  });
});

export function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "vem-r7-t2-test-"));
  roots.push(root);
  const source = join(root, "fixture");
  mkdirSync(join(source, "packages/demo-fixture/src"), { recursive: true, mode: 0o700 });
  writePrivate(join(source, "packages/demo-fixture/src/App.tsx"), "export const App = () => null;\n", 0o400);
  writePrivate(join(source, "packages/demo-fixture/src/fixtures.ts"), "export const fixture = 1;\n", 0o400);
  const schema = join(root, "response-schema.json");
  writePrivate(schema, '{"type":"object"}\n', 0o400);
  const context = join(root, "vem-context.json");
  writePrivate(context, '{"source":"frozen"}\n', 0o400);
  const auth = join(root, "auth.json");
  writePrivate(auth, '{}\n', 0o600);
  const codexInstallRoot = join(root, "codex-install");
  mkdirSync(codexInstallRoot, { mode: 0o700 });
  return { root, source, schema, context, auth, codexInstallRoot };
}

export function makeFactory(fixture, overrides = {}) {
  return createR7AttemptFactory({
    sourceRoot: fixture.source,
    responseSchemaPath: fixture.schema,
    model: "r7-local-no-call",
    authFile: fixture.auth,
    codexInstallRoot: fixture.codexInstallRoot,
    ...overrides,
  });
}

export function spec(arm, attemptNumber, vemContextPath) {
  return {
    taskId: "r7-local-task-01",
    arm,
    attemptNumber,
    prompt: "Locate the frozen local fixture heading.",
    ...(vemContextPath === undefined ? {} : { vemContextPath }),
  };
}

export function terminal(runId, classification = "success") {
  return {
    runId,
    classification,
    failureCode: classification === "success" ? "R7_ATTEMPT_SUCCESS" : "R7_RETRYABLE_FAILURE",
    processTreeTerminated: true,
    streamsSealed: true,
    finalObservationSealed: true,
    ledgerSealed: true,
    boundarySealed: true,
    manifestsSealed: true,
  };
}

function writePrivate(path, body, mode) {
  writeFileSync(path, body, { encoding: "utf8", flag: "wx", mode });
  chmodSync(path, mode);
  expect(readFileSync(path, "utf8")).toBe(body);
}
