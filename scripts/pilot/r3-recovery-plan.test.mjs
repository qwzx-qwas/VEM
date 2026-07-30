import { describe, expect, test } from "vitest";
import {
  buildR3Prompt,
  evaluateR3Recovery,
  R3_FIXTURE_FILES,
  R3_MODEL,
  R3_RESPONSE_SCHEMA,
  R3_TASKS,
  R3_VERDICT_RULE,
  validateR3ResponseText,
} from "./r3-recovery-plan.mjs";

const INSTRUMENTATION_HASH = "a".repeat(64);

describe("R3 recovery-only task and response plan", () => {
  test("defines five fresh R3 audit tasks with AB/BA counterbalancing", () => {
    expect(R3_MODEL).toBe("gpt-5.6-sol");
    expect(R3_TASKS).toHaveLength(5);
    expect(new Set(R3_TASKS.map((task) => task.taskId)).size).toBe(5);
    expect(R3_TASKS.every((task) => task.taskId.startsWith("r3-audit-"))).toBe(true);
    expect(R3_TASKS.map((task) => task.armOrder)).toEqual([
      ["direct-search", "vem-assisted"],
      ["vem-assisted", "direct-search"],
      ["direct-search", "vem-assisted"],
      ["vem-assisted", "direct-search"],
      ["direct-search", "vem-assisted"],
    ]);
    const fixture = R3_FIXTURE_FILES["packages/demo-fixture/src/App.tsx"];
    for (const task of R3_TASKS) {
      expect(fixture.split(task.marker)).toHaveLength(2);
    }
    expect(fixture).not.toContain("data-r2-task");
    expect(R3_FIXTURE_FILES["packages/demo-fixture/src/fixtures.ts"])
      .toContain("R3_EXCEPTION_EVIDENCE_SEALED");
  });

  test("keeps the response schema and prompt closed and containment-only", () => {
    expect(R3_RESPONSE_SCHEMA).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["relativeFile", "line", "sourceAnchorId"],
    });
    const valid = {
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 12,
      sourceAnchorId: "vem1_1fca6dac19137a546084bc64ae003bc0",
    };
    expect(validateR3ResponseText(JSON.stringify(valid))).toEqual(valid);
    expect(validateR3ResponseText(JSON.stringify({ ...valid, extra: true })))
      .toBeNull();
    expect(validateR3ResponseText(JSON.stringify({
      ...valid,
      relativeFile: "../outside.tsx",
    }))).toBeNull();
    expect(validateR3ResponseText("not-json")).toBeNull();
    expect(buildR3Prompt("the containment heading")).toContain(
      "read-only files in this containment capsule",
    );
  });

  test("binds attempt one without superseding any prior stop", () => {
    expect(R3_VERDICT_RULE).toMatchObject({
      decisionKey: "R3-RECOVERY",
      decisionAttempt: 1,
      doesNotSupersede: "R2-RECOVERY",
      alsoDoesNotSupersede: ["R1-RECOVERY", "R0-RECOVERY", "P0-VALUE"],
      adjustWhenAny: [
        "external-run-did-not-produce-ten-fresh-complete-processes",
      ],
    });
    expect(R3_VERDICT_RULE.continueWhenAll).toEqual(expect.arrayContaining([
      "all-ten-v3-capsule-audits-pass",
      "all-ten-permission-profile-probes-bindings-and-auth-boundaries-pass",
      "all-ten-exception-and-failure-evidence-records-sealed-before-return",
    ]));
  });
});

