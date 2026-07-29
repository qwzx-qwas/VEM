import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  evaluateR1Recovery,
  R1_TASKS,
  validateR1ResponseText,
} from "./r1-recovery-plan.mjs";
import {
  prepareR1RecoveryPreregistration,
  preregistrationDigest,
} from "./r1-t3.mjs";
import {
  verifyR1OwnerAuthorization,
  verifyR1Preregistration,
} from "./r1-t4.mjs";

const R0_INSTRUMENTATION_HASH =
  "c7851c93a8451436d056cc9b2ed097e4b0fc5c6cc0e9f7289ec22ff710d4067b";
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function prepare() {
  const parent = mkdtempSync(join(tmpdir(), "vem-r1-t3-test-"));
  temporaryRoots.push(parent);
  const outputRoot = join(parent, "preregistration");
  const result = prepareR1RecoveryPreregistration({
    outputRoot,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  return { outputRoot, result };
}

function successfulRuns(overrides = {}) {
  return R1_TASKS.flatMap((task, taskIndex) => task.armOrder.map((arm, armIndex) => ({
    taskId: task.taskId,
    arm,
    outcome: "success",
    exitCode: 0,
    threadId: `r1-thread-${taskIndex}-${armIndex}`,
    receiptDurationNs: arm === "vem-assisted"
      ? String(100 + taskIndex)
      : String(200 + taskIndex),
    responseMatchesGroundTruth: true,
    vemDirectPrimaryMatch: arm === "vem-assisted" ? true : null,
    wrongAttribution: false,
    capsuleAudit: "passed",
    ledgerComplete: true,
    selectedResponseCount: 1,
    evidenceHashesValid: true,
    instrumentationHash: "a".repeat(64),
    preregistrationHashChanged: false,
    groundTruthVisible: false,
    holdoutConsumed: false,
    priorTaskOrPromptReused: false,
    ...overrides,
  })));
}

describe("R1-T3 remediated recovery preregistration", () => {
  test("freezes five fresh paired tasks while preserving both terminal stop chains", () => {
    const { outputRoot, result } = prepare();
    const plan = JSON.parse(readFileSync(
      join(outputRoot, "PREREGISTRATION.json"),
      "utf8",
    ));
    expect(result).toMatchObject({
      taskCount: 5,
      runCount: 10,
      externalExecutionAuthorized: false,
      probesRun: false,
    });
    expect(plan).toMatchObject({
      decisionKey: "R1-RECOVERY",
      doesNotSupersede: "R0-RECOVERY",
      alsoDoesNotSupersede: ["P0-VALUE"],
      terminalInputs: {
        r0: { status: "failed", verdict: "stop" },
        p0: { status: "failed", verdict: "stop" },
      },
      fixtureDistinctFromPriorAttempts: true,
      productHoldoutConsumed: false,
      groundTruthParticipantVisible: false,
      externalExecutionAuthorized: false,
    });
    expect(new Set(plan.taskIds).size).toBe(5);
    expect(plan.taskIds.some((id) => plan.priorTaskIdsExcluded.includes(id))).toBe(false);
    expect(plan.taskIds.some((id) => plan.productHoldoutTaskIds.includes(id))).toBe(false);
    expect(readFileSync(join(outputRoot, "PREREGISTRATION.sha256"), "utf8").trim())
      .toBe(preregistrationDigest(outputRoot));
    expect(verifyR1Preregistration(outputRoot)).toBe(result.preregistrationHash);
    expect(readTree(outputRoot, "participant").some(
      (path) => path.includes("ground-truth"),
    )).toBe(false);
  });

  test("proves equal capsule base context with vem-context as the only treatment", () => {
    const { outputRoot } = prepare();
    for (const task of R1_TASKS) {
      const proof = JSON.parse(readFileSync(
        join(outputRoot, `capsules/${task.taskId}.json`),
        "utf8",
      ));
      expect(proof).toMatchObject({
        taskId: task.taskId,
        onlyDifference: "vem-context.json",
        probes: { skippedForUnitTest: true },
      });
      expect(proof.directManifest.baseContextHash).toBe(proof.vemManifest.baseContextHash);
      expect(proof.directManifest.workspaceFiles.some(
        (file) => file.path === "vem-context.json",
      )).toBe(false);
      expect(proof.vemManifest.workspaceFiles.some(
        (file) => file.path === "vem-context.json",
      )).toBe(true);
    }
  });

  test("binds the remediated recorder, future runner, capsule, audit and failure contract", () => {
    const { outputRoot } = prepare();
    const plan = JSON.parse(readFileSync(
      join(outputRoot, "PREREGISTRATION.json"),
      "utf8",
    ));
    expect(plan.instrumentationHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(plan.instrumentationHash).not.toBe(R0_INSTRUMENTATION_HASH);
    expect(Object.keys(plan.sourceBindings)).toEqual(expect.arrayContaining([
      "scripts/pilot/r1-t4.mjs",
      "scripts/pilot/r1-run-recorder.mjs",
      "scripts/pilot/r1-recovery-plan.mjs",
      "scripts/pilot/capsule.mjs",
      "scripts/pilot/capsule-audit-v2.mjs",
    ]));
    expect(plan.capsuleBaseHashes).toHaveLength(5);
    expect(plan.thresholdPolicy.stopWhenAny).toContain(
      "failure-evidence-not-sealed-before-return",
    );
    const failureContract = JSON.parse(readFileSync(
      join(outputRoot, "inputs/failure-evidence-contract.json"),
      "utf8",
    ));
    expect(failureContract).toMatchObject({
      streamCloseBeforeResponseSelection: true,
      schemaValidNonconflictingSelectionCount: 1,
      zeroOrConflictingValidCandidates: "fail-closed",
      batchPolicy: "stop-after-first-runner-or-evidence-integrity-failure",
    });
  });

  test("detects any post-freeze participant or runner-plan mutation", () => {
    const { outputRoot, result } = prepare();
    writeFileSync(
      join(outputRoot, "participant/tasks/r1-run-01-boundary-label/prompt.txt"),
      "mutated\n",
      "utf8",
    );
    expect(preregistrationDigest(outputRoot)).not.toBe(result.preregistrationHash);
    expect(() => verifyR1Preregistration(outputRoot))
      .toThrowError("R1_T4_PREREGISTRATION_CHANGED");
  });
});

describe("R1 recovery response, verdict and authorization gates", () => {
  test("accepts only the closed response shape", () => {
    expect(validateR1ResponseText(JSON.stringify({
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 12,
      sourceAnchorId: null,
    }))).toEqual({
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 12,
      sourceAnchorId: null,
    });
    expect(validateR1ResponseText(JSON.stringify({
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 12,
      sourceAnchorId: null,
      extra: true,
    }))).toBeNull();
  });

  test("continues only when correctness, sealed evidence and cost thresholds pass", () => {
    expect(evaluateR1Recovery({
      runs: successfulRuns(),
      totalSetupDurationNs: "0",
      expectedInstrumentationHash: "a".repeat(64),
    })).toMatchObject({
      verdict: "continue",
      stopReasons: [],
      adjustReasons: [],
      metrics: {
        runCount: 10,
        uniqueThreadCount: 10,
        exactResponseCount: 10,
        ledgerCompleteCount: 10,
        evidenceHashesValidCount: 10,
        fasterPairCount: 5,
      },
    });
  });

  test("stops on unsealed evidence, ledger failure or wrong attribution", () => {
    expect(evaluateR1Recovery({
      runs: successfulRuns({
        evidenceHashesValid: false,
        ledgerComplete: false,
        selectedResponseCount: 0,
        wrongAttribution: true,
      }),
      totalSetupDurationNs: "0",
      expectedInstrumentationHash: "a".repeat(64),
    })).toMatchObject({
      verdict: "stop",
      stopReasons: expect.arrayContaining([
        "event-ledger-integrity-failed",
        "failure-evidence-not-sealed-before-return",
        "response-or-direct-primary-wrong-attribution",
      ]),
    });
  });

  test("requires separate authorization bound to the frozen R1 hash", () => {
    const preregistrationHash = "b".repeat(64);
    expect(verifyR1OwnerAuthorization({
      preregistrationHash,
      authorization: {
        schemaVersion: "R1-T4-owner-authorization-v1",
        taskId: "R1-T4",
        authorized: true,
        preregistrationHash,
        statement: "Owner authorizes the frozen R1-T4 external batch.",
        authorizedAt: "2026-07-29T21:00:00+08:00",
      },
    })).toMatchObject({
      valid: true,
      authorizationHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(() => verifyR1OwnerAuthorization({
      preregistrationHash,
      authorization: {
        schemaVersion: "R1-T4-owner-authorization-v1",
        taskId: "R1-T4",
        authorized: true,
        preregistrationHash: "c".repeat(64),
        statement: "Owner authorizes the frozen R1-T4 external batch.",
        authorizedAt: "2026-07-29T21:00:00+08:00",
      },
    })).toThrowError("R1_T4_OWNER_AUTHORIZATION_INVALID");
  });
});

function readTree(root, relativeRoot) {
  const paths = [];
  const visit = (path, prefix) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const relativePath = `${prefix}${entry.name}`;
      if (entry.isDirectory()) visit(join(path, entry.name), `${relativePath}/`);
      else paths.push(relativePath);
    }
  };
  visit(join(root, relativeRoot), "");
  return paths;
}
