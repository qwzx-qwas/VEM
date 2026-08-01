import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import { verifyR5EvidenceManifest } from "./r5-process-terminalizer.mjs";
import { verifyR7BatchManifest } from "./r7-batch-sealer.mjs";
import { verifyR7Preregistration } from "./r7-t3.mjs";
import { verifyR7T4OwnerAuthorization } from "./r7-t4.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PREREGISTRATION_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R7-T3/20260801T162533-0800",
);
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R7-T4");
const CURRENT = readFileSync(join(EVIDENCE_PARENT, "CURRENT"), "utf8").trim();
const EVIDENCE_ROOT = join(EVIDENCE_PARENT, CURRENT);
const AUTHORIZATION_PATH = join(
  EVIDENCE_PARENT,
  "OWNER_AUTHORIZATION_20260801.json",
);
const RUN_IDS = [
  "r7-retry-isolation-01-control-root-direct-search-attempt-1",
  "r7-retry-isolation-01-control-root-direct-search-attempt-2",
];

describe("committed R7-T4 decision evidence", () => {
  test("binds the exact post-publish owner authorization", () => {
    const preregistration = verifyR7Preregistration(PREREGISTRATION_ROOT);
    const authorization = readJson(AUTHORIZATION_PATH);
    const verified = verifyR7T4OwnerAuthorization({
      authorization,
      publishedCommit: "91e0f08b064d48d757544aa0ca2ce9e186382d75",
      preregistrationHash: preregistration.preregistrationHash,
      instrumentationHash: preregistration.plan.instrumentationHash,
      dataScopeHash: preregistration.plan.dataScopeHash,
      failurePolicyHash: preregistration.plan.failurePolicyHash,
      retryIsolationHash: preregistration.plan.retryIsolationHash,
      terminationPolicyHash: preregistration.plan.terminationPolicyHash,
      outerEnvironmentHash: preregistration.plan.outerEnvironmentHash,
    });
    expect(verified).toMatchObject({
      valid: true,
      decisionAttempt: 1,
      supersedesAttempt: null,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      deadlineMs: 1_200_000,
      graceMs: 5_000,
      forceKillWaitMs: 5_000,
      authorizationHash:
        "3c1cbc8869a98fd65ef20c99ab5f13322afa617790ff9f5a75000fab423f717a",
    });
    expect(canonicalSha256(authorization)).toBe(verified.authorizationHash);
  });

  test("seals two isolated retry attempts and the aggregate stop", () => {
    expect(verifyR7BatchManifest(EVIDENCE_ROOT)).toBe(true);
    for (const runId of RUN_IDS) {
      expect(verifyR5EvidenceManifest(join(EVIDENCE_ROOT, "runs", runId)))
        .toBe(true);
    }
    const batchStop = readJson(join(EVIDENCE_ROOT, "results/batch-stop.json"));
    const retries = readJson(join(EVIDENCE_ROOT, "results/retry-decisions.json"));
    const index = readJson(join(EVIDENCE_ROOT, "results/run-index.json"));
    const verdict = readJson(join(EVIDENCE_ROOT, "results/verdict.json"));
    expect(batchStop).toMatchObject({
      stopped: true,
      expectedArmCount: 10,
      completedArmCount: 0,
      processAttemptCount: 2,
      remainingProcessAttemptBudget: 18,
      preparedAttemptCount: 2,
      sealedProcessAttemptCount: 2,
      retryAuthorized: true,
      retryProcessStarted: true,
      unspawnedRetryConsumedBudget: false,
      externalRerunPerformed: false,
      priorAttemptEvidenceOverwritten: false,
      allSealedAttemptEvidenceRetained: true,
    });
    expect(retries.decisions).toEqual([{
      armKey: "r7-retry-isolation-01-control-root:direct-search",
      nextAttemptNumber: 2,
      authorized: true,
      processStarted: true,
    }]);
    expect(index.attempts).toHaveLength(2);
    expect(new Set(index.attempts.map((attempt) => (
      attempt.resourceIdentityHash
    ))).size).toBe(2);
    expect(new Set(index.attempts.map((attempt) => attempt.baseContextHash)).size)
      .toBe(1);
    expect(index.attempts.every((attempt) => (
      attempt.processStarted
        && attempt.evidenceSealed
        && attempt.cleaned
        && attempt.terminal.classification
          === "external-transport-timeout-before-response"
        && attempt.terminal.processTreeTerminated
    ))).toBe(true);
    expect(verdict).toMatchObject({
      decisionKey: "R7-RECOVERY",
      decisionAttempt: 1,
      supersedesAttempt: null,
      verdict: "stop",
      stopReasons: ["aggregate-integrity-failed"],
      batchStopped: true,
      exceptionCount: 0,
      productUnlockCount: 0,
      r6StopOverwritten: false,
      metrics: {
        successfulArmCount: 0,
        processAttemptCount: 2,
        aggregateIntegrityPassed: false,
      },
    });
    expect(canonicalSha256(verdict)).toBe(
      "18a24afc0709e42207d583048e2c7214b700f6c23ff2eb31387e23d1a75a8776",
    );
  });

  test("retains fresh threads, real provider terminals and private boundaries", () => {
    const threadIds = [];
    for (const runId of RUN_IDS) {
      const root = join(EVIDENCE_ROOT, "runs", runId);
      const boundary = readJson(join(root, "boundary-state.json"));
      const termination = readJson(join(root, "termination.json"));
      const final = readJson(join(root, "final-response-observation.json"));
      const stdout = readFileSync(join(root, "stdout.jsonl"), "utf8");
      threadIds.push(...boundary.audit.threadIds);
      expect(boundary).toMatchObject({
        audit: { status: "passed", valid: true, commandCount: 0 },
        evaluator: { status: "passed", responsePresent: false },
        permission: {
          permissionProfilePassed: true,
          authReadableToGeneratedCommands: false,
          workspaceWritable: false,
        },
      });
      expect(termination).toMatchObject({
        trigger: "process-exit",
        deadlineExpired: false,
        providerTurnFailedObserved: true,
        providerTerminalInvented: false,
        processGroupEmptyAfterTermination: true,
        process: { exitCode: 1, launchFailed: false, signal: null },
      });
      expect(final).toMatchObject({
        status: "empty",
        bytes: "0",
        failureCode: "R5_FINAL_RESPONSE_EMPTY",
      });
      expect(stdout).toContain('"type":"turn.failed"');
      expect(stdout).toContain('"message":"request timed out"');
    }
    expect(new Set(threadIds).size).toBe(2);
  });
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
