import { describe, expect, test } from "vitest";
import {
  buildR6Prompt,
  evaluateR6Recovery,
  R6_FIXTURE_FILES,
  R6_TASKS,
  R6_TERMINATION_POLICY,
  validateR6ResponseText,
} from "./r6-recovery-plan.mjs";
import {
  classifyR6Attempt,
  planR6Retry,
  sealR6AttemptEvidence,
} from "./r6-attempt-policy.mjs";

describe("R6 recovery-only task and termination plan", () => {
  test("defines five fresh counterbalanced tasks and frozen process bounds", () => {
    expect(R6_TASKS).toHaveLength(5);
    expect(new Set(R6_TASKS.map((task) => task.taskId)).size).toBe(5);
    expect(R6_TASKS.map((task) => task.armOrder)).toEqual([
      ["direct-search", "vem-assisted"],
      ["vem-assisted", "direct-search"],
      ["direct-search", "vem-assisted"],
      ["vem-assisted", "direct-search"],
      ["direct-search", "vem-assisted"],
    ]);
    expect(R6_TERMINATION_POLICY).toMatchObject({
      deadlineMs: 120_000,
      graceMs: 5_000,
      forceKillWaitMs: 5_000,
      gracefulSignal: "SIGTERM",
      forceSignal: "SIGKILL",
      maxRetriesPerArm: 1,
      maxProcessAttempts: 20,
      requiredSuccessfulArms: 10,
      runnerTerminationRetryable: false,
    });
    expect(Object.keys(R6_FIXTURE_FILES)).toHaveLength(2);
  });

  test("uses null direct anchors and validates the frozen response shape", () => {
    expect(buildR6Prompt("target")).toContain("null sourceAnchorId");
    expect(validateR6ResponseText(JSON.stringify({
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 7,
      sourceAnchorId: null,
    }))).toEqual({
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 7,
      sourceAnchorId: null,
    });
    expect(validateR6ResponseText("{}")).toBeNull();
  });
});

describe("R6 recovery verdict", () => {
  test("continues only after ten terminally sound arms meet cost thresholds", () => {
    expect(evaluateR6Recovery({
      arms: successfulArms(),
      processAttempts: attempts(10),
      totalSetupDurationNs: "5",
      expectedInstrumentationHash: "a".repeat(64),
      aggregateIntegrityPassed: true,
    })).toMatchObject({
      verdict: "continue",
      stopReasons: [],
      adjustReasons: [],
      metrics: {
        successfulArmCount: 10,
        processAttemptCount: 10,
      },
    });
  });

  test("stops on a retried runner deadline or process-tree contradiction", () => {
    const processAttempts = attempts(10);
    processAttempts[0] = {
      ...processAttempts[0],
      classification: "runner-wall-clock-terminated-before-response",
      retried: true,
    };
    processAttempts[1] = {
      ...processAttempts[1],
      processTreeTerminated: false,
      terminalContradiction: true,
    };
    expect(evaluateR6Recovery({
      arms: successfulArms(),
      processAttempts,
      totalSetupDurationNs: "5",
      expectedInstrumentationHash: "a".repeat(64),
      aggregateIntegrityPassed: true,
    })).toMatchObject({
      verdict: "stop",
      stopReasons: expect.arrayContaining([
        "runner-wall-clock-termination-retried",
        "non-provider-timeout-failure-retried",
        "process-tree-or-terminal-integrity-failed",
      ]),
      adjustReasons: expect.arrayContaining([
        "runner-wall-clock-terminated-before-response",
      ]),
    });
  });
});

