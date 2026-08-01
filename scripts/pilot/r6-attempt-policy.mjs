import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import { R6_TERMINATION_POLICY } from "./r6-recovery-plan.mjs";

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,160}$/u;
const TIMEOUT =
  /\b(?:request timed out|timed out|connection timeout|transport timeout)\b/iu;

export function classifyR6Attempt({
  run,
  termination,
  finalResponse,
  boundary,
  events,
  evidenceSealed,
}) {
  if (!isRecord(run)
    || !Array.isArray(run.failureCodes)
    || !isRecord(termination)
    || !isRecord(finalResponse)
    || !isRecord(boundary)
    || !Array.isArray(events)
    || typeof evidenceSealed !== "boolean") {
    throw new Error("R6_ATTEMPT_CLASSIFICATION_INPUT_INVALID");
  }
  const providerTerminalInvented = run.providerTerminalInvented === true
    || termination.providerTerminalInvented === true;
  const processTreeTerminated =
    termination.processGroupEmptyAfterTermination === true;
  const integrityFailureCodes = new Set([
    "R5_PROCESS_GROUP_NOT_EMPTY",
    "R5_TERMINAL_OBSERVATION_CONTRADICTION",
    "R5_STREAM_CLOSE_TIMEOUT",
    "R5_PROCESS_EXIT_OBSERVATION_TIMEOUT",
    "R5_GRACEFUL_SIGNAL_FAILED",
    "R5_FORCE_SIGNAL_FAILED",
    "R5_EVIDENCE_MANIFEST_INVALID",
  ]);
  const integrityCodeObserved = run.failureCodes.some((code) => (
    integrityFailureCodes.has(code)
  ));
  const sealedBoundary = evidenceSealed
    && run.evidenceSealedBeforeReturn === true
    && !providerTerminalInvented
    && processTreeTerminated
    && boundary.permission?.status === "passed"
    && boundary.permission?.permissionProfilePassed === true
    && boundary.audit?.status === "passed"
    && boundary.audit?.valid === true
    && boundary.evaluator?.status === "passed"
    && boundary.evaluator?.valid === true
    && !integrityCodeObserved;
  const finalEmpty = ["missing", "empty"].includes(finalResponse.status);
  const hasAgentResponse = events.some((event) => (
    event?.type === "item.completed"
      && event.item?.type === "agent_message"
  ));
  const turnCompletedCount = events.filter(
    (event) => event?.type === "turn.completed",
  ).length;
  const turnFailed = events.filter((event) => event?.type === "turn.failed");
  const last = events.at(-1);
  const providerTimeout = termination.providerTurnFailedObserved === true
    && turnFailed.length === 1
    && last?.type === "turn.failed"
    && TIMEOUT.test(eventMessage(last));
  const runnerDeadline = termination.deadlineExpired === true
    && termination.trigger === "wall-clock-deadline"
    && termination.providerTurnFailedObserved === false;
  const noResponse = finalEmpty
    && !hasAgentResponse
    && turnCompletedCount === 0;

  let kind = "protocol-or-unknown-failure";
  let retryable = false;
  if (!sealedBoundary) {
    kind = "integrity-failure";
  } else if (run.outcome === "success") {
    kind = "success";
  } else if (providerTimeout && noResponse && !runnerDeadline) {
    kind = "external-transport-timeout-before-response";
    retryable = true;
  } else if (runnerDeadline && noResponse) {
    kind = "runner-wall-clock-terminated-before-response";
  } else if (!noResponse) {
    kind = "partial-or-completed-response";
  }
  return deepFreeze({
    schemaVersion: "R6-T3-attempt-classification-v1",
    kind,
    retryable,
    evidence: {
      sealedBoundary,
      processTreeTerminated,
      providerTerminalInvented,
      providerTurnFailedObserved:
        termination.providerTurnFailedObserved === true,
      providerTimeout,
      runnerDeadline,
      finalEmpty,
      agentResponseObserved: hasAgentResponse,
      turnCompletedCount,
      turnFailedCount: turnFailed.length,
      integrityCodeObserved,
    },
  });
}

