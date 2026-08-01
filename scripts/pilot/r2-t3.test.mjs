import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { evaluateR2Recovery, R2_TASKS } from "./r2-recovery-plan.mjs";
import { prepareR2RecoveryPreregistration } from "./r2-t3.mjs";
import {
  verifyR2OwnerAuthorization,
  verifyR2Preregistration,
} from "./r2-t4.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("R2-T3 final-output recovery preregistration", () => {
  test("freezes fresh tasks, final-file authority and no external authorization", () => {
    const root = temporaryRoot();
    const output = join(root, "preregistration");
    const result = prepareR2RecoveryPreregistration({
      outputRoot: output,
      runProbes: false,
      enforceEvidenceParent: false,
    });
    const plan = json(join(output, "PREREGISTRATION.json"));
    const contract = json(join(output, "inputs/runner-contract.json"));
    expect(result).toMatchObject({
      taskId: "R2-T3",
      externalExecutionAuthorized: false,
      plannedExternalRunCount: 10,
    });
    expect(plan).toMatchObject({
      decisionKey: "R2-RECOVERY",
      decisionAttempt: 1,
      externalExecutionAuthorized: false,
      productUnlockCount: 0,
    });
    expect(plan.preregistrationHash).toBeUndefined();
    expect(contract).toMatchObject({
      responseAuthority: "codex-output-last-message-runner-owned-file",
      jsonlRole: "audit-events-not-final-response-candidates",
      participantWorkspaceWritable: false,
      writableCapsulePaths: ["/run/vem/final-response.json"],
    });
    const manifest = json(join(output, "inputs/task-manifest.json"));
    expect(manifest.tasks).toHaveLength(5);
    expect(new Set(manifest.tasks.map((task) => task.taskId)).size).toBe(5);
    expect(manifest.tasks.map((task) => task.taskId)).toEqual(
      R2_TASKS.map((task) => task.taskId),
    );
    expect(verifyR2Preregistration(output)).toBe(result.preregistrationHash);
  });

  test("requires separate owner authorization bound to the exact frozen hash", () => {
    const hash = "a".repeat(64);
    expect(verifyR2OwnerAuthorization({
      preregistrationHash: hash,
      authorization: {
        schemaVersion: "R2-T4-owner-authorization-v1",
        taskId: "R2-T4",
        authorized: true,
        preregistrationHash: hash,
        statement: "Owner authorizes the exact frozen R2 batch.",
        authorizedAt: "2026-07-29T23:00:00+08:00",
      },
    }).valid).toBe(true);
    expect(() => verifyR2OwnerAuthorization({
      preregistrationHash: hash,
      authorization: {
        schemaVersion: "R2-T4-owner-authorization-v1",
        taskId: "R2-T4",
        authorized: true,
        preregistrationHash: "b".repeat(64),
        statement: "Wrong hash.",
        authorizedAt: "2026-07-29T23:00:00+08:00",
      },
    })).toThrowError("R2_T4_OWNER_AUTHORIZATION_INVALID");
  });

  test("detects any post-freeze preregistration mutation", () => {
    const root = temporaryRoot();
    const output = join(root, "preregistration");
    prepareR2RecoveryPreregistration({
      outputRoot: output,
      runProbes: false,
      enforceEvidenceParent: false,
    });
    writeFileSync(
      join(output, "participant/tasks/r2-final-01-authority-heading/prompt.txt"),
      "mutated after freeze\n",
    );
    expect(() => verifyR2Preregistration(output))
      .toThrowError("R2_T4_PREREGISTRATION_CHANGED");
  });

  test("classifies a protocol failure without manufacturing wrong attribution", () => {
    const verdict = evaluateR2Recovery({
      runs: [{
        runId: "r2-final-01-authority-heading-1-direct-search",
        taskId: "r2-final-01-authority-heading",
        arm: "direct-search",
        outcome: "failed",
        exitCode: 0,
        threadId: "thread-1",
        instrumentationHash: "c".repeat(64),
        protocolFailure: true,
        wrongAttribution: false,
        evidenceSealed: true,
        successfulResponseComplete: false,
        capsuleAudit: "passed",
        preregistrationHashChanged: false,
        groundTruthVisible: false,
        holdoutConsumed: false,
        priorTaskOrPromptReused: false,
      }],
      totalSetupDurationNs: "0",
      expectedInstrumentationHash: "c".repeat(64),
    });
    expect(verdict.verdict).toBe("stop");
    expect(verdict.stopReasons).toContain("protocol-response-integrity-failed");
    expect(verdict.stopReasons).not.toContain("response-or-direct-primary-wrong-attribution");
    expect(verdict.metrics.wrongAttributionCount).toBe(0);
  });
});

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "vem-r2-t3-test-"));
  roots.push(root);
  return root;
}
function json(path) { return JSON.parse(readFileSync(path, "utf8")); }