describe("R6 termination-aware attempt classification", () => {
  test("separates provider timeout, runner deadline and integrity failure", () => {
    expect(classifyR6Attempt(attempt({
      providerTurnFailedObserved: true,
      events: [{
        type: "turn.failed",
        error: { message: "request timed out" },
      }],
      deadlineExpired: false,
      trigger: "process-exit",
    }))).toMatchObject({
      kind: "external-transport-timeout-before-response",
      retryable: true,
    });
    expect(classifyR6Attempt(attempt({
      providerTurnFailedObserved: false,
      events: [{ type: "thread.started" }],
      deadlineExpired: true,
      trigger: "wall-clock-deadline",
    }))).toMatchObject({
      kind: "runner-wall-clock-terminated-before-response",
      retryable: false,
    });
    expect(classifyR6Attempt(attempt({
      processTreeTerminated: false,
      failureCodes: ["R5_PROCESS_GROUP_NOT_EMPTY"],
    }))).toMatchObject({
      kind: "integrity-failure",
      retryable: false,
    });
  });

  test("retries only one sealed provider timeout within the process budget", () => {
    const classification = classifyR6Attempt(attempt({
      providerTurnFailedObserved: true,
      events: [{
        type: "turn.failed",
        error: { message: "transport timeout" },
      }],
    }));
    const sealed = sealR6AttemptEvidence({
      runId: "r6-attempt-1",
      armKey: "r6-task:direct-search",
      attemptNumber: 1,
      classification,
      evidenceHashes: { "run.json": "a".repeat(64) },
    });
    expect(planR6Retry({
      armKey: "r6-task:direct-search",
      attempts: [sealed],
      batchProcessAttemptCount: 1,
    })).toMatchObject({
      action: "retry",
      nextAttemptNumber: 2,
    });
    const runnerTerminated = sealR6AttemptEvidence({
      runId: "r6-runner-terminal",
      armKey: "r6-task:vem-assisted",
      attemptNumber: 1,
      classification: classifyR6Attempt(attempt({
        deadlineExpired: true,
        trigger: "wall-clock-deadline",
      })),
      evidenceHashes: { "run.json": "b".repeat(64) },
    });
    expect(planR6Retry({
      armKey: "r6-task:vem-assisted",
      attempts: [runnerTerminated],
      batchProcessAttemptCount: 2,
    })).toMatchObject({
      action: "stop",
      reason: "non-retryable-failure",
    });
  });
});

function attempt(overrides = {}) {
  return {
    run: {
      outcome: "failed",
      failureCodes: ["R5_FINAL_RESPONSE_MISSING"],
      evidenceSealedBeforeReturn: true,
      providerTerminalInvented: false,
    },
    termination: {
      trigger: "process-exit",
      deadlineExpired: false,
      processGroupEmptyAfterTermination: true,
      providerTurnFailedObserved: false,
      providerTerminalInvented: false,
    },
    finalResponse: { status: "missing" },
    boundary: {
      permission: { status: "passed", permissionProfilePassed: true },
      audit: { status: "passed", valid: true },
      evaluator: { status: "passed", valid: true },
    },
    events: [],
    evidenceSealed: true,
    ...normalizeOverrides(overrides),
  };
}

function successfulArms() {
  return Array.from({ length: 5 }, (_, index) => {
    const taskId = `task-${index + 1}`;
    return [
      {
        taskId,
        arm: "direct-search",
        success: true,
        totalArmDurationNs: String(100 + index),
        instrumentationHash: "a".repeat(64),
      },
      {
        taskId,
        arm: "vem-assisted",
        success: true,
        totalArmDurationNs: String(10 + index),
        instrumentationHash: "a".repeat(64),
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
    processTreeTerminated: true,
    terminalContradiction: false,
  }));
}

function normalizeOverrides(overrides) {
  const result = { ...overrides };
  if ("failureCodes" in result) {
    result.run = {
      outcome: "failed",
      evidenceSealedBeforeReturn: true,
      providerTerminalInvented: false,
      failureCodes: result.failureCodes,
    };
    delete result.failureCodes;
  }
  if ("deadlineExpired" in result
    || "trigger" in result
    || "processTreeTerminated" in result
    || "providerTurnFailedObserved" in result) {
    result.termination = {
      trigger: result.trigger ?? "process-exit",
      deadlineExpired: result.deadlineExpired ?? false,
      processGroupEmptyAfterTermination:
        result.processTreeTerminated ?? true,
      providerTurnFailedObserved:
        result.providerTurnFailedObserved ?? false,
      providerTerminalInvented: false,
    };
    delete result.deadlineExpired;
    delete result.trigger;
    delete result.processTreeTerminated;
    delete result.providerTurnFailedObserved;
  }
  return result;
}
