import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import { classifyR6Attempt } from "./r6-attempt-policy.mjs";

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,160}$/u;
const SELECTED_CLASS =
  "sealed-network-fallback-plus-nontimeout-provider-terminal-before-response";
const FALLBACK =
  /^Falling back from WebSockets to HTTPS transport\. stream disconnected before completion: Network unreachable \(os error 101\)$/u;
const TERMINAL =
  /^stream disconnected before completion: error sending request for url \(https:\/\/chatgpt\.com\/backend-api\/codex\/responses\)$/u;

export const R6_T12_SELECTED_FAILURE_CLASS = SELECTED_CLASS;

export function validateR6AttemptFourFailureCandidate({
  requirements,
  candidate,
}) {
  if (!isRecord(requirements)
    || requirements.schemaVersion
      !== "R6-T11-provider-terminal-compatibility-contract-v1"
    || !HASH.test(requirements.contractHash ?? "")
    || canonicalSha256(withoutHash(requirements, "contractHash"))
      !== requirements.contractHash
    || requirements.disposition !== "continue-to-preregistration-only"
    || requirements.boundedRemediationAvailable !== true
    || requirements.preservedAttemptThreeRetryable !== false
    || requirements.providerTimeoutClassUnchanged !== true
    || requirements.compatibleFutureClass !== SELECTED_CLASS
    || requirements.compatibleFutureClassIsTimeout !== false
    || requirements.compatibleFutureClassRootCauseClaimed !== false
    || requirements.unknownOrDifferentNonTimeoutTerminalRetryable !== false
    || requirements.maxRetriesPerArm !== 1
    || requirements.maxProcessAttempts !== 20
    || requirements.exactAttemptFourPolicySelected !== false
    || requirements.externalExecutionAuthorized !== false
    || !Array.isArray(requirements.futureEligibilityRequiredEvidence)
    || !isRecord(candidate)
    || candidate.schemaVersion !== "R6-T12-failure-policy-candidate-v1"
    || candidate.compatibilityContractHash !== requirements.contractHash
    || candidate.selectedClass !== SELECTED_CLASS
    || candidate.selectedClassIsTimeout !== false
    || candidate.rootCauseClaimed !== false
    || canonicalSha256(candidate.requiredEvidence)
      !== canonicalSha256(requirements.futureEligibilityRequiredEvidence)
    || canonicalSha256(candidate.retryableClassifications)
      !== canonicalSha256([
        "external-transport-timeout-before-response",
        SELECTED_CLASS,
      ])
    || candidate.unknownOrDifferentNonTimeoutTerminalRetryable !== false
    || candidate.maxRetriesPerArm !== 1
    || candidate.maxProcessAttempts !== 20
    || candidate.everyAttemptConsumesBudget !== true
    || candidate.everyAttemptEvidenceRetained !== true
    || candidate.attemptThreeClassificationChanged !== false
    || candidate.externalExecutionAuthorized !== false) {
    throw new Error("R6_T12_FAILURE_POLICY_CANDIDATE_INVALID");
  }
  const record = {
    schemaVersion: "R6-T12-validated-failure-policy-v1",
    requirementsHash: requirements.contractHash,
    candidate,
    bounded: true,
    selectedClassEvidenceConjunctive: true,
    providerTimeoutClassPreserved: true,
    reconnectTimeoutUsedAsTerminal: false,
    attemptThreeClassificationChanged: false,
    priorAttemptEvidenceOverwritten: false,
    externalExecutionAuthorized: false,
  };
  return deepFreeze({
    ...record,
    candidateHash: canonicalSha256(record),
  });
}

