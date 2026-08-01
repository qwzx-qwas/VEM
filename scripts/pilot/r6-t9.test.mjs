import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  R6_T9_DEADLINE_SELECTION,
  R6_T10_TERMINATION_POLICY,
} from "./r6-attempt-three-plan.mjs";
import {
  prepareR6AttemptThreePreregistration,
  preregistrationDigest,
} from "./r6-t9.mjs";
import {
  verifyR6T9Preregistration,
  verifyR6T10BoundSources,
  verifyR6T10OwnerAuthorization,
} from "./r6-t10.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const R6_T6_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T6/20260730T180734-0800",
);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R6-T9 attempt-three preregistration", () => {
  test("selects one exact candidate inside the immutable R6-T8 envelope", () => {
    const { root, result, verified } = prepare();
    const candidate = readJson(join(root, "inputs/deadline-candidate.json"));
    const provenance = readJson(join(
      root,
      "inputs/version-bound-horizon-evidence.json",
    ));
    const plan = verified.plan;

    expect(result).toMatchObject({
      ok: true,
      taskId: "R6-T9",
      decisionAttempt: 3,
      taskCount: 5,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      localProbeCount: 0,
      deadlineContractHash:
        "35a851a8e80785ca92e57f6e8468b183a217eb31e7ad8d7ec212b3f8f850685e",
      externalExecutionAuthorized: false,
      externalModelCallCount: 0,
    });
    expect(candidate).toMatchObject({
      schemaVersion: "R6-T9-deadline-candidate-v1",
      codexVersion: "codex-cli 0.144.5",
      dualTransportContractHash: result.deadlineContractHash,
      providerTerminalHorizonMs: 891_774,
      terminalObservationMarginMs: 308_226,
      deadlineMs: 1_200_000,
      externalExecutionAuthorized: false,
      terminalHorizonProvenance: {
        kind: "version-bound-codex-instrumentation",
        codexVersion: "codex-cli 0.144.5",
      },
    });
    expect(provenance).toMatchObject({
      deadlineSelection: R6_T9_DEADLINE_SELECTION,
      r6T8ProofHash:
        "21cb7550bc5380f0f460efbf59672ebf9bbaa28a78bbf8ce2e2053ddf73296be",
      providerInternalScheduleClaimed: false,
      providerNetworkProbed: false,
      modelCall: false,
      instrumentationHash: plan.instrumentationHash,
    });
    expect(verified.deadlineValidation).toMatchObject({
      bounded: true,
      providerTerminalHorizonExplicit: true,
      orderedTransportReceiptsBound: true,
      reconnectLogUsedAsTerminal: false,
      runnerTerminationRetryable: false,
      priorAttemptEvidenceOverwritten: false,
      externalExecutionAuthorized: false,
    });
    expect(plan.deadlineCandidateHash)
      .toBe(verified.deadlineValidation.candidateHash);
    expect(plan.terminationPolicy).toEqual(R6_T10_TERMINATION_POLICY);
    expect(plan.externalExecutionAuthorized).toBe(false);
    expect(plan.productUnlockCount).toBe(0);
    expect(preregistrationDigest(root)).toBe(result.preregistrationHash);
  });

  test("binds immutable attempt two and fresh equal-base paired tasks", () => {
    const { root, verified } = prepare();
    const prior = readJson(join(R6_T6_ROOT, "inputs/task-manifest.json"));
    const exclusion = readJson(join(
      R6_T6_ROOT,
      "private/prior-task-exclusion.json",
    ));
    const priorIds = new Set([
      ...exclusion.taskIds,
      ...prior.tasks.map((task) => task.taskId),
    ]);
    const priorPrompts = new Set([
      ...exclusion.promptHashes,
      ...prior.tasks.map((task) => task.promptHash),
    ]);
    const taskIds = verified.manifest.tasks.map((task) => task.taskId);

    expect(verified.plan.attemptTwo).toEqual({
      taskId: "R6-T7",
      decisionAttempt: 2,
      supersedesAttempt: "R6-T4",
      decision: "adjust",
      resultManifestHash:
        "2ba2b0537b4fb312e2e82cdd69a7c87b41d05b7117572c5b58978bd300e8fdd7",
      verdictHash:
        "1283979be6a67ed5298877f8ab30c0eca087f8a1fcf88d3032364a353d0acf96",
      overwritten: false,
    });
    expect(verified.plan.supersedesAttempt).toBe("R6-T7");
    expect(verified.plan.priorPreregistration).toMatchObject({
      taskId: "R6-T6",
      preregistrationHash:
        "41ce5ab1a65437defdfcd86c0b4ec4db3e922af8a6c5e5642d44384ea910627e",
      transitivePriorDecisionChainBound: true,
    });
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

  test("fail-closes source drift and requires a new exact R6-T10 grant", () => {
    const { result, verified } = prepare();
    expect(verifyR6T10BoundSources(verified.plan.sourceBindings))
      .toMatchObject({
        valid: true,
        sourceCount: 13,
        instrumentationHash: result.instrumentationHash,
      });
    const changed = {
      ...verified.plan.sourceBindings,
      "scripts/pilot/r6-t10.mjs": "0".repeat(64),
    };
    expect(() => verifyR6T10BoundSources(changed))
      .toThrow("R6_T10_BOUND_SOURCE_CHANGED");

    const authorization = {
      schemaVersion: "R6-T10-owner-authorization-v1",
      taskId: "R6-T10",
      decisionKey: "R6-RECOVERY",
      decisionAttempt: 3,
      supersedesAttempt: "R6-T7",
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
        "Authorize only this exact R6-T10 attempt-three batch and all frozen boundaries.",
      authorizedAt: "2026-07-30T19:45:00+08:00",
    };
    expect(verifyR6T10OwnerAuthorization({
      authorization,
      preregistrationHash: result.preregistrationHash,
      dataScopeHash: verified.plan.dataScopeHash,
      terminationPolicy: verified.plan.terminationPolicy,
      outerEnvironmentHash: verified.plan.outerEnvironmentHash,
      deadlineContractHash: verified.plan.deadlineContractHash,
      deadlineCandidateHash: verified.plan.deadlineCandidateHash,
    })).toMatchObject({
      valid: true,
      decisionAttempt: 3,
      supersedesAttempt: "R6-T7",
      maxProcessAttempts: 20,
      deadlineMs: 1_200_000,
    });
    expect(() => verifyR6T10OwnerAuthorization({
      authorization: { ...authorization, preregistrationHash: "0".repeat(64) },
      preregistrationHash: result.preregistrationHash,
      dataScopeHash: verified.plan.dataScopeHash,
      terminationPolicy: verified.plan.terminationPolicy,
      outerEnvironmentHash: verified.plan.outerEnvironmentHash,
      deadlineContractHash: verified.plan.deadlineContractHash,
      deadlineCandidateHash: verified.plan.deadlineCandidateHash,
    })).toThrow("R6_T10_OWNER_AUTHORIZATION_INVALID");
  });

  test("contains no R6-T9 participant or provider execution path", () => {
    const source = readFileSync(
      join(REPO_ROOT, "scripts/pilot/r6-t9.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/child_process|spawnSync|execFileSync/iu);
    expect(source).not.toContain("runR6AttemptThreePilot(");
    expect(source).toContain("externalExecutionAuthorized: false");
    expect(source).toContain("externalModelCallCount: 0");
  });
});

function prepare() {
  const parent = mkdtempSync(join(tmpdir(), "vem-r6-t9-test-"));
  temporaryRoots.push(parent);
  const root = join(parent, "preregistration");
  const result = prepareR6AttemptThreePreregistration({
    outputRoot: root,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  const verified = verifyR6T9Preregistration(root, {
    requireProbes: false,
  });
  return { root, result, verified };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
