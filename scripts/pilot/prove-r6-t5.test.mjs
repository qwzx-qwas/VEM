import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildR6T5Proof } from "./prove-r6-t5.mjs";

describe("R6-T5 local deadline-horizon proof", () => {
  test("binds immutable attempt one and emits a no-call compatibility contract", () => {
    const proof = buildR6T5Proof();
    expect(proof).toMatchObject({
      taskId: "R6-T5",
      outcome: "passed",
      attemptOne: {
        taskId: "R6-T4",
        decisionAttempt: 1,
        decision: "adjust",
        resultManifestHash:
          "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8",
        verdictHash:
          "acf6fab787681e5ab7bb9213a9553ed950e4809ad167e1dad82f3ca6a7aa6902",
        evidenceImmutable: true,
      },
      compatibilityContract: {
        minimumExplicitProviderRetryHorizonMs: 120_006,
        minimumTerminalObservationMarginMs: 31_574,
        minimumOuterDeadlineMs: 151_580,
        exactAttemptTwoDeadlineSelected: false,
        policySelectionDeferredToTask: "R6-T6",
        externalExecutionAuthorized: false,
      },
      executionBoundary: {
        participantProcessSpawned: false,
        providerRequestSent: false,
        providerNetworkProbed: false,
        externalProcessCount: 0,
        externalModelCall: false,
      },
      preservedSafety: {
        processTreeTerminationRequired: true,
        runnerTerminationRetryable: false,
        maxRetriesPerArm: 1,
        maxProcessAttempts: 20,
        productUnlockCount: 0,
      },
      nextStage: {
        taskId: "R6-T6",
        exactDeadlineSelected: false,
        preregistrationFrozen: false,
        externalExecutionAuthorized: false,
        requiresExplicitHorizonProvenance: true,
      },
    });
    expect(Object.keys(proof.sourceBindings)).toEqual([
      "scripts/pilot/r6-deadline-horizon.mjs",
      "scripts/pilot/prove-r6-t5.mjs",
      "packages/pilot-harness/dist/canonical.js",
      "packages/pilot-harness/dist/index.js",
    ]);
  });

  test("fails closed if an immutable result entry changes", () => {
    expect(() => buildR6T5Proof(undefined, {
      readFile(path) {
        const value = readFileSync(path);
        if (String(path).endsWith("/results/verdict.json")) {
          return Buffer.from(
            value.toString("utf8").replace('"adjust"', '"continue"'),
            "utf8",
          );
        }
        return value;
      },
    })).toThrowError("R6_T5_RESULT_MANIFEST_ENTRY_CHANGED");
  });

  test("contains no process or provider execution implementation", () => {
    const sources = [
      "scripts/pilot/r6-deadline-horizon.mjs",
      "scripts/pilot/prove-r6-t5.mjs",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sources).not.toMatch(/node:child_process/u);
    expect(sources).not.toMatch(/\bspawnSync?\b/u);
    expect(sources).not.toMatch(/\bexecFileSync\b/u);
  });
});
