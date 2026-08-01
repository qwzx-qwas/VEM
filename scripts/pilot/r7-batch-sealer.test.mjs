import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { cleanupParticipantCapsule } from "./capsule.mjs";
import { runR7ExceptionSafeBatch, verifyR7BatchManifest } from "./r7-batch-sealer.mjs";
import { makeFactory, makeFixture, spec, terminal } from "./r7-attempt-factory.test.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("R7 exception-safe batch sealing", () => {
  test("runs an authorized retry in a distinct attempt and consumes two process slots", async () => {
    const setup = makeBatch();
    const result = await runR7ExceptionSafeBatch({
      ...setup.options,
      runBatch: async (batch) => {
        const first = batch.prepareAttempt(spec("direct-search", 1));
        batch.markProcessStarted(first, "run-attempt-1");
        batch.sealAttempt(first, terminal("run-attempt-1", "provider-timeout"));
        batch.authorizeRetry({
          armKey: "r7-local-task-01:direct-search",
          nextAttemptNumber: 2,
        });
        const retry = batch.prepareAttempt(spec("direct-search", 2));
        expect(retry.resources.controlRoot).not.toBe(first.resources.controlRoot);
        expect(retry.resources.authoritativeResponsePath)
          .not.toBe(first.resources.authoritativeResponsePath);
        batch.markProcessStarted(retry, "run-attempt-2");
        batch.sealAttempt(retry, terminal("run-attempt-2"));
        batch.completeArm("r7-local-task-01:direct-search");
      },
    });
    expect(result).toMatchObject({
      ok: true,
      processAttemptCount: 2,
      retryAuthorized: true,
      retryProcessStarted: true,
      remainingProcessAttemptBudget: 0,
      evidenceSealed: true,
    });
    expect(json(setup.resultRoot, "results/run-index.json").attempts).toHaveLength(2);
    expect(verifyR7BatchManifest(setup.resultRoot)).toBe(true);
  });

  test("seals an authorized but unspawned retry without consuming its budget", async () => {
    const setup = makeBatch();
    const result = await runR7ExceptionSafeBatch({
      ...setup.options,
      runBatch: async (batch) => {
        const first = batch.prepareAttempt(spec("direct-search", 1));
        batch.markProcessStarted(first, "run-attempt-1");
        batch.sealAttempt(first, terminal("run-attempt-1", "provider-timeout"));
        batch.authorizeRetry({
          armKey: "r7-local-task-01:direct-search",
          nextAttemptNumber: 2,
        });
        batch.prepareAttempt(spec("direct-search", 2));
        await batch.atStage("capsule-preparation", () => {
          throw new Error("R7_INJECTED_PRESPAWN_EXCEPTION");
        });
      },
    });
    expect(result).toMatchObject({
      stopped: true,
      processAttemptCount: 1,
      remainingProcessAttemptBudget: 1,
      retryAuthorized: true,
      retryProcessStarted: false,
      evidenceSealed: true,
    });
    expect(json(setup.resultRoot, "results/batch-stop.json")).toMatchObject({
      unspawnedRetryConsumedBudget: false,
      sealedProcessAttemptCount: 1,
      allSealedAttemptEvidenceRetained: true,
    });
    expect(json(setup.resultRoot, "results/run-index.json").attempts).toHaveLength(2);
  });

  test.each([
    ["retry-planning", "runBatch"],
    ["spawn", "runBatch"],
    ["classification", "runBatch"],
    ["aggregate-evaluation", "aggregate"],
    ["terminal-manifest", "manifest"],
  ])("contains a %s exception with verdict and top-level manifest", async (stage, source) => {
    const setup = makeBatch();
    const result = await runR7ExceptionSafeBatch({
      ...setup.options,
      runBatch: async (batch) => {
        const first = batch.prepareAttempt(spec("direct-search", 1));
        batch.markProcessStarted(first, "run-attempt-1");
        batch.sealAttempt(first, terminal("run-attempt-1", "provider-timeout"));
        if (source === "runBatch") {
          await batch.atStage(stage, () => {
            throw new Error("R7_INJECTED_STAGE_EXCEPTION");
          });
        }
      },
      aggregate: () => {
        if (source === "aggregate") throw new Error("R7_INJECTED_AGGREGATE_EXCEPTION");
        return { ok: true };
      },
      terminalManifestProbe: () => {
        if (source === "manifest") throw new Error("R7_INJECTED_MANIFEST_EXCEPTION");
      },
    });
    expect(result.stopped).toBe(true);
    expect(result.exceptionCount).toBeGreaterThan(0);
    expect(json(setup.resultRoot, "results/exceptions.json").exceptions)
      .toEqual(expect.arrayContaining([expect.objectContaining({ stage })]));
    expect(json(setup.resultRoot, "results/verdict.json")).toMatchObject({
      outcome: "stopped",
      decision: "not-evaluated",
      externalExecutionAuthorized: false,
      evidenceSealedBeforeReturn: true,
    });
    expect(verifyR7BatchManifest(setup.resultRoot)).toBe(true);
  });

  test("fails closed on cleanup failure but retains the sealed attempt", async () => {
    const setup = makeBatch({
      cleanup(capsule) {
        cleanupParticipantCapsule(capsule);
        throw new Error("injected cleanup failure");
      },
    });
    const result = await runR7ExceptionSafeBatch({
      ...setup.options,
      runBatch: async (batch) => {
        const first = batch.prepareAttempt(spec("direct-search", 1));
        batch.markProcessStarted(first, "run-attempt-1");
        batch.sealAttempt(first, terminal("run-attempt-1"));
        batch.completeArm("r7-local-task-01:direct-search");
      },
    });
    expect(result).toMatchObject({ stopped: true, processAttemptCount: 1 });
    expect(json(setup.resultRoot, "results/exceptions.json").exceptions)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ stage: "cleanup", code: "R7_ATTEMPT_CLEANUP_FAILED" }),
      ]));
    expect(json(setup.resultRoot, "results/run-index.json").attempts[0]).toMatchObject({
      evidenceSealed: true,
      cleanupFailed: true,
    });
  });

  test("does not start a retry beyond budget and does not silently rerun an authorization", async () => {
    const setup = makeBatch({}, { maxProcessAttempts: 1 });
    const first = await runR7ExceptionSafeBatch({
      ...setup.options,
      runBatch: async (batch) => {
        const attempt = batch.prepareAttempt(spec("direct-search", 1));
        batch.markProcessStarted(attempt, "run-attempt-1");
        batch.sealAttempt(attempt, terminal("run-attempt-1", "provider-timeout"));
        batch.authorizeRetry({
          armKey: "r7-local-task-01:direct-search",
          nextAttemptNumber: 2,
        });
        const retry = batch.prepareAttempt(spec("direct-search", 2));
        batch.markProcessStarted(retry, "run-attempt-2");
      },
    });
    expect(first).toMatchObject({
      stopped: true,
      processAttemptCount: 1,
      retryAuthorized: true,
      retryProcessStarted: false,
      remainingProcessAttemptBudget: 0,
    });
    const alternateRoot = join(setup.baseRoot, "alternate-result");
    mkdirSync(alternateRoot, { mode: 0o700 });
    await expect(runR7ExceptionSafeBatch({
      ...setup.options,
      resultRoot: alternateRoot,
      runBatch: async () => {},
    })).rejects.toThrowError();
    expect(json(setup.resultRoot, "results/batch-stop.json").externalRerunPerformed)
      .toBe(false);
  });

  test("seals an explicitly supplied future decision verdict into the same manifest", async () => {
    const setup = makeBatch();
    const result = await runR7ExceptionSafeBatch({
      ...setup.options,
      runBatch: async (batch) => {
        const attempt = batch.prepareAttempt(spec("direct-search", 1));
        batch.markProcessStarted(attempt, "run-attempt-1");
        batch.sealAttempt(attempt, terminal("run-attempt-1"));
        batch.completeArm("r7-local-task-01:direct-search");
      },
      aggregate: () => ({ successfulArmCount: 1 }),
      verdictFactory: ({ aggregateObservation, stopped }) => ({
        schemaVersion: "R7-future-decision-v1",
        decisionKey: "R7-RECOVERY",
        verdict: stopped ? "stop" : "continue",
        successfulArmCount: aggregateObservation.successfulArmCount,
      }),
    });
    expect(result.ok).toBe(true);
    expect(json(setup.resultRoot, "results/verdict.json")).toMatchObject({
      schemaVersion: "R7-future-decision-v1",
      decisionKey: "R7-RECOVERY",
      verdict: "continue",
      successfulArmCount: 1,
      evidenceSealedBeforeReturn: true,
    });
    expect(verifyR7BatchManifest(setup.resultRoot)).toBe(true);
  });

  test("contains no provider, child-process, or network call primitive", () => {
    for (const file of ["r7-attempt-factory.mjs", "r7-batch-sealer.mjs"]) {
      const source = readFileSync(join(import.meta.dirname, file), "utf8");
      expect(source).not.toMatch(/node:child_process|node:https|node:http|fetch\s*\(|\.spawn\s*\(/u);
    }
  });
});

function makeBatch(factoryOverrides = {}, optionOverrides = {}) {
  const fixture = makeFixture();
  const baseRoot = mkdtempSync(join(tmpdir(), "vem-r7-t2-batch-"));
  roots.push(baseRoot);
  const resultRoot = join(baseRoot, "result");
  const ledgerRoot = join(baseRoot, "authorization-ledger");
  mkdirSync(resultRoot, { mode: 0o700 });
  mkdirSync(ledgerRoot, { mode: 0o700 });
  return {
    baseRoot,
    resultRoot,
    options: {
      resultRoot,
      authorizationLedgerRoot: ledgerRoot,
      authorizationId: "r7-t2-local-authorization",
      expectedArmCount: 1,
      maxProcessAttempts: 2,
      attemptFactory: makeFactory(fixture, factoryOverrides),
      ...optionOverrides,
    },
  };
}

function json(root, path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}
