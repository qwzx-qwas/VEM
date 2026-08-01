import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildR6T13AbortedVerdict,
  verifyR6T13AbortManifest,
} from "./r6-t13-abort-sealer.mjs";

const instrumentationHash = "a".repeat(64);
const resultRoot = join(
  process.cwd(),
  "docs/test-evidence/R6-T13/20260801T141247-0800",
);

describe("R6-T13 abort evidence sealer", () => {
  test("records aggregate runner failure as stop without inventing attribution", () => {
    const verdict = buildR6T13AbortedVerdict({
      arm: {
        taskId: "task-1",
        arm: "direct-search",
        success: false,
        retryExhausted: false,
        totalArmDurationNs: "100",
        instrumentationHash,
        groundTruthVisible: false,
        holdoutConsumed: false,
        priorTaskOrPromptReused: false,
        attemptBudgetDrift: false,
        wrongAttribution: false,
      },
      processAttempt: {
        classification: "external-transport-timeout-before-response",
        retried: true,
        retryProcessStarted: false,
        evidenceSealed: true,
        evidenceRetained: true,
        processTreeTerminated: true,
        terminalContradiction: false,
        wrongAttribution: false,
      },
      totalSetupDurationNs: "10",
      expectedInstrumentationHash: instrumentationHash,
    });
    expect(verdict).toMatchObject({
      schemaVersion: "R6-T13-verdict-v1",
      decisionAttempt: 4,
      supersedesAttempt: "R6-T10",
      verdict: "stop",
      stopReasons: ["aggregate-integrity-failed"],
      adjustReasons: ["fewer-than-ten-arms-complete-after-bounded-attempts"],
      metrics: {
        successfulArmCount: 0,
        processAttemptCount: 1,
        aggregateIntegrityPassed: false,
      },
    });
    expect(verdict.stopReasons).not.toContain("wrong-attribution");
    expect(verdict.stopReasons).not.toContain(
      "unselected-or-incompletely-proven-failure-retried",
    );
  });

  test("rejects a manufactured non-stop abort verdict", () => {
    expect(() => buildR6T13AbortedVerdict({
      arm: {
        taskId: "task-1",
        arm: "direct-search",
        success: false,
        retryExhausted: false,
        totalArmDurationNs: "100",
        instrumentationHash,
        groundTruthVisible: false,
        holdoutConsumed: false,
        priorTaskOrPromptReused: false,
        attemptBudgetDrift: false,
        wrongAttribution: false,
      },
      processAttempt: {
        classification: "external-transport-timeout-before-response",
        retried: true,
        evidenceSealed: true,
        evidenceRetained: true,
        processTreeTerminated: true,
        terminalContradiction: false,
      },
      totalSetupDurationNs: "10",
      expectedInstrumentationHash: "not-a-hash",
    })).toThrow("R6_RECOVERY_EVALUATION_INPUT_INVALID");
  });

  test("binds the single sealed process and fail-closed attempt-four verdict", () => {
    const readJson = (path) => JSON.parse(readFileSync(
      join(resultRoot, path),
      "utf8",
    ));
    expect(verifyR6T13AbortManifest(resultRoot)).toBe(true);
    expect(readJson("results/verdict.json")).toMatchObject({
      decisionAttempt: 4,
      supersedesAttempt: "R6-T10",
      verdict: "stop",
      stopReasons: ["aggregate-integrity-failed"],
      metrics: {
        processAttemptCount: 1,
        successfulArmCount: 0,
        aggregateIntegrityPassed: false,
      },
    });
    expect(readJson("results/run-index.json")).toMatchObject({
      authorizationHash:
        "aa6d64d442416c0a3357e31bd350ef69c6fd748e269faa7b6ea0cf404e520967",
      processAttemptCount: 1,
      successfulArmCount: 0,
      runIds: [
        "r6-network-terminal-01-policy-heading-direct-search-attempt-1",
      ],
      verdictHash:
        "f83caa14aa56b9c416bef538c8d3b38e8202cd2d40e50e457e116982f4da96b7",
    });
    expect(readJson("results/batch-stopped.json")).toMatchObject({
      failureCode: "R6_T13_RETRY_CAPSULE_OUTPUT_REUSED",
      externalProcessAttemptCount: 1,
      remainingProcessAttemptBudget: 19,
      retryAuthorized: true,
      retryProcessStarted: false,
      externalRerunPerformed: false,
    });
    expect(readJson("results/attempt-classification.json")).toMatchObject({
      classification: {
        kind: "external-transport-timeout-before-response",
        retryable: true,
      },
      evidenceSealed: true,
      processTreeTerminated: true,
    });
  });
});
