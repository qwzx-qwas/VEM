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
  evaluateR0Recovery,
  R0_TASKS,
} from "./r0-recovery-plan.mjs";
import {
  prepareR0RecoveryPreregistration,
  preregistrationDigest,
} from "./r0-t3.mjs";
import { verifyR0OwnerAuthorization } from "./r0-t4.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function prepare() {
  const parent = mkdtempSync(join(tmpdir(), "vem-r0-t3-test-"));
  temporaryRoots.push(parent);
  const outputRoot = join(parent, "preregistration");
  const result = prepareR0RecoveryPreregistration({
    outputRoot,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  return { outputRoot, result };
}

function successfulRuns(overrides = {}) {
  return R0_TASKS.flatMap((task, taskIndex) => task.armOrder.map((arm, armIndex) => ({
    taskId: task.taskId,
    arm,
    exitCode: 0,
    threadId: `thread-${taskIndex}-${armIndex}`,
    receiptDurationNs: arm === "vem-assisted"
      ? String(100 + taskIndex)
      : String(200 + taskIndex),
    responseMatchesGroundTruth: true,
    vemDirectPrimaryMatch: arm === "vem-assisted" ? true : null,
    wrongAttribution: false,
    capsuleAudit: "passed",
    ledgerComplete: true,
    instrumentationHash: "a".repeat(64),
    preregistrationHashChanged: false,
    groundTruthVisible: false,
    holdoutConsumed: false,
    p0TaskOrPromptReused: false,
    ...overrides,
  })));
}

describe("R0-T3 recovery-only preregistration", () => {
  test("freezes five fresh paired tasks and keeps evaluator inputs outside participant context", () => {
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
      decisionKey: "R0-RECOVERY",
      doesNotSupersede: "P0-VALUE",
      p0TerminalState: { status: "failed", verdict: "stop" },
      taskBank: "recovery-only-not-product-holdout",
      fixtureDistinctFromP0: true,
      productHoldoutConsumed: false,
      groundTruthParticipantVisible: false,
      externalExecutionAuthorized: false,
    });
    expect(new Set(plan.taskIds).size).toBe(5);
    expect(plan.taskIds.some((id) => plan.p0TaskIdsExcluded.includes(id))).toBe(false);
    expect(plan.taskIds.some((id) => plan.productHoldoutTaskIds.includes(id))).toBe(false);
    expect(readFileSync(join(outputRoot, "PREREGISTRATION.sha256"), "utf8").trim())
      .toBe(preregistrationDigest(outputRoot));
    const participantPaths = readTree(outputRoot, "participant");
    expect(participantPaths.some((path) => path.includes("ground-truth"))).toBe(false);
  });

  test("proves equal capsule base context with vem-context as the only treatment difference", () => {
    const { outputRoot } = prepare();
    for (const task of R0_TASKS) {
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

  test("binds the future runner, capsule, v2 audit and receipt-ledger instrumentation", () => {
    const { outputRoot } = prepare();
    const plan = JSON.parse(readFileSync(
      join(outputRoot, "PREREGISTRATION.json"),
      "utf8",
    ));
    expect(plan.instrumentationHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.keys(plan.sourceBindings)).toEqual(expect.arrayContaining([
      "scripts/pilot/r0-t4.mjs",
      "scripts/pilot/capsule.mjs",
      "scripts/pilot/capsule-audit-v2.mjs",
      "packages/pilot-harness/src/receipt-ledger.ts",
      "packages/pilot-harness/dist/receipt-ledger.js",
    ]));
    expect(plan.capsuleBaseHashes).toHaveLength(5);
    expect(plan.thresholdPolicy.stopWhenAny).toContain(
      "event-ledger-integrity-failed",
    );
  });

  test("detects any post-freeze input mutation", () => {
    const { outputRoot, result } = prepare();
    writeFileSync(
      join(outputRoot, "participant/tasks/r0-ux-01-sync-state/prompt.txt"),
      "mutated\n",
      "utf8",
    );
    expect(preregistrationDigest(outputRoot)).not.toBe(result.preregistrationHash);
  });
});

describe("R0 recovery verdict and authorization gates", () => {
  test("continues only when correctness, ledger and preregistered cost thresholds all pass", () => {
    expect(evaluateR0Recovery({
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
        fasterPairCount: 5,
      },
    });
  });

  test("stops on no benefit, wrong attribution or ledger integrity failure", () => {
    const noBenefit = successfulRuns();
    for (const run of noBenefit) {
      run.receiptDurationNs = run.arm === "vem-assisted" ? "300" : "200";
    }
    expect(evaluateR0Recovery({
      runs: noBenefit,
      totalSetupDurationNs: "0",
      expectedInstrumentationHash: "a".repeat(64),
    })).toMatchObject({
      verdict: "stop",
      stopReasons: expect.arrayContaining([
        "vem-faster-on-fewer-than-three-of-five-pairs",
        "vem-median-duration-greater-than-direct-median-duration",
      ]),
    });
    expect(evaluateR0Recovery({
      runs: successfulRuns({
        ledgerComplete: false,
        wrongAttribution: true,
      }),
      totalSetupDurationNs: "0",
      expectedInstrumentationHash: "a".repeat(64),
    })).toMatchObject({
      verdict: "stop",
      stopReasons: expect.arrayContaining([
        "event-ledger-integrity-failed",
        "response-or-direct-primary-wrong-attribution",
      ]),
    });
  });

  test("requires a separate authorization bound to the frozen preregistration hash", () => {
    const preregistrationHash = "b".repeat(64);
    expect(verifyR0OwnerAuthorization({
      preregistrationHash,
      authorization: {
        schemaVersion: "R0-T4-owner-authorization-v1",
        taskId: "R0-T4",
        authorized: true,
        preregistrationHash,
        statement: "Owner authorizes the frozen R0-T4 external batch.",
        authorizedAt: "2026-07-29T19:30:00+08:00",
      },
    })).toMatchObject({
      valid: true,
      authorizationHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(() => verifyR0OwnerAuthorization({
      preregistrationHash,
      authorization: {
        schemaVersion: "R0-T4-owner-authorization-v1",
        taskId: "R0-T4",
        authorized: true,
        preregistrationHash: "c".repeat(64),
        statement: "Owner authorizes the frozen R0-T4 external batch.",
        authorizedAt: "2026-07-29T19:30:00+08:00",
      },
    })).toThrowError("R0_T4_OWNER_AUTHORIZATION_INVALID");
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
