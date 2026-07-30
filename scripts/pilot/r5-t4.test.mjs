import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import { verifyOuterManifest } from "./r3-run-finalizer.mjs";
import { classifyR5Attempt } from "./r5-attempt-policy.mjs";
import {
  R5_TERMINATION_POLICY,
} from "./r5-recovery-plan.mjs";
import {
  verifyR5EvidenceManifest,
} from "./r5-process-terminalizer.mjs";
import {
  runR5RecoveryPilot,
  verifyR5OwnerAuthorization,
  verifyR5Preregistration,
} from "./r5-t4.mjs";

const PREREGISTRATION =
  "docs/test-evidence/R5-T3/20260730T154956-0800";
const AUTHORIZATION =
  "docs/test-evidence/R5-T4/OWNER_AUTHORIZATION_20260730.json";
const TERMINALIZER_PROOF =
  "docs/test-evidence/R5-T2/20260730T153607+0800/local-runs";
const RESULT_ROOT =
  "docs/test-evidence/R5-T4/20260730T155920-0800";

describe("R5-T4 frozen runner boundary", () => {
  test("rejects incomplete authorization before any executor can run", async () => {
    let called = false;
    await expect(runR5RecoveryPilot({
      preregistrationRoot: "/tmp/not-a-frozen-r5-root",
      resultRoot: "/tmp/not-a-result-root",
      authorizationPath: "/tmp/not-an-authorization",
      executeAttempt: async () => {
        called = true;
      },
    })).rejects.toThrow();
    expect(called).toBe(false);
  });

  test("preserves the frozen plan and rejects its superseded source bindings", () => {
    expect(() => verifyR5Preregistration(PREREGISTRATION))
      .toThrowError("R5_T4_BOUND_SOURCE_CHANGED");
    const preregistrationHash = readFileSync(
      join(PREREGISTRATION, "PREREGISTRATION.sha256"),
      "utf8",
    ).trim();
    const plan = readJson(join(PREREGISTRATION, "PREREGISTRATION.json"));
    const authorization = readJson(AUTHORIZATION);
    expect({ preregistrationHash, plan }).toMatchObject({
      preregistrationHash:
        "8a7b315cfa5597b046228d9597a5805ad3b3dbd0becaa83a37f9ea81475ec886",
      plan: {
        instrumentationHash:
          "02fa73cd42572e703c33516b5a5f10a123f0f8e34dd0b82275016f8a8f9c6641",
        dataScopeHash:
          "fefd57ecda3606e69eadb1165618cff24f76ce4ac699243a52f61171c98edba6",
        terminationPolicyHash:
          "ca4ffce3cf06abea99712e581a9732d6579a5490ff9f2bc24e3265b39991404f",
        externalExecutionAuthorized: false,
      },
    });
    expect(verifyR5OwnerAuthorization({
      authorization,
      preregistrationHash,
      dataScopeHash: plan.dataScopeHash,
      terminationPolicy: plan.terminationPolicy,
    })).toMatchObject({
      valid: true,
      authorizationHash:
        "4e682b719e64375f52613f128f04d39ca51d638ceb01bf1730decca0283f190c",
    });
  });

  test("rejects any destination, budget, deadline, grace or signal drift", () => {
    const authorization = readJson(AUTHORIZATION);
    const base = {
      preregistrationHash: authorization.preregistrationHash,
      dataScopeHash: authorization.dataScopeHash,
      terminationPolicy: R5_TERMINATION_POLICY,
    };
    for (const mutation of [
      { destination: "other" },
      { model: "other" },
      { successfulArmCount: 9 },
      { maxProcessAttempts: 19 },
      {
        terminationPolicy: {
          ...authorization.terminationPolicy,
          deadlineMs: 120_001,
        },
      },
      {
        terminationPolicy: {
          ...authorization.terminationPolicy,
          graceMs: 5_001,
        },
      },
      {
        terminationPolicy: {
          ...authorization.terminationPolicy,
          forceSignal: "SIGTERM",
        },
      },
    ]) {
      expect(() => verifyR5OwnerAuthorization({
        authorization: { ...authorization, ...mutation },
        ...base,
      })).toThrowError("R5_T4_OWNER_AUTHORIZATION_INVALID");
    }
  });

  test("replays sealed local evidence as success or non-retryable deadline", () => {
    const normalRoot = join(TERMINALIZER_PROOF, "normal");
    const deadlineRoot = join(TERMINALIZER_PROOF, "deadline-tree");
    expect(verifyR5EvidenceManifest(normalRoot)).toBe(true);
    expect(verifyR5EvidenceManifest(deadlineRoot)).toBe(true);
    expect(classifyRecorded(normalRoot)).toMatchObject({
      kind: "success",
      retryable: false,
      evidence: {
        processTreeTerminated: true,
        providerTerminalInvented: false,
      },
    });
    expect(classifyRecorded(deadlineRoot)).toMatchObject({
      kind: "runner-wall-clock-terminated-before-response",
      retryable: false,
      evidence: {
        runnerDeadline: true,
        processTreeTerminated: true,
        providerTerminalInvented: false,
      },
    });
  });

  test("seals the pre-spawn incompatibility and stop verdict without a run", () => {
    const failure = readJson(join(
      RESULT_ROOT,
      "results/pre-spawn-failure.json",
    ));
    const verdict = readJson(join(RESULT_ROOT, "results/verdict.json"));
    const index = readJson(join(RESULT_ROOT, "results/run-index.json"));
    expect(failure).toMatchObject({
      failureCode: "R5_EXECUTION_OPTIONS_INVALID",
      executionObservation: {
        participantProcessSpawned: false,
        externalProcessCount: 0,
        retryStarted: false,
      },
      evidence: {
        failureEvidenceSealedBeforeVerdict: true,
      },
    });
    expect(verdict).toMatchObject({
      decisionKey: "R5-RECOVERY",
      verdict: "stop",
      stopReasons: ["aggregate-integrity-failed"],
      metrics: {
        successfulArmCount: 0,
        processAttemptCount: 0,
        externalProcessCount: 0,
        aggregateIntegrityPassed: false,
      },
    });
    expect(index).toMatchObject({
      batchStopped: true,
      externalProcessCount: 0,
      runIds: [],
      verdictHash: canonicalSha256(verdict),
      failureEvidenceSealed: true,
    });
    expect(verifyOuterManifest(RESULT_ROOT, "RESULTS.sha256")).toBe(true);
  });
});

function classifyRecorded(root) {
  return classifyR5Attempt({
    run: readJson(join(root, "run.json")),
    termination: readJson(join(root, "termination.json")),
    finalResponse: readJson(join(root, "final-response-observation.json")),
    boundary: readJson(join(root, "boundary-state.json")),
    events: readFileSync(join(root, "stdout.jsonl"), "utf8")
      .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)),
    evidenceSealed: verifyR5EvidenceManifest(root),
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
