import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  R6_T6_DEADLINE_SELECTION,
  R6_T7_TERMINATION_POLICY,
} from "./r6-attempt-two-plan.mjs";
import {
  prepareR6AttemptTwoPreregistration,
  preregistrationDigest,
} from "./r6-t6.mjs";
import {
  verifyR6T6Preregistration,
  verifyR6T7BoundSources,
  verifyR6T7OwnerAuthorization,
} from "./r6-t7.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R6-T6 attempt-two preregistration", () => {
  test("freezes a bounded version-bound deadline candidate without calls", () => {
    const { root, result, verified } = prepare();
    const candidate = readJson(join(root, "inputs/deadline-candidate.json"));
    const provenance = readJson(join(
      root,
      "inputs/version-bound-horizon-evidence.json",
    ));
    const plan = verified.plan;

    expect(result).toMatchObject({
      ok: true,
      taskId: "R6-T6",
      decisionAttempt: 2,
      taskCount: 5,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      localProbeCount: 0,
      deadlineContractHash:
        "6145537843ed5c35297196ec0dee74f618f0dd17bc9d89dcfa7bab87a07db4c2",
      externalExecutionAuthorized: false,
      externalModelCallCount: 0,
    });
    expect(candidate).toMatchObject({
      schemaVersion: "R6-T6-deadline-candidate-v1",
      codexVersion: "codex-cli 0.144.5",
      providerRetryHorizonMs: 480_000,
      terminalObservationMarginMs: 120_000,
      deadlineMs: 600_000,
      externalExecutionAuthorized: false,
      retryHorizonProvenance: {
        kind: "version-bound-codex-instrumentation",
        codexVersion: "codex-cli 0.144.5",
      },
    });
    expect(provenance).toMatchObject({
      providerInternalScheduleClaimed: false,
      providerNetworkProbed: false,
      modelCall: false,
      instrumentationHash: plan.instrumentationHash,
    });
    expect(verified.deadlineValidation).toMatchObject({
      bounded: true,
      providerRetryHorizonExplicit: true,
      reconnectLogUsedAsTerminal: false,
      runnerTerminationRetryable: false,
      attemptOneEvidenceOverwritten: false,
      externalExecutionAuthorized: false,
    });
    expect(plan.deadlineCandidateHash)
      .toBe(verified.deadlineValidation.candidateHash);
    expect(plan.terminationPolicy).toEqual(R6_T7_TERMINATION_POLICY);
    expect(plan.externalExecutionAuthorized).toBe(false);
    expect(plan.productUnlockCount).toBe(0);
    expect(preregistrationDigest(root)).toBe(result.preregistrationHash);
    expect(R6_T6_DEADLINE_SELECTION.providerInternalScheduleClaimed)
      .toBe(false);
  });

  test("binds immutable attempt one and fresh equal-base paired tasks", () => {
    const { root, verified } = prepare();
    const prior = readJson(join(
      REPO_ROOT,
      "docs/test-evidence/R6-T3/20260730T165800-0800/"
        + "inputs/task-manifest.json",
    ));
    const priorIds = new Set(prior.tasks.map((task) => task.taskId));
    const priorPrompts = new Set(prior.tasks.map((task) => task.promptHash));
    const taskIds = verified.manifest.tasks.map((task) => task.taskId);

    expect(verified.plan.attemptOne).toEqual({
      taskId: "R6-T4",
      decisionAttempt: 1,
      decision: "adjust",
      resultManifestHash:
        "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8",
      verdictHash:
        "acf6fab787681e5ab7bb9213a9553ed950e4809ad167e1dad82f3ca6a7aa6902",
      overwritten: false,
    });
    expect(verified.plan.supersedesAttempt).toBe("R6-T4");
    expect(taskIds).toHaveLength(5);
    expect(new Set(taskIds).size).toBe(5);
    expect(taskIds.some((taskId) => priorIds.has(taskId))).toBe(false);
    expect(verified.manifest.tasks.some(
      (task) => priorPrompts.has(task.promptHash),
    )).toBe(false);
    expect(verified.manifest.tasks.map((task) => task.armOrder)).toEqual([
      ["direct-search", "vem-assisted"],
      ["vem-assisted", "direct-search"],
      ["direct-search", "vem-assisted"],
      ["vem-assisted", "direct-search"],
      ["direct-search", "vem-assisted"],
    ]);
    for (const task of verified.manifest.tasks) {
      const capsule = readJson(join(root, `capsules/${task.taskId}.json`));
      expect(capsule.onlyDifference).toBe("vem-context.json");
      expect(capsule.baseContextHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(capsule.vemContextHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(capsule.probes).toBeNull();
    }
    expect(verified.plan.groundTruthParticipantVisible).toBe(false);
    expect(verified.plan.productHoldoutConsumed).toBe(false);
  });

  test("fail-closes source drift and requires a new exact R6-T7 grant", () => {
    const { result, verified } = prepare();
    expect(verifyR6T7BoundSources(verified.plan.sourceBindings)).toMatchObject({
      valid: true,
      sourceCount: 13,
      instrumentationHash: result.instrumentationHash,
    });
    const changed = {
      ...verified.plan.sourceBindings,
      "scripts/pilot/r6-t7.mjs": "0".repeat(64),
    };
    expect(() => verifyR6T7BoundSources(changed))
      .toThrow("R6_T7_BOUND_SOURCE_CHANGED");

    const authorization = {
      schemaVersion: "R6-T7-owner-authorization-v1",
      taskId: "R6-T7",
      decisionKey: "R6-RECOVERY",
      decisionAttempt: 2,
      supersedesAttempt: "R6-T4",
      authorized: true,
      preregistrationHash: result.preregistrationHash,
      destination: verified.plan.destination,
      model: verified.plan.model,
      dataScopeHash: verified.plan.dataScopeHash,
      outerEnvironmentHash: verified.plan.outerEnvironmentHash,
      deadlineContractHash: verified.plan.deadlineContractHash,
      deadlineCandidateHash: verified.plan.deadlineCandidateHash,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      terminationPolicy: verified.plan.terminationPolicy,
      statement:
        "Authorize only this exact R6-T7 attempt-two batch and all frozen boundaries.",
      authorizedAt: "2026-07-30T18:00:00+08:00",
    };
    expect(verifyR6T7OwnerAuthorization({
      authorization,
      preregistrationHash: result.preregistrationHash,
      dataScopeHash: verified.plan.dataScopeHash,
      terminationPolicy: verified.plan.terminationPolicy,
      outerEnvironmentHash: verified.plan.outerEnvironmentHash,
      deadlineContractHash: verified.plan.deadlineContractHash,
      deadlineCandidateHash: verified.plan.deadlineCandidateHash,
    })).toMatchObject({
      valid: true,
      decisionAttempt: 2,
      supersedesAttempt: "R6-T4",
      maxProcessAttempts: 20,
      deadlineMs: 600_000,
    });
    expect(() => verifyR6T7OwnerAuthorization({
      authorization: { ...authorization, taskId: "R6-T4" },
      preregistrationHash: result.preregistrationHash,
      dataScopeHash: verified.plan.dataScopeHash,
      terminationPolicy: verified.plan.terminationPolicy,
      outerEnvironmentHash: verified.plan.outerEnvironmentHash,
      deadlineContractHash: verified.plan.deadlineContractHash,
      deadlineCandidateHash: verified.plan.deadlineCandidateHash,
    })).toThrow("R6_T7_OWNER_AUTHORIZATION_INVALID");
  });

  test("contains no R6-T6 provider execution path", () => {
    const source = readFileSync(
      join(REPO_ROOT, "scripts/pilot/r6-t6.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/child_process|spawnSync|execFileSync/iu);
    expect(source).not.toContain("runR6AttemptTwoPilot(");
    expect(source).toContain("externalExecutionAuthorized: false");
    expect(source).toContain("externalModelCallCount: 0");
  });
});

function prepare() {
  const parent = mkdtempSync(join(tmpdir(), "vem-r6-t6-test-"));
  temporaryRoots.push(parent);
  const root = join(parent, "preregistration");
  const result = prepareR6AttemptTwoPreregistration({
    outputRoot: root,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  const verified = verifyR6T6Preregistration(root, {
    requireProbes: false,
  });
  return { root, result, verified };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
