import { describe, expect, test } from "vitest";
import {
  buildR4Prompt,
  evaluateR4Recovery,
  R4_FIXTURE_FILES,
  R4_RETRY_POLICY,
  R4_TASKS,
  validateR4ResponseText,
} from "./r4-recovery-plan.mjs";

const HASH = "a".repeat(64);

describe("R4 recovery-only task and retry plan", () => {
  test("defines five fresh counterbalanced tasks and a bounded attempt policy", () => {
    expect(R4_TASKS).toHaveLength(5);
    expect(new Set(R4_TASKS.map((task) => task.taskId)).size).toBe(5);
    expect(R4_TASKS.map((task) => task.armOrder)).toEqual([
      ["direct-search", "vem-assisted"],
      ["vem-assisted", "direct-search"],
      ["direct-search", "vem-assisted"],
      ["vem-assisted", "direct-search"],
      ["direct-search", "vem-assisted"],
    ]);
    expect(R4_RETRY_POLICY).toMatchObject({
      maxRetriesPerArm: 1,
      maxProcessAttempts: 20,
      requiredSuccessfulArms: 10,
      everyAttemptConsumesBudget: true,
      everyAttemptEvidenceRetained: true,
    });
    expect(Object.keys(R4_FIXTURE_FILES)).toHaveLength(2);
  });

  test("uses null direct anchors and validates the frozen response shape", () => {
    expect(buildR4Prompt("target")).toContain("null sourceAnchorId");
    expect(validateR4ResponseText(JSON.stringify({
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 7,
      sourceAnchorId: null,
    }))).toEqual({
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 7,
      sourceAnchorId: null,
    });
    expect(validateR4ResponseText("{}")).toBeNull();
  });
});

describe("R4 recovery verdict", () => {
  test("continues only after ten successful arms within the attempt budget", () => {
    const arms = successfulArms();
    expect(evaluateR4Recovery({
      arms,
      processAttempts: attempts(10),
      totalSetupDurationNs: "5",
      expectedInstrumentationHash: HASH,
      aggregateIntegrityPassed: true,
    })).toMatchObject({
      verdict: "continue",
      stopReasons: [],
      adjustReasons: [],
      metrics: { successfulArmCount: 10, processAttemptCount: 10 },
    });
  });

  test("counts retry time in pair cost and adjusts when the threshold fails", () => {
    const arms = successfulArms();
    for (const index of [1, 3, 5]) {
      arms[index] = { ...arms[index], totalArmDurationNs: "1000" };
    }
    expect(evaluateR4Recovery({
      arms,
      processAttempts: attempts(11),
      totalSetupDurationNs: "5",
      expectedInstrumentationHash: HASH,
      aggregateIntegrityPassed: true,
    })).toMatchObject({
      verdict: "adjust",
      adjustReasons: ["cost-or-speed-threshold-not-met"],
    });
  });

  test("stops if a non-timeout failure was retried or evidence was lost", () => {
    const processAttempts = attempts(10);
    processAttempts[0] = {
      ...processAttempts[0],
      classification: "authentication-or-rate-limit-failure",
      retried: true,
    };
    processAttempts[1] = {
      ...processAttempts[1],
      evidenceRetained: false,
    };
    expect(evaluateR4Recovery({
      arms: successfulArms(),
      processAttempts,
      totalSetupDurationNs: "5",
      expectedInstrumentationHash: HASH,
      aggregateIntegrityPassed: true,
    })).toMatchObject({
      verdict: "stop",
      stopReasons: [
        "non-timeout-failure-retried",
        "attempt-evidence-overwritten-or-unsealed",
      ],
    });
  });

  test("records bounded timeout exhaustion as adjust without hiding attempts", () => {
    const arms = successfulArms().slice(0, 9);
    arms[0] = { ...arms[0], retryExhausted: true };
    expect(evaluateR4Recovery({
      arms,
      processAttempts: attempts(11),
      totalSetupDurationNs: "5",
      expectedInstrumentationHash: HASH,
      aggregateIntegrityPassed: true,
    })).toMatchObject({
      verdict: "adjust",
      adjustReasons: [
        "fewer-than-ten-arms-complete-after-bounded-attempts",
        "retry-exhausted-after-second-sealed-timeout",
      ],
    });
  });
});

function successfulArms() {
  return Array.from({ length: 5 }, (_, index) => {
    const taskId = `task-${index + 1}`;
    return [
      {
        taskId,
        arm: "direct-search",
        success: true,
        totalArmDurationNs: String(100 + index),
        instrumentationHash: HASH,
      },
      {
        taskId,
        arm: "vem-assisted",
        success: true,
        totalArmDurationNs: String(10 + index),
        instrumentationHash: HASH,
      },
    ];
  }).flat();
}

function attempts(count) {
  return Array.from({ length: count }, () => ({
    classification: "success",
    retried: false,
    evidenceSealed: true,
    evidenceRetained: true,
  }));
}