describe("R3 recovery verdict", () => {
  test("continues only when correctness, containment, sealing and cost all pass", () => {
    const verdict = evaluateR3Recovery({
      runs: successfulRuns(),
      totalSetupDurationNs: "100",
      expectedInstrumentationHash: INSTRUMENTATION_HASH,
      aggregateIntegrityPassed: true,
    });
    expect(verdict).toMatchObject({
      decisionKey: "R3-RECOVERY",
      decisionAttempt: 1,
      verdict: "continue",
      stopReasons: [],
      adjustReasons: [],
      metrics: {
        runCount: 10,
        uniqueThreadCount: 10,
        exactResponseCount: 10,
        directPrimaryMatchCount: 5,
        capsuleIntegrityPassCount: 10,
        v3AuditPassCount: 10,
        permissionProfilePassCount: 10,
        protocolFailureCount: 0,
        wrongAttributionCount: 0,
        evaluationIntegrityPassCount: 10,
        recorderEvidenceValidCount: 10,
        failureEvidenceSealedBeforeReturnCount: 10,
        exceptionEvidenceSealedBeforeReturnCount: 10,
        evidenceHashesValidCount: 10,
        aggregateIntegrityPassed: true,
        fasterPairCount: 5,
      },
    });
    expect(verdict.limitations).toEqual(expect.arrayContaining([
      "NO_P0_R0_R1_R2_OR_PRODUCT_UNLOCK",
      "NO_SUPERSESSION_OF_PRIOR_TERMINAL_STOPS",
    ]));
  });

  test("adjusts only for an incomplete ten-run batch", () => {
    const verdict = evaluateR3Recovery({
      runs: successfulRuns().slice(0, 9),
      totalSetupDurationNs: "100",
      expectedInstrumentationHash: INSTRUMENTATION_HASH,
      aggregateIntegrityPassed: true,
    });
    expect(verdict).toMatchObject({
      verdict: "adjust",
      stopReasons: [],
      adjustReasons: [
        "external-run-did-not-produce-ten-fresh-complete-processes",
      ],
    });
  });

  test("stops independently on drift, capsule, audit, auth, protocol or evidence failure", () => {
    const runs = successfulRuns();
    Object.assign(runs[0], {
      preregistrationHashChanged: true,
      capsuleIntegrityPassed: false,
      capsuleAudit: "failed",
      permissionProfileBindingPassed: false,
      authBoundaryPassed: false,
      protocolFailure: true,
      recorderEvidenceValid: false,
      evidenceSealed: false,
      evidenceHashesValid: false,
      failureEvidenceSealedBeforeReturn: false,
      exceptionEvidenceSealedBeforeReturn: false,
    });
    const verdict = evaluateR3Recovery({
      runs,
      totalSetupDurationNs: "100",
      expectedInstrumentationHash: INSTRUMENTATION_HASH,
      aggregateIntegrityPassed: true,
    });
    expect(verdict.verdict).toBe("stop");
    expect(verdict.stopReasons).toEqual(expect.arrayContaining([
      "r3-preregistered-input-or-instrumentation-hash-changed",
      "capsule-integrity-failed",
      "v3-audit-integrity-failed",
      "permission-profile-or-auth-boundary-failed",
      "protocol-response-integrity-failed",
      "exception-or-failure-evidence-not-sealed-before-return",
    ]));
  });

  test("stops on actual attribution failure and cost regression", () => {
    const runs = successfulRuns();
    Object.assign(runs[0], {
      attribution: "wrong",
      wrongAttribution: true,
      responseMatchesGroundTruth: false,
    });
    for (const run of runs) {
      run.receiptDurationNs = run.arm === "vem-assisted" ? "300" : "100";
    }
    const verdict = evaluateR3Recovery({
      runs,
      totalSetupDurationNs: "100",
      expectedInstrumentationHash: INSTRUMENTATION_HASH,
      aggregateIntegrityPassed: true,
    });
    expect(verdict.verdict).toBe("stop");
    expect(verdict.stopReasons).toEqual(expect.arrayContaining([
      "response-or-direct-primary-wrong-attribution",
      "vem-faster-on-fewer-than-three-of-five-pairs",
      "vem-median-duration-greater-than-direct-median-duration",
      "median-saving-does-not-cover-amortized-setup",
    ]));
    expect(verdict.metrics.wrongAttributionCount).toBe(1);
  });

  test("uses the median of paired savings rather than subtracting arm medians", () => {
    const runs = successfulRuns();
    const direct = ["100", "101", "1000", "1001", "1002"];
    const vem = ["99", "1000", "999", "1000", "1001"];
    for (let index = 0; index < 5; index += 1) {
      runs.find((run) => (
        run.taskId === R3_TASKS[index].taskId
          && run.arm === "direct-search"
      )).receiptDurationNs = direct[index];
      runs.find((run) => (
        run.taskId === R3_TASKS[index].taskId
          && run.arm === "vem-assisted"
      )).receiptDurationNs = vem[index];
    }
    const verdict = evaluateR3Recovery({
      runs,
      totalSetupDurationNs: "0",
      expectedInstrumentationHash: INSTRUMENTATION_HASH,
      aggregateIntegrityPassed: true,
    });
    expect(verdict.verdict).toBe("continue");
    expect(verdict.metrics).toMatchObject({
      directMedianNs: "1000",
      vemMedianNs: "1000",
      medianPerTaskSavingNs: "1",
      fasterPairCount: 4,
    });
  });

  test("does not manufacture wrong attribution when no response was selected", () => {
    const runs = successfulRuns();
    Object.assign(runs[0], {
      protocolFailure: true,
      successfulResponseComplete: false,
      attribution: null,
      wrongAttribution: false,
      responseMatchesGroundTruth: null,
      vemDirectPrimaryMatch: null,
    });
    const verdict = evaluateR3Recovery({
      runs,
      totalSetupDurationNs: "100",
      expectedInstrumentationHash: INSTRUMENTATION_HASH,
      aggregateIntegrityPassed: true,
    });
    expect(verdict.verdict).toBe("stop");
    expect(verdict.stopReasons).toContain("protocol-response-integrity-failed");
    expect(verdict.stopReasons)
      .not.toContain("response-or-direct-primary-wrong-attribution");
    expect(verdict.metrics.wrongAttributionCount).toBe(0);
  });

  test("stops evaluator and aggregate exceptions without manufacturing attribution", () => {
    const runs = successfulRuns();
    Object.assign(runs[0], {
      evaluationIntegrityPassed: false,
      attribution: null,
      wrongAttribution: false,
      responseMatchesGroundTruth: null,
    });
    const verdict = evaluateR3Recovery({
      runs,
      totalSetupDurationNs: "100",
      expectedInstrumentationHash: INSTRUMENTATION_HASH,
      aggregateIntegrityPassed: false,
    });
    expect(verdict.verdict).toBe("stop");
    expect(verdict.stopReasons).toEqual(expect.arrayContaining([
      "ground-truth-or-evaluator-integrity-failed",
      "aggregate-integrity-failed",
    ]));
    expect(verdict.stopReasons)
      .not.toContain("response-or-direct-primary-wrong-attribution");
    expect(verdict.metrics.wrongAttributionCount).toBe(0);
  });

  test("rejects malformed evaluation inputs", () => {
    expect(() => evaluateR3Recovery({
      runs: [null],
      totalSetupDurationNs: "100",
      expectedInstrumentationHash: INSTRUMENTATION_HASH,
      aggregateIntegrityPassed: true,
    })).toThrowError("R3_RECOVERY_EVALUATION_INPUT_INVALID");
  });
});

