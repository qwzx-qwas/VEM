import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";

export const R4_MAX_RETRIES_PER_ARM = 1;
export const R4_MAX_PROCESS_ATTEMPTS = 20;
export const R4_DESTINATION = "OpenAI Codex service";
export const R4_MODEL = "gpt-5.6-sol";

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,160}$/u;
const TIMEOUT = /\b(?:request timed out|timed out|connection timeout|transport timeout)\b/iu;
const AUTH_OR_RATE_LIMIT =
  /\b(?:unauthorized|forbidden|authentication|invalid api key|rate limit|too many requests|quota)\b/iu;
const MAX_EVENTS = 512;
const MAX_TEXT_BYTES = 16 * 1024;

export function buildR4LocalTransportPreflight({
  codexVersion,
  permissionProbe,
  binaryPath = "/opt/codex/codex",
  destination = R4_DESTINATION,
  model = R4_MODEL,
}) {
  if (typeof codexVersion !== "string"
    || !/^codex-cli \d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(
      codexVersion.trim(),
    )
    || binaryPath !== "/opt/codex/codex"
    || destination !== R4_DESTINATION
    || model !== R4_MODEL
    || !permissionProbePassed(permissionProbe)) {
    throw new Error("R4_TRANSPORT_PREFLIGHT_INVALID");
  }
  return deepFreeze({
    schemaVersion: "R4-T2-local-transport-preflight-v1",
    ok: true,
    modelCall: false,
    destination,
    model,
    binaryPath,
    codexVersion: codexVersion.trim(),
    localRunnerCapabilityPassed: true,
    permissionProfilePassed: true,
    authReadableToGeneratedCommands: false,
    workspaceWritable: false,
    networkPolicyConfiguredDisabled: true,
    networkRuntimeProbed: false,
    providerReachabilityClaimed: false,
  });
}

export function classifyR4Attempt({
  process,
  finalResponse,
  events,
  capsuleAudit,
  permissionBoundaryPassed,
  evidenceSealed,
}) {
  if (!isRecord(process)
    || !(process.exitCode === null
      || Number.isInteger(process.exitCode)
        && process.exitCode >= 0
        && process.exitCode <= 255)
    || typeof process.launchFailed !== "boolean"
    || !isRecord(finalResponse)
    || !["present", "empty", "missing", "invalid"].includes(finalResponse.status)
    || !Array.isArray(events)
    || events.length > MAX_EVENTS
    || !events.every(validEvent)
    || !isRecord(capsuleAudit)
    || !["passed", "failed"].includes(capsuleAudit.status)
    || typeof permissionBoundaryPassed !== "boolean"
    || typeof evidenceSealed !== "boolean") {
    throw new Error("R4_TRANSPORT_ATTEMPT_INVALID");
  }
  const messages = events.map(eventMessage).filter(Boolean);
  const hasAuthOrRateLimit = messages.some((message) => (
    AUTH_OR_RATE_LIMIT.test(message)
  ));
  const hasAgentResponse = events.some((event) => (
    event.type === "item.completed" && event.item?.type === "agent_message"
  ));
  const completedCount = events.filter(
    (event) => event.type === "turn.completed",
  ).length;
  const failed = events.filter((event) => event.type === "turn.failed");
  const last = events.at(-1);
  const timeoutTerminal = failed.length === 1
    && last?.type === "turn.failed"
    && TIMEOUT.test(eventMessage(last));
  const emptyFinal = ["empty", "missing"].includes(finalResponse.status);
  const sealedBoundary = evidenceSealed === true
    && capsuleAudit.status === "passed"
    && capsuleAudit.valid === true
    && permissionBoundaryPassed === true;
  const retryable = process.launchFailed === false
    && Number.isInteger(process.exitCode)
    && process.exitCode !== 0
    && emptyFinal
    && !hasAgentResponse
    && completedCount === 0
    && !hasAuthOrRateLimit
    && timeoutTerminal
    && sealedBoundary;

  let kind = "protocol-or-unknown-failure";
  if (retryable) {
    kind = "external-transport-timeout-before-response";
  } else if (!sealedBoundary) {
    kind = "security-or-evidence-boundary-failure";
  } else if (!emptyFinal || hasAgentResponse || completedCount > 0) {
    kind = "partial-or-completed-response";
  } else if (hasAuthOrRateLimit) {
    kind = "authentication-or-rate-limit-failure";
  }
  return deepFreeze({
    schemaVersion: "R4-T2-transport-classification-v1",
    kind,
    retryable,
    evidence: {
      nonzeroExit: process.exitCode !== 0,
      launchFailed: process.launchFailed,
      emptyAuthoritativeResponse: emptyFinal,
      agentResponseObserved: hasAgentResponse,
      turnCompletedCount: completedCount,
      turnFailedCount: failed.length,
      timeoutTerminal,
      authOrRateLimitObserved: hasAuthOrRateLimit,
      capsuleAuditPassed: capsuleAudit.status === "passed"
        && capsuleAudit.valid === true,
      permissionBoundaryPassed,
      evidenceSealed,
    },
  });
}