export function sealR6AttemptEvidence({
  runId,
  armKey,
  attemptNumber,
  classification,
  evidenceHashes,
}) {
  if (!ID.test(runId)
    || !ID.test(armKey)
    || !Number.isSafeInteger(attemptNumber)
    || attemptNumber < 1
    || attemptNumber > R6_TERMINATION_POLICY.maxRetriesPerArm + 1
    || classification?.schemaVersion
      !== "R6-T3-attempt-classification-v1"
    || typeof classification.retryable !== "boolean"
    || !isRecord(evidenceHashes)
    || Object.keys(evidenceHashes).length < 1
    || Object.entries(evidenceHashes).some(([path, hash]) => (
      !/^[A-Za-z0-9._/-]{1,256}$/u.test(path) || !HASH.test(hash)
    ))) {
    throw new Error("R6_ATTEMPT_EVIDENCE_INVALID");
  }
  const record = {
    schemaVersion: "R6-T3-sealed-attempt-v1",
    runId,
    armKey,
    attemptNumber,
    classification,
    evidenceHashes: Object.fromEntries(
      Object.entries(evidenceHashes).sort(([left], [right]) => (
        left.localeCompare(right)
      )),
    ),
    processTreeTerminated:
      classification.evidence.processTreeTerminated === true,
    providerTerminalInvented:
      classification.evidence.providerTerminalInvented === true,
    evidenceSealed: true,
  };
  return deepFreeze({
    ...record,
    attemptEvidenceHash: canonicalSha256(record),
  });
}

export function planR6Retry({
  armKey,
  attempts,
  batchProcessAttemptCount,
}) {
  if (!ID.test(armKey)
    || !Array.isArray(attempts)
    || attempts.length > R6_TERMINATION_POLICY.maxRetriesPerArm + 1
    || !Number.isSafeInteger(batchProcessAttemptCount)
    || batchProcessAttemptCount < attempts.length
    || batchProcessAttemptCount > R6_TERMINATION_POLICY.maxProcessAttempts
    || attempts.some((attempt, index) => (
      attempt?.schemaVersion !== "R6-T3-sealed-attempt-v1"
      || attempt.armKey !== armKey
      || attempt.attemptNumber !== index + 1
      || attempt.evidenceSealed !== true
      || !HASH.test(attempt.attemptEvidenceHash ?? "")
      || canonicalSha256(stripAttemptHash(attempt))
        !== attempt.attemptEvidenceHash
    ))
    || new Set(attempts.map((attempt) => attempt.runId)).size
      !== attempts.length) {
    throw new Error("R6_RETRY_STATE_INVALID");
  }
  const historyHash = canonicalSha256(
    attempts.map((attempt) => attempt.attemptEvidenceHash),
  );
  if (attempts.length === 0) {
    return decision("execute", "initial-attempt", 1, historyHash);
  }
  const last = attempts.at(-1);
  if (last.classification.kind === "success") {
    return decision("complete", "successful-attempt", null, historyHash);
  }
  if (last.classification.retryable !== true) {
    return decision("stop", "non-retryable-failure", null, historyHash);
  }
  if (attempts.length > R6_TERMINATION_POLICY.maxRetriesPerArm) {
    return decision("stop", "retry-exhausted", null, historyHash);
  }
  if (batchProcessAttemptCount >= R6_TERMINATION_POLICY.maxProcessAttempts) {
    return decision("stop", "batch-attempt-budget-exhausted", null, historyHash);
  }
  return decision("retry", "sealed-provider-timeout-before-response", 2, historyHash);
}

function decision(action, reason, nextAttemptNumber, attemptHistoryHash) {
  return deepFreeze({
    schemaVersion: "R6-T3-retry-decision-v1",
    action,
    reason,
    nextAttemptNumber,
    maxRetriesPerArm: R6_TERMINATION_POLICY.maxRetriesPerArm,
    maxProcessAttempts: R6_TERMINATION_POLICY.maxProcessAttempts,
    runnerTerminationRetryable:
      R6_TERMINATION_POLICY.runnerTerminationRetryable,
    attemptHistoryHash,
  });
}

function eventMessage(event) {
  const value = event.error?.message
    ?? event.error
    ?? event.message
    ?? event.item?.message
    ?? "";
  return typeof value === "string" ? value : "";
}

function stripAttemptHash(attempt) {
  const record = { ...attempt };
  delete record.attemptEvidenceHash;
  return record;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
