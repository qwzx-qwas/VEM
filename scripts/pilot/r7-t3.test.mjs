import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import { R7_T2_PUBLISHED_COMMIT, R7_T4_TERMINATION_POLICY } from "./r7-plan.mjs";
import {
  prepareR7Preregistration,
  preregistrationDigest,
  verifyR7BoundSources,
  verifyR7Preregistration,
} from "./r7-t3.mjs";
import { verifyR7T4OwnerAuthorization } from "./r7-t4.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const R6_T12_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T12/20260801T131600-0800",
);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R7-T3 retry-isolated preregistration", () => {
  test("freezes five fresh counterbalanced tasks and twenty isolated attempt handles", () => {
    const { root, result, verified } = prepare();
    expect(result).toMatchObject({
      taskId: "R7-T3",
      decisionAttempt: 1,
      taskCount: 5,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      localProbeCount: 0,
      attemptIsolationProbeCount: 20,
      externalExecutionAuthorized: false,
      externalModelCallCount: 0,
    });
    expect(verified.plan).toMatchObject({
      decisionKey: "R7-RECOVERY",
      decisionAttempt: 1,
      supersedesAttempt: null,
      doesNotSupersede: "R6-RECOVERY",
      prerequisitePublishedCommit: R7_T2_PUBLISHED_COMMIT,
      externalExecutionAuthorized: false,
      productUnlockCount: 0,
      productHoldoutConsumed: false,
    });
    expect(verified.manifest.tasks.map(({ armOrder }) => armOrder))
      .toEqual([
        ["direct-search", "vem-assisted"],
        ["vem-assisted", "direct-search"],
        ["direct-search", "vem-assisted"],
        ["vem-assisted", "direct-search"],
        ["direct-search", "vem-assisted"],
      ]);
    for (const task of verified.manifest.tasks) {
      expect(readJson(join(root, `capsules/${task.taskId}.json`))).toMatchObject({
        onlyDifference: "vem-context.json",
        probes: null,
        retryIsolation: {
          preparedAttemptCount: 4,
          distinctCapsuleRootCount: 4,
          distinctControlRootCount: 4,
          distinctPermissionProfileCount: 4,
          distinctFinalFileCount: 4,
          retryBaseContextStable: true,
          retryPromptStable: true,
          retryTreatmentStable: true,
          processStarted: false,
          modelCall: false,
          priorWritableOutputReused: false,
        },
      });
    }
    expect(preregistrationDigest(root)).toBe(result.preregistrationHash);
  });

  test("excludes every prior R6 task/prompt and product holdout", () => {
    const { verified } = prepare();
    const priorManifest = readJson(join(R6_T12_ROOT, "inputs/task-manifest.json"));
    const priorExclusion = readJson(join(
      R6_T12_ROOT,
      "private/prior-task-exclusion.json",
    ));
    const priorIds = new Set([
      ...priorExclusion.taskIds,
      ...priorManifest.tasks.map(({ taskId }) => taskId),
    ]);
    const priorPrompts = new Set([
      ...priorExclusion.promptHashes,
      ...priorManifest.tasks.map(({ promptHash }) => promptHash),
    ]);
    expect(verified.manifest.tasks.some(({ taskId }) => priorIds.has(taskId)))
      .toBe(false);
    expect(verified.manifest.tasks.some(
      ({ promptHash }) => priorPrompts.has(promptHash),
    )).toBe(false);
  });

  test("binds R6 stop, R7-T2 proof, runtime sources and unchanged policies", () => {
    const { result, verified } = prepare();
    expect(verified.plan.immutableR6Stop).toMatchObject({
      taskId: "R6-T13",
      decision: "stop",
      overwritten: false,
    });
    expect(verified.plan.r7T2Binding).toMatchObject({
      taskId: "R7-T2",
      publishedCommit: R7_T2_PUBLISHED_COMMIT,
      proofHash: "165c6634eca37c297e304eea19eef0f2e30597430e8ea79e5a834b7b5ee36e57",
      overwritten: false,
    });
    expect(verified.plan.terminationPolicy).toEqual(R7_T4_TERMINATION_POLICY);
    expect(verifyR7BoundSources(verified.plan.sourceBindings)).toMatchObject({
      valid: true,
      sourceCount: 15,
      instrumentationHash: result.instrumentationHash,
    });
    expect(() => verifyR7BoundSources({
      ...verified.plan.sourceBindings,
      "scripts/pilot/r7-t4.mjs": "0".repeat(64),
    })).toThrowError("R7_T3_BOUND_SOURCE_CHANGED");
  });

  test("requires a new exact post-publish R7-T4 authorization", () => {
    const { result, verified } = prepare();
    const publishedCommit = "1".repeat(40);
    const authorization = {
      schemaVersion: "R7-T4-owner-authorization-v1",
      taskId: "R7-T4",
      decisionKey: "R7-RECOVERY",
      decisionAttempt: 1,
      supersedesAttempt: null,
      authorized: true,
      publishedCommit,
      preregistrationHash: result.preregistrationHash,
      instrumentationHash: result.instrumentationHash,
      destination: verified.plan.destination,
      model: verified.plan.model,
      dataScopeHash: result.dataScopeHash,
      failurePolicyHash: result.failurePolicyHash,
      retryIsolationHash: result.retryIsolationHash,
      terminationPolicyHash: result.terminationPolicyHash,
      outerEnvironmentHash: result.outerEnvironmentHash,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      terminationPolicy: verified.plan.terminationPolicy,
      statement:
        "Authorize exactly this independently published R7-T4 retry-isolated batch and every frozen boundary hash.",
      authorizedAt: "2026-08-01T17:00:00+08:00",
    };
    expect(verifyR7T4OwnerAuthorization({
      authorization,
      publishedCommit,
      preregistrationHash: result.preregistrationHash,
      instrumentationHash: result.instrumentationHash,
      dataScopeHash: result.dataScopeHash,
      failurePolicyHash: result.failurePolicyHash,
      retryIsolationHash: result.retryIsolationHash,
      terminationPolicyHash: result.terminationPolicyHash,
      outerEnvironmentHash: result.outerEnvironmentHash,
    })).toMatchObject({
      valid: true,
      decisionAttempt: 1,
      supersedesAttempt: null,
      maxProcessAttempts: 20,
      deadlineMs: 1_200_000,
    });
    expect(() => verifyR7T4OwnerAuthorization({
      authorization: { ...authorization, publishedCommit: R7_T2_PUBLISHED_COMMIT },
      publishedCommit,
      preregistrationHash: result.preregistrationHash,
      instrumentationHash: result.instrumentationHash,
      dataScopeHash: result.dataScopeHash,
      failurePolicyHash: result.failurePolicyHash,
      retryIsolationHash: result.retryIsolationHash,
      terminationPolicyHash: result.terminationPolicyHash,
      outerEnvironmentHash: result.outerEnvironmentHash,
    })).toThrowError("R7_T4_OWNER_AUTHORIZATION_INVALID");
  });

  test("contains no R7-T3 participant, provider, or network execution primitive", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts/pilot/r7-t3.mjs"), "utf8");
    expect(source).not.toMatch(/node:child_process|node:https|node:http|fetch\s*\(|\.spawn\s*\(/u);
    expect(source).toContain("externalExecutionAuthorized: false");
    expect(source).toContain("externalModelCallCount: 0");
  });

  test("freezes retry-isolation and failure hashes independently", () => {
    const { result, verified } = prepare();
    expect(result.failurePolicyHash).toBe(verified.plan.failurePolicyHash);
    expect(result.retryIsolationHash).toBe(verified.plan.retryIsolationHash);
    expect(result.failurePolicyHash).not.toBe(result.retryIsolationHash);
    expect(result.dataScopeHash).toBe(canonicalSha256({
      destination: verified.plan.destination,
      model: verified.plan.model,
      participantFiles: verified.plan.participantDataPaths,
      failurePolicyHash: verified.plan.failurePolicyHash,
      retryIsolationHash: verified.plan.retryIsolationHash,
      terminationPolicy: verified.plan.terminationPolicy,
      outerEnvironment: verified.plan.outerEnvironment,
    }));
  });
});

function prepare() {
  const parent = mkdtempSync(join(tmpdir(), "vem-r7-t3-test-"));
  temporaryRoots.push(parent);
  const authFile = join(parent, "auth.json");
  writeFileSync(authFile, "{}\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(authFile, 0o600);
  const codexInstallRoot = join(parent, "codex-install");
  mkdirSync(codexInstallRoot, { mode: 0o700 });
  const root = join(parent, "preregistration");
  const result = prepareR7Preregistration({
    outputRoot: root,
    runProbes: false,
    enforceEvidenceParent: false,
    authFile,
    codexInstallRoot,
  });
  const verified = verifyR7Preregistration(root, { requireProbes: false });
  return { root, result, verified };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
