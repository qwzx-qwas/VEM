import { describe, expect, test } from "vitest";
import {
  evaluatePilot,
  isPreregistrationExcludedPath,
  responseToLocatedSource,
} from "./p0-t17b.mjs";

const anchor = "vem1_0123456789abcdef0123456789abcdef";

function bundle(directNs = "20", vemNs = "10", directMatch = true) {
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
            directPrimaryMatch: directMatch,
            wrongAttribution: !directMatch,
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
    ...overrides,
  }));
}

describe("P0-T17B pilot scoring", () => {
  test("keeps result artifacts outside the immutable preregistration digest", () => {
    expect(isPreregistrationExcludedPath("PREREGISTRATION.sha256")).toBe(true);
    expect(isPreregistrationExcludedPath("RESULTS.sha256")).toBe(true);
    expect(isPreregistrationExcludedPath("results/verdict.json")).toBe(true);
    expect(isPreregistrationExcludedPath("inputs/task-manifest.json")).toBe(false);
  });

  test("maps only an exact file/line/optional-anchor response", () => {
    const records = [{ sourceAnchorId: anchor, relativeFile: "src/App.tsx", line: 9 }];
    expect(responseToLocatedSource(
      { sourceAnchorId: null, relativeFile: "src/App.tsx", line: 9 },
      records,
    )).toEqual({ sourceAnchorId: anchor, relativeFile: "src/App.tsx" });
    expect(responseToLocatedSource(
      { sourceAnchorId: "vem1_ffffffffffffffffffffffffffffffff", relativeFile: "src/App.tsx", line: 9 },
      records,
    )).toBeNull();
    expect(responseToLocatedSource(
      { sourceAnchorId: null, relativeFile: "src/App.tsx", line: 10 },
      records,
    )).toBeNull();
  });

  test("continues only when integrity, correctness, timing and amortized setup all pass", () => {
    const verdict = evaluatePilot({ runs: runs(), bundle: bundle(), setupDurationNs: "5" });
    expect(verdict.verdict).toBe("continue");
    expect(verdict.metrics).toMatchObject({
      runCount: 10,
      uniqueThreadCount: 10,
      exactResponseCount: 10,
      fasterPairCount: 5,
    });
  });

  test("adjusts for no observable timing benefit", () => {
    const verdict = evaluatePilot({ runs: runs(), bundle: bundle("10", "20"), setupDurationNs: "5" });
    expect(verdict.verdict).toBe("adjust");
    expect(verdict.adjustReasons).toContain("vem-median-slower");
  });

  test("stops for a wrong VEM direct-primary attribution", () => {
    const verdict = evaluatePilot({
      runs: runs(),
      bundle: bundle("20", "10", false),
      setupDurationNs: "5",
    });
    expect(verdict.verdict).toBe("stop");
    expect(verdict.stopReasons).toEqual(["vem-direct-primary-wrong-attribution"]);
  });
});
