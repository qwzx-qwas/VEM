import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  R6_T12_SELECTED_FAILURE_CLASS,
  classifyR6AttemptFour,
  planR6AttemptFourRetry,
  sealR6AttemptFourEvidence,
  validateR6AttemptFourFailureCandidate,
} from "./r6-attempt-four-policy.mjs";
import { R6_T13_TERMINATION_POLICY } from "./r6-attempt-four-plan.mjs";
import {
  prepareR6AttemptFourPreregistration,
  preregistrationDigest,
} from "./r6-t12.mjs";
import {
  verifyR6T12Preregistration,
  verifyR6T13BoundSources,
  verifyR6T13OwnerAuthorization,
} from "./r6-t13.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const R6_T10_RUN = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T10/20260730T195616-0800/runs/",
  "r6-terminal-01-fallback-heading-direct-search-attempt-1",
);
const R6_T11_PROOF = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T11/20260801T123150-0800/proof.json",
);
const R6_T9_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T9/20260730T194005-0800",
);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R6-T12 attempt-four preregistration", () => {
  test("selects a bounded non-timeout class without changing attempt three", () => {
    const { contract, candidate, validation } = failurePolicy();
    expect(validation).toMatchObject({
      requirementsHash: contract.contractHash,
      bounded: true,
      selectedClassEvidenceConjunctive: true,
      providerTimeoutClassPreserved: true,
      reconnectTimeoutUsedAsTerminal: false,
      attemptThreeClassificationChanged: false,
      priorAttemptEvidenceOverwritten: false,
      externalExecutionAuthorized: false,
    });
    expect(candidate).toMatchObject({
      selectedClass: R6_T12_SELECTED_FAILURE_CLASS,
      selectedClassIsTimeout: false,
      rootCauseClaimed: false,
      unknownOrDifferentNonTimeoutTerminalRetryable: false,
      maxRetriesPerArm: 1,
      maxProcessAttempts: 20,
      externalExecutionAuthorized: false,
    });
  });

  test("classifies the exact immutable terminal conjunction as selected", () => {
    const input = attemptThreeInput();
    const classification = classifyR6AttemptFour({
      ...input,
      failurePolicy: failurePolicy().validation,
    });
    expect(classification).toMatchObject({
      kind: R6_T12_SELECTED_FAILURE_CLASS,
      retryable: true,
      evidence: {
        sealedBoundary: true,
        providerTimeout: false,
        runnerDeadline: false,
        orderedNetworkFallbackObserved: true,
        nonTimeoutErrorSendingTerminalObserved: true,
        matchingTerminalPrecursorCount: 1,
        selectedClassEvidenceConjunctionPassed: true,
        attemptThreeClassificationChanged: false,
      },
    });
  });

  test("keeps incomplete or different non-timeout evidence nonretryable", () => {
    const input = attemptThreeInput();
    input.events[6].item.message =
      "Falling back from WebSockets to HTTPS transport. request timed out";
    const classification = classifyR6AttemptFour({
      ...input,
      failurePolicy: failurePolicy().validation,
    });
    expect(classification).toMatchObject({
      kind: "protocol-or-unknown-failure",
      retryable: false,
      evidence: {
        orderedNetworkFallbackObserved: false,
        selectedClassEvidenceConjunctionPassed: false,
      },
    });
  });

  test("permits at most one sealed selected-class retry", () => {
    const classification = classifyR6AttemptFour({
      ...attemptThreeInput(),
      failurePolicy: failurePolicy().validation,
    });
    const first = sealR6AttemptFourEvidence({
      runId: "selected-attempt-1",
      armKey: "task:direct-search",
      attemptNumber: 1,
      classification,
      evidenceHashes: { "run.json": "a".repeat(64) },
    });
    expect(planR6AttemptFourRetry({
      armKey: first.armKey,
      attempts: [first],
      batchProcessAttemptCount: 1,
    })).toMatchObject({
      action: "retry",
      reason: "sealed-selected-nontimeout-terminal-before-response",
      nextAttemptNumber: 2,
      maxRetriesPerArm: 1,
      maxProcessAttempts: 20,
    });
    const second = sealR6AttemptFourEvidence({
      runId: "selected-attempt-2",
      armKey: first.armKey,
      attemptNumber: 2,
      classification,
      evidenceHashes: { "run.json": "b".repeat(64) },
    });
    expect(planR6AttemptFourRetry({
      armKey: first.armKey,
      attempts: [first, second],
      batchProcessAttemptCount: 2,
    })).toMatchObject({
      action: "stop",
      reason: "retry-exhausted",
      nextAttemptNumber: null,
    });
  });

  test("freezes fresh equal-base tasks and immutable attempts 1/2/3", () => {
    const { root, result, verified } = prepare();
    const prior = readJson(join(R6_T9_ROOT, "inputs/task-manifest.json"));
    const exclusion = readJson(join(
      R6_T9_ROOT,
      "private/prior-task-exclusion.json",
    ));
    const priorIds = new Set([
      ...exclusion.taskIds,
      ...prior.tasks.map(({ taskId }) => taskId),
    ]);
    const priorPrompts = new Set([
      ...exclusion.promptHashes,
      ...prior.tasks.map(({ promptHash }) => promptHash),
    ]);
    expect(result).toMatchObject({
      taskId: "R6-T12",
      decisionAttempt: 4,
      taskCount: 5,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      localProbeCount: 0,
      failureContractHash:
        "fa512a787a4d72d75704ebebbd06ab78cd796387483f0e625985fb6d9fbce1d2",
      externalExecutionAuthorized: false,
      externalModelCallCount: 0,
    });
    expect(verified.plan.attemptThree).toMatchObject({
      taskId: "R6-T10",
      decisionAttempt: 3,
      supersedesAttempt: "R6-T7",
      decision: "adjust",
      resultManifestHash:
        "a45f1970978996cdbe8df8b99e7b09fd3fbcf4865f76d8eeb504dcde2bead13b",
      overwritten: false,
    });
    expect(verified.plan.immutableDecisionAttempts.map(({ taskId }) => taskId))
      .toEqual(["R6-T4", "R6-T7", "R6-T10"]);
    expect(verified.manifest.tasks).toHaveLength(5);
    expect(verified.manifest.tasks.some(
      ({ taskId }) => priorIds.has(taskId),
    )).toBe(false);
    expect(verified.manifest.tasks.some(
      ({ promptHash }) => priorPrompts.has(promptHash),
    )).toBe(false);
    for (const task of verified.manifest.tasks) {
      const capsule = readJson(join(root, `capsules/${task.taskId}.json`));
      expect(capsule.onlyDifference).toBe("vem-context.json");
      expect(capsule.probes).toBeNull();
    }
    expect(verified.plan.terminationPolicy).toEqual(
      R6_T13_TERMINATION_POLICY,
    );
    expect(verified.plan.externalExecutionAuthorized).toBe(false);
    expect(verified.plan.productUnlockCount).toBe(0);
    expect(preregistrationDigest(root)).toBe(result.preregistrationHash);
  });

  test("binds runner sources and requires a new exact R6-T13 grant", () => {
    const { result, verified } = prepare();
    expect(verifyR6T13BoundSources(verified.plan.sourceBindings))
      .toMatchObject({
        valid: true,
        sourceCount: 13,
        instrumentationHash: result.instrumentationHash,
      });
    const changed = {
      ...verified.plan.sourceBindings,
      "scripts/pilot/r6-t13.mjs": "0".repeat(64),
    };
    expect(() => verifyR6T13BoundSources(changed))
      .toThrow("R6_T13_BOUND_SOURCE_CHANGED");

    const authorization = {
      schemaVersion: "R6-T13-owner-authorization-v1",
      taskId: "R6-T13",
      decisionKey: "R6-RECOVERY",
      decisionAttempt: 4,
      supersedesAttempt: "R6-T10",
      authorized: true,
      preregistrationHash: result.preregistrationHash,
      destination: verified.plan.destination,
      model: verified.plan.model,
      dataScopeHash: verified.plan.dataScopeHash,
      outerEnvironmentHash: verified.plan.outerEnvironmentHash,
      failureContractHash: verified.plan.failureContractHash,
      failureCandidateHash: verified.plan.failureCandidateHash,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      terminationPolicy: verified.plan.terminationPolicy,
      statement:
        "Authorize only this exact R6-T13 attempt-four batch and all frozen boundaries.",
      authorizedAt: "2026-08-01T13:30:00+08:00",
    };
    expect(verifyR6T13OwnerAuthorization({
      authorization,
      preregistrationHash: result.preregistrationHash,
      dataScopeHash: verified.plan.dataScopeHash,
      terminationPolicy: verified.plan.terminationPolicy,
      outerEnvironmentHash: verified.plan.outerEnvironmentHash,
      failureContractHash: verified.plan.failureContractHash,
      failureCandidateHash: verified.plan.failureCandidateHash,
    })).toMatchObject({
      valid: true,
      decisionAttempt: 4,
      supersedesAttempt: "R6-T10",
      maxProcessAttempts: 20,
      deadlineMs: 1_200_000,
    });
    expect(() => verifyR6T13OwnerAuthorization({
      authorization: { ...authorization, decisionAttempt: 3 },
      preregistrationHash: result.preregistrationHash,
      dataScopeHash: verified.plan.dataScopeHash,
      terminationPolicy: verified.plan.terminationPolicy,
      outerEnvironmentHash: verified.plan.outerEnvironmentHash,
      failureContractHash: verified.plan.failureContractHash,
      failureCandidateHash: verified.plan.failureCandidateHash,
    })).toThrow("R6_T13_OWNER_AUTHORIZATION_INVALID");
  });

  test("contains no R6-T12 participant or provider execution path", () => {
    const source = readFileSync(
      join(REPO_ROOT, "scripts/pilot/r6-t12.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/node:child_process|\bfetch\s*\(|node:https/iu);
    expect(source).not.toContain("runR6AttemptFourPilot(");
    expect(source).toContain("externalExecutionAuthorized: false");
    expect(source).toContain("externalModelCallCount: 0");
  });
});

