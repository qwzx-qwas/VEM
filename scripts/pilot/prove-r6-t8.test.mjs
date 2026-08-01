import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildR6T8Proof } from "./prove-r6-t8.mjs";

describe("R6-T8 local dual-transport horizon proof", () => {
  test("binds both immutable attempts and emits a no-call disposition", () => {
    const proof = buildR6T8Proof();
    expect(proof).toMatchObject({
      taskId: "R6-T8",
      outcome: "passed",
      ownerAuthorization: {
        prerequisitePublish: {
          commit: "d3dca37e0aa2560238e81bc6639081cb6ecd321f",
          branch: "agent/complete-p0-r1-stages",
          remoteShaVerifiedBeforeTask: true,
        },
      },
      attemptOne: {
        taskId: "R6-T4",
        decisionAttempt: 1,
        decision: "adjust",
        resultManifestHash:
          "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8",
        evidenceImmutable: true,
      },
      attemptTwo: {
        taskId: "R6-T7",
        decisionAttempt: 2,
        supersedesAttempt: "R6-T4",
        decision: "adjust",
        resultManifestHash:
          "2ba2b0537b4fb312e2e82cdd69a7c87b41d05b7117572c5b58978bd300e8fdd7",
        verdictHash:
          "1283979be6a67ed5298877f8ab30c0eca087f8a1fcf88d3032364a353d0acf96",
        evidenceImmutable: true,
      },
      replay: {
        duplicateCrossTransportRawHashCount: 2,
        observedDualTransportTerminalHorizonLowerBoundMs: 600_000,
        reconnectLogAuthorizesRetry: false,
      },
      compatibilityContract: {
        disposition: "continue-to-preregistration-only",
        boundedEnvelopeAvailable: true,
        minimumExplicitProviderTerminalHorizonMs: 600_001,
        minimumTerminalObservationMarginMs: 308_226,
        minimumOuterDeadlineMs: 908_227,
        maximumOuterDeadlineMs: 1_200_000,
        exactAttemptThreeDeadlineSelected: false,
        policySelectionDeferredToTask: "R6-T9",
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
        orderedReceiptCorrelationRequired: true,
        rawHashUniquenessAssumed: false,
        runnerTerminationRetryable: false,
        maxRetriesPerArm: 1,
        maxProcessAttempts: 20,
        productUnlockCount: 0,
      },
      nextStage: {
        taskId: "R6-T9",
        noCallPreregistrationStructurallyEligible: true,
        exactDeadlineSelected: false,
        preregistrationFrozen: false,
        externalExecutionAuthorized: false,
        separatelyAuthorized: false,
      },
    });
    expect(Object.keys(proof.sourceBindings)).toEqual([
      "scripts/pilot/r6-dual-transport-horizon.mjs",
      "scripts/pilot/prove-r6-t8.mjs",
      "packages/pilot-harness/dist/canonical.js",
      "packages/pilot-harness/dist/index.js",
    ]);
  });

  test("fails closed if an immutable attempt-two entry changes", () => {
    expect(() => buildR6T8Proof(undefined, {
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
    })).toThrowError("R6_T8_RESULT_MANIFEST_ENTRY_CHANGED");
  });

  test("contains no process or provider execution implementation", () => {
    const sources = [
      "scripts/pilot/r6-dual-transport-horizon.mjs",
      "scripts/pilot/prove-r6-t8.mjs",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sources).not.toMatch(/node:child_process/u);
    expect(sources).not.toMatch(/\bspawnSync?\b/u);
    expect(sources).not.toMatch(/\bexecFileSync\b/u);
    expect(sources).not.toMatch(/\bcodex exec\b/u);
  });
});