export function classifyR6AttemptFour({
  run,
  termination,
  finalResponse,
  boundary,
  events,
  evidenceSealed,
  failurePolicy,
}) {
  requireValidatedPolicy(failurePolicy);
  const base = classifyR6Attempt({
    run,
    termination,
    finalResponse,
    boundary,
    events,
    evidenceSealed,
  });
  const final = events.at(-1);
  const terminalMessage = eventMessage(final);
  const fallbackCount = events.filter((event) => (
    event?.type === "item.completed"
      && event.item?.type === "error"
      && FALLBACK.test(event.item?.message ?? "")
  )).length;
  const matchingPrecursorCount = events.filter((event) => (
    event?.type === "error" && event.message === terminalMessage
  )).length;
  const selected = base.kind === "protocol-or-unknown-failure"
    && base.retryable === false
    && base.evidence.sealedBoundary === true
    && base.evidence.providerTurnFailedObserved === true
    && base.evidence.providerTimeout === false
    && base.evidence.runnerDeadline === false
    && base.evidence.finalEmpty === true
    && base.evidence.agentResponseObserved === false
    && base.evidence.turnCompletedCount === 0
    && base.evidence.turnFailedCount === 1
    && final?.type === "turn.failed"
    && TERMINAL.test(terminalMessage)
    && !/timed out/iu.test(terminalMessage)
    && fallbackCount === 1
    && matchingPrecursorCount === 1
    && termination?.trigger === "process-exit"
    && termination.deadlineExpired === false
    && Number.isSafeInteger(termination.process?.exitCode)
    && termination.process.exitCode !== 0
    && termination.process?.signal === null
    && termination.processGroupEmptyAfterTermination === true;
  return deepFreeze({
    schemaVersion: "R6-T12-attempt-classification-v1",
    kind: selected ? SELECTED_CLASS : base.kind,
    retryable: selected ? true : base.retryable,
    evidence: {
      ...base.evidence,
      orderedNetworkFallbackObserved: fallbackCount === 1,
      nonTimeoutErrorSendingTerminalObserved:
        final?.type === "turn.failed"
          && TERMINAL.test(terminalMessage)
          && !/timed out/iu.test(terminalMessage),
      matchingTerminalPrecursorCount: matchingPrecursorCount,
      selectedClassEvidenceConjunctionPassed: selected,
      attemptThreeClassificationChanged: false,
    },
  });
}

export function sealR6AttemptFourEvidence({
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
    || attemptNumber > 2
    || classification?.schemaVersion !== "R6-T12-attempt-classification-v1"
    || typeof classification.retryable !== "boolean"
    || !isRecord(evidenceHashes)
    || Object.keys(evidenceHashes).length < 1
    || Object.entries(evidenceHashes).some(([path, hash]) => (
      !/^[A-Za-z0-9._/-]{1,256}$/u.test(path) || !HASH.test(hash)
    ))) {
    throw new Error("R6_T12_ATTEMPT_EVIDENCE_INVALID");
  }
  const record = {
    schemaVersion: "R6-T12-sealed-attempt-v1",
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

export function planR6AttemptFourRetry({
  armKey,
  attempts,
  batchProcessAttemptCount,
}) {
  if (!ID.test(armKey)
    || !Array.isArray(attempts)
    || attempts.length > 2
    || !Number.isSafeInteger(batchProcessAttemptCount)
    || batchProcessAttemptCount < attempts.length
    || batchProcessAttemptCount > 20
    || attempts.some((attempt, index) => (
      attempt?.schemaVersion !== "R6-T12-sealed-attempt-v1"
        || attempt.armKey !== armKey
        || attempt.attemptNumber !== index + 1
        || attempt.evidenceSealed !== true
        || !HASH.test(attempt.attemptEvidenceHash ?? "")
        || canonicalSha256(withoutHash(attempt, "attemptEvidenceHash"))
          !== attempt.attemptEvidenceHash
    ))
    || new Set(attempts.map(({ runId }) => runId)).size !== attempts.length) {
    throw new Error("R6_T12_RETRY_STATE_INVALID");
  }
  const historyHash = canonicalSha256(
    attempts.map(({ attemptEvidenceHash }) => attemptEvidenceHash),
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
  if (attempts.length > 1) {
    return decision("stop", "retry-exhausted", null, historyHash);
  }
  if (batchProcessAttemptCount >= 20) {
    return decision("stop", "batch-attempt-budget-exhausted", null, historyHash);
  }
  return decision(
    "retry",
    last.classification.kind === SELECTED_CLASS
      ? "sealed-selected-nontimeout-terminal-before-response"
      : "sealed-provider-timeout-before-response",
    2,
    historyHash,
  );
}

function requireValidatedPolicy(policy) {
  if (!isRecord(policy)
    || policy.schemaVersion !== "R6-T12-validated-failure-policy-v1"
    || !HASH.test(policy.candidateHash ?? "")
    || canonicalSha256(withoutHash(policy, "candidateHash"))
      !== policy.candidateHash
    || policy.candidate?.selectedClass !== SELECTED_CLASS
    || policy.bounded !== true
    || policy.externalExecutionAuthorized !== false) {
    throw new Error("R6_T12_VALIDATED_POLICY_INVALID");
  }
}

function decision(action, reason, nextAttemptNumber, attemptHistoryHash) {
  return deepFreeze({
    schemaVersion: "R6-T12-retry-decision-v1",
    action,
    reason,
    nextAttemptNumber,
    maxRetriesPerArm: 1,
    maxProcessAttempts: 20,
    runnerTerminationRetryable: false,
    attemptHistoryHash,
  });
}

function eventMessage(event) {
  const value = event?.error?.message ?? event?.error ?? event?.message ?? "";
  return typeof value === "string" ? value : "";
}

function withoutHash(value, key) {
  return Object.fromEntries(
    Object.entries(value).filter(([candidate]) => candidate !== key),
  );
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