function prepare() {
  const parent = mkdtempSync(join(tmpdir(), "vem-r6-t12-test-"));
  temporaryRoots.push(parent);
  const root = join(parent, "preregistration");
  const result = prepareR6AttemptFourPreregistration({
    outputRoot: root,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  const verified = verifyR6T12Preregistration(root, {
    requireProbes: false,
  });
  return { root, result, verified };
}

function failurePolicy() {
  const proof = readJson(R6_T11_PROOF);
  const contract = proof.compatibilityContract;
  const candidate = {
    schemaVersion: "R6-T12-failure-policy-candidate-v1",
    compatibilityContractHash: contract.contractHash,
    selectedClass: R6_T12_SELECTED_FAILURE_CLASS,
    selectedClassIsTimeout: false,
    rootCauseClaimed: false,
    requiredEvidence: contract.futureEligibilityRequiredEvidence,
    retryableClassifications: [
      "external-transport-timeout-before-response",
      R6_T12_SELECTED_FAILURE_CLASS,
    ],
    unknownOrDifferentNonTimeoutTerminalRetryable: false,
    maxRetriesPerArm: 1,
    maxProcessAttempts: 20,
    everyAttemptConsumesBudget: true,
    everyAttemptEvidenceRetained: true,
    attemptThreeClassificationChanged: false,
    externalExecutionAuthorized: false,
  };
  return {
    contract,
    candidate,
    validation: validateR6AttemptFourFailureCandidate({
      requirements: contract,
      candidate,
    }),
  };
}

function attemptThreeInput() {
  return {
    run: readJson(join(R6_T10_RUN, "run.json")),
    termination: readJson(join(R6_T10_RUN, "termination.json")),
    finalResponse: readJson(
      join(R6_T10_RUN, "final-response-observation.json"),
    ),
    boundary: readJson(join(R6_T10_RUN, "boundary-state.json")),
    events: readFileSync(join(R6_T10_RUN, "stdout.jsonl"), "utf8")
      .trim().split(/\r?\n/u).map((line) => JSON.parse(line)),
    evidenceSealed: true,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