function successfulRuns() {
  return R3_TASKS.flatMap((task, taskIndex) => (
    task.armOrder.map((arm, armIndex) => ({
      runId: `${task.taskId}-${armIndex + 1}-${arm}`,
      taskId: task.taskId,
      arm,
      outcome: "success",
      exitCode: 0,
      threadId: `r3-thread-${taskIndex}-${armIndex}`,
      receiptDurationNs: arm === "vem-assisted"
        ? String(100 + taskIndex)
        : String(300 + taskIndex),
      instrumentationHash: INSTRUMENTATION_HASH,
      preregistrationHashChanged: false,
      groundTruthVisible: false,
      holdoutConsumed: false,
      priorTaskOrPromptReused: false,
      capsuleIntegrityPassed: true,
      capsuleAudit: "passed",
      permissionProfileProbePassed: true,
      permissionProfileBindingPassed: true,
      authBoundaryPassed: true,
      protocolFailure: false,
      successfulResponseComplete: true,
      evaluationIntegrityPassed: true,
      recorderEvidenceValid: true,
      evidenceSealed: true,
      evidenceHashesValid: true,
      failureEvidenceSealedBeforeReturn: true,
      exceptionEvidenceSealedBeforeReturn: true,
      attribution: "correct",
      wrongAttribution: false,
      responseMatchesGroundTruth: true,
      vemDirectPrimaryMatch: arm === "vem-assisted" ? true : null,
    }))
  ));
}
