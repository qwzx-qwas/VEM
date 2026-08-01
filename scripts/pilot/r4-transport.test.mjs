import { describe, expect, test } from "vitest";
import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import {
  buildR4LocalTransportPreflight,
  classifyR4Attempt,
  planR4Retry,
  R4_MAX_PROCESS_ATTEMPTS,
  sealR4AttemptEvidence,
} from "./r4-transport.mjs";

const HASH = "a".repeat(64);

describe("R4 zero-model transport preflight", () => {
  test("records local capability without claiming provider reachability", () => {
    expect(buildR4LocalTransportPreflight({
      codexVersion: "codex-cli 0.114.0",
      permissionProbe: permissionProbe(),
    })).toMatchObject({
      ok: true,
      modelCall: false,
      networkPolicyConfiguredDisabled: true,
      networkRuntimeProbed: false,
      providerReachabilityClaimed: false,
      authReadableToGeneratedCommands: false,
    });
  });

  test("rejects permission drift or a dishonest runtime probe", () => {
    expect(() => buildR4LocalTransportPreflight({
      codexVersion: "codex-cli 0.114.0",
      permissionProbe: { ...permissionProbe(), networkRuntimeProbed: true },
    })).toThrowError("R4_TRANSPORT_PREFLIGHT_INVALID");
  });
});

describe("R4 timeout-before-response classification", () => {
  test("accepts only the sealed R3 timeout terminal shape", () => {
    expect(classifyR4Attempt(timeoutAttempt())).toMatchObject({
      kind: "external-transport-timeout-before-response",
      retryable: true,
      evidence: {
        emptyAuthoritativeResponse: true,
        turnCompletedCount: 0,
        timeoutTerminal: true,
      },
    });
  });

  test.each([
    ["partial response", {
      finalResponse: { status: "present" },
      events: [
        { type: "item.completed", item: { type: "agent_message" } },
        { type: "turn.failed", error: { message: "request timed out" } },
      ],
      kind: "partial-or-completed-response",
    }],
    ["completed turn", {
      events: [{ type: "turn.completed" }],
      kind: "partial-or-completed-response",
    }],
    ["authentication", {
      events: [{ type: "turn.failed", error: { message: "Unauthorized" } }],
      kind: "authentication-or-rate-limit-failure",
    }],
    ["rate limit", {
      events: [{ type: "turn.failed", error: { message: "rate limit exceeded" } }],
      kind: "authentication-or-rate-limit-failure",
    }],
    ["unknown", {
      events: [{ type: "turn.failed", error: { message: "provider exploded" } }],
      kind: "protocol-or-unknown-failure",
    }],
    ["audit failure", {
      capsuleAudit: { status: "failed", valid: false },
      kind: "security-or-evidence-boundary-failure",
    }],
  ])("does not retry %s", (_name, change) => {
    const attempt = timeoutAttempt();
    const result = classifyR4Attempt({
      ...attempt,
      ...change,
      finalResponse: change.finalResponse ?? attempt.finalResponse,
      events: change.events ?? attempt.events,
      capsuleAudit: change.capsuleAudit ?? attempt.capsuleAudit,
    });
    expect(result).toMatchObject({ kind: change.kind, retryable: false });
  });
});

describe("R4 bounded retry controller", () => {
  test("allows one retry and preserves the sealed history hash", () => {
    const first = sealed("arm-a-attempt-1", "arm-a", 1, true);
    const plan = planR4Retry({
      armKey: "arm-a",
      attempts: [first],
      batchProcessAttemptCount: 1,
    });
    expect(plan).toMatchObject({
      action: "retry",
      nextAttemptNumber: 2,
      maxRetriesPerArm: 1,
      maxProcessAttempts: 20,
      attemptHistoryHash: canonicalSha256([first.attemptEvidenceHash]),
    });
    expect(Object.isFrozen(first)).toBe(true);
  });

  test("stops after the second timeout", () => {
    expect(planR4Retry({
      armKey: "arm-a",
      attempts: [
        sealed("arm-a-attempt-1", "arm-a", 1, true),
        sealed("arm-a-attempt-2", "arm-a", 2, true),
      ],
      batchProcessAttemptCount: 2,
    })).toMatchObject({ action: "stop", reason: "retry-exhausted" });
  });

  test("stops at the total process-attempt budget", () => {
    expect(planR4Retry({
      armKey: "arm-a",
      attempts: [sealed("arm-a-attempt-1", "arm-a", 1, true)],
      batchProcessAttemptCount: R4_MAX_PROCESS_ATTEMPTS,
    })).toMatchObject({
      action: "stop",
      reason: "batch-attempt-budget-exhausted",
    });
  });

  test("never retries an unsealed or non-retryable attempt", () => {
    const record = sealed("arm-a-attempt-1", "arm-a", 1, false);
    expect(planR4Retry({
      armKey: "arm-a",
      attempts: [record],
      batchProcessAttemptCount: 1,
    })).toMatchObject({ action: "stop", reason: "non-retryable-failure" });
    expect(() => planR4Retry({
      armKey: "arm-a",
      attempts: [{ ...record, evidenceSealed: false }],
      batchProcessAttemptCount: 1,
    })).toThrowError("R4_RETRY_STATE_INVALID");
  });

  test("requires fresh run IDs", () => {
    expect(() => planR4Retry({
      armKey: "arm-a",
      attempts: [
        sealed("duplicate", "arm-a", 1, true),
        sealed("duplicate", "arm-a", 2, true),
      ],
      batchProcessAttemptCount: 2,
    })).toThrowError("R4_RETRY_STATE_INVALID");
  });
});

function timeoutAttempt() {
  return {
    process: { exitCode: 1, launchFailed: false },
    finalResponse: { status: "empty" },
    events: [
      { type: "thread.started" },
      { type: "turn.started" },
      { type: "error", message: "Reconnecting... request timed out" },
      { type: "turn.failed", error: { message: "request timed out" } },
    ],
    capsuleAudit: { status: "passed", valid: true },
    permissionBoundaryPassed: true,
    evidenceSealed: true,
  };
}

function sealed(runId, armKey, attemptNumber, retryable) {
  return sealR4AttemptEvidence({
    runId,
    armKey,
    attemptNumber,
    classification: {
      schemaVersion: "R4-T2-transport-classification-v1",
      kind: retryable
        ? "external-transport-timeout-before-response"
        : "protocol-or-unknown-failure",
      retryable,
      evidence: {},
    },
    evidenceHashes: { "run.json": HASH },
  });
}

function permissionProbe() {
  return {
    ok: true,
    modelCall: false,
    workspaceReadable: true,
    workspaceWritable: false,
    authReadable: false,
    procEnvironmentReadable: true,
    procEnvironmentSensitiveValuesAbsent: true,
    networkPolicyConfiguredDisabled: true,
    networkRuntimeProbed: false,
  };
}
