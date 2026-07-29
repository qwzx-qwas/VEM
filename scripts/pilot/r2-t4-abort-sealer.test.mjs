import { describe, expect, test } from "vitest";
import {
  buildR2AbortedVerdict,
  diagnoseR2CapsuleAudit,
} from "./r2-t4-abort-sealer.mjs";

const instrumentationHash = "a".repeat(64);

describe("R2-T4 abort evidence sealer", () => {
  test("reproduces and diagnoses the frozen AGENTS marker escape", () => {
    const jsonl = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "/usr/bin/rg --files -g 'AGENTS.md'",
          aggregated_output: "",
        },
      }),
    ].join("\n");
    expect(diagnoseR2CapsuleAudit({ jsonl })).toMatchObject({
      valid: false,
      failureCode: "CAPSULE_AUDIT_V2_ESCAPE",
      forbiddenMarkers: ["AGENTS.md"],
      commandEventLines: [2],
    });
  });

  test("records stop plus incomplete-batch adjust without changing attribution", () => {
    const runs = Array.from({ length: 9 }, (_, index) => ({
      runId: `run-${index + 1}`,
      taskId: `task-${Math.floor(index / 2) + 1}`,
      arm: index % 2 === 0 ? "direct-search" : "vem-assisted",
      outcome: index === 8 ? "failed" : "success",
      exitCode: 0,
      threadId: `thread-${index + 1}`,
      receiptDurationNs: String(20 + index),
      responseMatchesGroundTruth: true,
      vemDirectPrimaryMatch: index % 2 === 0 ? null : true,
      capsuleAudit: index === 8 ? "failed" : "passed",
      instrumentationHash,
      preregistrationHashChanged: false,
      groundTruthVisible: false,
      holdoutConsumed: false,
      priorTaskOrPromptReused: false,
      protocolFailure: false,
      wrongAttribution: false,
      evidenceSealed: index !== 8,
      successfulResponseComplete: true,
    }));
    const verdict = buildR2AbortedVerdict({
      runs,
      prepareSetupDurationNs: "100",
      expectedInstrumentationHash: instrumentationHash,
    });
    expect(verdict.verdict).toBe("stop");
    expect(verdict.stopReasons).toEqual([
      "capsule-integrity-failed",
      "failure-evidence-not-sealed-before-return",
    ]);
    expect(verdict.adjustReasons).toEqual([
      "external-run-did-not-produce-ten-fresh-complete-processes",
    ]);
    expect(verdict.metrics.wrongAttributionCount).toBe(0);
    expect(verdict.setupCostMeasurement.status).toBe("lower-bound-only");
  });
});