export function sealR4AttemptEvidence({
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
    || attemptNumber > R4_MAX_RETRIES_PER_ARM + 1
    || !isRecord(classification)
    || classification.schemaVersion
      !== "R4-T2-transport-classification-v1"
    || typeof classification.retryable !== "boolean"
    || !isRecord(evidenceHashes)
    || Object.keys(evidenceHashes).length < 1
    || Object.entries(evidenceHashes).some(([path, hash]) => (
      !/^[A-Za-z0-9._/-]{1,256}$/u.test(path) || !HASH.test(hash)
    ))) {
    throw new Error("R4_ATTEMPT_EVIDENCE_INVALID");
  }
  const record = {
    schemaVersion: "R4-T2-sealed-attempt-v1",
    runId,
    armKey,
    attemptNumber,
    classification,
    evidenceHashes: Object.fromEntries(
      Object.entries(evidenceHashes).sort(([left], [right]) => (
        left.localeCompare(right)
      )),
    ),
    evidenceSealed: true,
  };
  return deepFreeze({
    ...record,
    attemptEvidenceHash: canonicalSha256(record),
  });
}

export function planR4Retry({
  armKey,
  attempts,
  batchProcessAttemptCount,
}) {
  if (!ID.test(armKey)
    || !Array.isArray(attempts)
    || attempts.length > R4_MAX_RETRIES_PER_ARM + 1
    || !Number.isSafeInteger(batchProcessAttemptCount)
    || batchProcessAttemptCount < attempts.length
    || batchProcessAttemptCount > R4_MAX_PROCESS_ATTEMPTS
    || attempts.some((attempt, index) => (
      !isRecord(attempt)
      || attempt.schemaVersion !== "R4-T2-sealed-attempt-v1"
      || attempt.armKey !== armKey
      || attempt.attemptNumber !== index + 1
      || attempt.evidenceSealed !== true
      || !HASH.test(attempt.attemptEvidenceHash)
      || canonicalSha256(stripAttemptHash(attempt))
        !== attempt.attemptEvidenceHash
    ))
    || new Set(attempts.map((attempt) => attempt.runId)).size
      !== attempts.length) {
    throw new Error("R4_RETRY_STATE_INVALID");
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
  if (attempts.length > R4_MAX_RETRIES_PER_ARM) {
    return decision("stop", "retry-exhausted", null, historyHash);
  }
  if (batchProcessAttemptCount >= R4_MAX_PROCESS_ATTEMPTS) {
    return decision("stop", "batch-attempt-budget-exhausted", null, historyHash);
  }
  return decision("retry", "sealed-timeout-before-response", 2, historyHash);
}

function decision(action, reason, nextAttemptNumber, attemptHistoryHash) {
  return deepFreeze({
    schemaVersion: "R4-T2-retry-decision-v1",
    action,
    reason,
    nextAttemptNumber,
    maxRetriesPerArm: R4_MAX_RETRIES_PER_ARM,
    maxProcessAttempts: R4_MAX_PROCESS_ATTEMPTS,
    attemptHistoryHash,
  });
}

function permissionProbePassed(probe) {
  return probe?.ok === true
    && probe.modelCall === false
    && probe.workspaceReadable === true
    && probe.workspaceWritable === false
    && probe.authReadable === false
    && probe.procEnvironmentReadable === true
    && probe.procEnvironmentSensitiveValuesAbsent === true
    && probe.networkPolicyConfiguredDisabled === true
    && probe.networkRuntimeProbed === false;
}

function validEvent(event) {
  if (!isRecord(event)
    || typeof event.type !== "string"
    || Buffer.byteLength(event.type, "utf8") > 128) return false;
  const message = eventMessage(event);
  return Buffer.byteLength(message, "utf8") <= MAX_TEXT_BYTES;
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
