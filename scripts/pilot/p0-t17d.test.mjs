import { describe, expect, test } from "vitest";
import { attemptTwoArmOrder, evaluateAttemptTwo } from "./p0-t17d.mjs";

function bundle(directNs = "20", vemNs = "10") {
  return {
    tasks: Array.from({ length: 5 }, (_, index) => ({
      taskId: `task-${index}`,
      rawRecords: [
        {
          record: {
            arm: "direct-search",
            locateDurationNs: directNs,
            directPrimaryMatch: null,
            wrongAttribution: false,
            targetChanged: false,
            reselectionCount: 0,
            operatorCorrection: false,
          },
        },
        {
          record: {
            arm: "vem-assisted",
            locateDurationNs: vemNs,
            directPrimaryMatch: true,
            wrongAttribution: false,
            targetChanged: false,
            reselectionCount: 0,
            operatorCorrection: false,
          },
        },
      ],
    })),
  };
}

function runs(overrides = {}) {
  return Array.from({ length: 10 }, (_, index) => ({
    threadId: `thread-${index}`,
    exitCode: 0,
    responseMatchesGroundTruth: true,
    preregistrationHashChanged: false,
    groundTruthVisible: false,
    holdoutConsumed: false,
    capsuleAudit: "passed",
    attemptChainValid: true,
    ...overrides,
  }));
}

describe("P0-T17D immutable attempt two", () => {
  test("reverses each attempt-one pair while preserving counterbalance", () => {
    expect(attemptTwoArmOrder(["direct-search", "vem-assisted"])).toEqual([
      "vem-assisted",
      "direct-search",
    ]);
    expect(attemptTwoArmOrder(["vem-assisted", "direct-search"])).toEqual([
      "direct-search",
      "vem-assisted",
    ]);
    expect(() => attemptTwoArmOrder(["direct-search", "direct-search"])).toThrowError(
      "P0_T17D_ATTEMPT_ONE_ARM_ORDER_INVALID",
    );
  });

  test("continues only when unchanged attempt chain, capsule audit and original threshold pass", () => {
    const verdict = evaluateAttemptTwo({
      runs: runs(),
      bundle: bundle(),
      setupDurationNs: "5",
    });
    expect(verdict).toMatchObject({
      schemaVersion: "P0-T17D-verdict-v1",
      decisionAttempt: 2,
      supersedesAttempt: "P0-T17B",
      verdict: "continue",
      capsuleStopReasons: [],
    });
  });

  test("stops fail closed when any capsule command/path audit fails", () => {
    const trialRuns = runs();
    trialRuns[3] = { ...trialRuns[3], capsuleAudit: "CAPSULE_COMMAND_PATH_ESCAPE" };
    const verdict = evaluateAttemptTwo({
      runs: trialRuns,
      bundle: bundle(),
      setupDurationNs: "5",
    });
    expect(verdict.verdict).toBe("stop");
    expect(verdict.capsuleStopReasons).toEqual(["capsule-integrity-failed"]);
  });

  test("preserves an honest adjust when capsule integrity passes but timing does not", () => {
    const verdict = evaluateAttemptTwo({
      runs: runs(),
      bundle: bundle("10", "20"),
      setupDurationNs: "5",
    });
    expect(verdict.verdict).toBe("adjust");
    expect(verdict.adjustReasons).toContain("vem-median-slower");
    expect(verdict.capsuleStopReasons).toEqual([]);
  });

  test("stops when the immutable attempt chain changes", () => {
    const verdict = evaluateAttemptTwo({
      runs: runs({ attemptChainValid: false }),
      bundle: bundle(),
      setupDurationNs: "5",
    });
    expect(verdict.verdict).toBe("stop");
    expect(verdict.capsuleStopReasons).toEqual(["attempt-chain-changed"]);
  });
});
