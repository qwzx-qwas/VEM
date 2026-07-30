import { createHash } from "node:crypto";
import {
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";

const HASH = /^[a-f0-9]{64}$/u;
const NS_PER_MS = 1_000_000n;
const MAX_OUTER_DEADLINE_MS = 600_000;
const MAX_TERMINAL_OBSERVATION_MARGIN_MS = 120_000;
const RECONNECT = /^Reconnecting\.\.\. ([1-9]\d*)\/([1-9]\d*) \(request timed out\)$/u;
const HORIZON_PROVENANCE = Object.freeze([
  "explicit-model-provider-config",
  "version-bound-codex-instrumentation",
]);

export const R6_T4_IMMUTABLE_HASHES = deepFreeze({
  resultsManifest:
    "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8",
  localPreflight:
    "807425d284de90cea11e3fbca02663ac14f9e25520c55149576a69edbad0d2d7",
  verdict:
    "acf6fab787681e5ab7bb9213a9553ed950e4809ad167e1dad82f3ca6a7aa6902",
  run:
    "5754069382666273c143d62751e98825f1aa0ae60e6984a8f2cccf687784c712",
  boundary:
    "843a893411a311d8bd66ed2c87a56962ec1ce85891736a4ac7a03d9b1c8d4af9",
  termination:
    "c342d271d26753275c49f4ea37451c01c01650f94d6122aeda00ec1ee393927d",
  finalResponse:
    "824d7ba1b04fe34ce21393663e2cd4462fa5f3a23762f9454f8cc321dbdc6878",
  receiptLedger:
    "909f994dbd9a1d68ff60dc97242fd71bee4e8ce00a77cb12a4c2a00b0c8920ea",
  stdout:
    "6890de3f47dac54f8582a255b7295113cac1cb753675ac0a2bdf3bf31f7c89a9",
});

export function replayR6T4DeadlineEvidence({
  evidenceHashes,
  localPreflight,
  verdict,
  run,
  boundary,
  termination,
  finalResponse,
  receiptLedger,
  stdout,
}) {
  requireExactHashes(evidenceHashes);
  if (!isRecord(localPreflight)
    || localPreflight.schemaVersion !== "R6-T4-local-preflight-v1"
    || localPreflight.ok !== true
    || localPreflight.modelCall !== false
    || localPreflight.networkRuntimeProbed !== false
    || typeof localPreflight.codexVersion !== "string"
    || !isRecord(verdict)
    || verdict.schemaVersion !== "R6-T4-verdict-v1"
    || verdict.decisionAttempt !== 1
    || verdict.verdict !== "adjust"
    || !Array.isArray(verdict.adjustReasons)
    || !verdict.adjustReasons.includes(
      "runner-wall-clock-terminated-before-response",
    )
    || !isRecord(run)
    || run.outcome !== "terminated"
    || run.deadlineExpired !== true
    || run.processTreeTerminated !== true
    || run.providerTurnFailedObserved !== false
    || run.providerTerminalInvented !== false
    || run.evidenceSealedBeforeReturn !== true
    || !Array.isArray(run.failureCodes)
    || !run.failureCodes.includes("R5_WALL_CLOCK_DEADLINE")
    || !run.failureCodes.includes("R5_FINAL_RESPONSE_EMPTY")
    || !isRecord(boundary)
    || boundary.audit?.status !== "passed"
    || boundary.audit?.valid !== true
    || boundary.permission?.status !== "passed"
    || boundary.permission?.permissionProfilePassed !== true
    || boundary.evaluator?.status !== "passed"
    || boundary.evaluator?.valid !== true
    || !isRecord(termination)
    || termination.trigger !== "wall-clock-deadline"
    || termination.deadlineExpired !== true
    || termination.providerTurnFailedObserved !== false
    || termination.providerTerminalInvented !== false
    || termination.processGroupEstablished !== true
    || termination.processGroupEmptyAfterTermination !== true
    || termination.gracefulSignalSent !== true
    || termination.policy?.deadlineMs !== 120_000
    || termination.policy?.graceMs !== 5_000
    || termination.policy?.forceKillWaitMs !== 5_000
    || termination.policy?.gracefulSignal !== "SIGTERM"
    || termination.policy?.forceSignal !== "SIGKILL"
    || !isRecord(finalResponse)
    || finalResponse.status !== "empty"
    || finalResponse.bytes !== "0"
    || finalResponse.rawSha256
      !== "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    || !isRecord(receiptLedger)
    || receiptLedger.schemaVersion !== "R5-T2-terminal-receipt-ledger-v1"
    || receiptLedger.clock?.domain !== "node:process.hrtime.bigint"
    || receiptLedger.clock?.provider !== "trusted-outer-runner"
    || receiptLedger.clock?.unit !== "nanoseconds"
    || !Array.isArray(receiptLedger.entries)
    || receiptLedger.entries.length !== receiptLedger.entryCount
    || typeof stdout !== "string") {
    throw new Error("R6_T5_REPLAY_INPUT_INVALID");
  }

  const entries = receiptLedger.entries;
  assertLedgerSequence(entries);
  const spawn = uniqueEntry(entries, "process-spawned");
  const signal = uniqueEntry(entries, "process-group-signal-sent");
  if (spawn.processGroupEstablished !== true
    || signal.signal !== "SIGTERM"
    || BigInt(signal.receivedAtNs) <= BigInt(spawn.receivedAtNs)) {
    throw new Error("R6_T5_REPLAY_TERMINATION_INVALID");
  }

  const chunks = jsonlChunks(stdout);
  const stdoutEntries = entries.filter(
    (entry) => entry.kind === "stdout-chunk-received",
  );
  if (chunks.length !== stdoutEntries.length) {
    throw new Error("R6_T5_REPLAY_STDOUT_LEDGER_MISMATCH");
  }
  const events = chunks.map((chunk) => {
    const rawSha256 = sha256(chunk);
    const matches = stdoutEntries.filter(
      (entry) => entry.rawSha256 === rawSha256,
    );
    if (matches.length !== 1
      || matches[0].bytes !== String(Buffer.byteLength(chunk, "utf8"))) {
      throw new Error("R6_T5_REPLAY_STDOUT_LEDGER_MISMATCH");
    }
    let event;
    try {
      event = JSON.parse(chunk);
    } catch {
      throw new Error("R6_T5_REPLAY_STDOUT_JSON_INVALID");
    }
    return {
      event,
      sequence: matches[0].sequence,
      receivedAtNs: matches[0].receivedAtNs,
      rawSha256,
    };
  }).sort((left, right) => left.sequence - right.sequence);

  if (events.filter(({ event }) => event.type === "thread.started").length !== 1
    || events.filter(({ event }) => event.type === "turn.started").length !== 1
    || events.some(({ event }) => (
      event.type === "turn.failed"
        || event.type === "turn.completed"
        || (
          event.type === "item.completed"
            && event.item?.type === "agent_message"
        )
    ))) {
    throw new Error("R6_T5_PROVIDER_TERMINAL_SEPARATION_FAILED");
  }

  const reconnects = events.flatMap(({ event, ...receipt }) => {
    if (event.type !== "error" || typeof event.message !== "string") return [];
    const match = RECONNECT.exec(event.message);
    if (match === null) return [];
    return [{
      attempt: Number(match[1]),
      maximum: Number(match[2]),
      ...receipt,
    }];
  });
  if (reconnects.length < 2
    || reconnects.some((item) => (
      !Number.isSafeInteger(item.attempt)
        || !Number.isSafeInteger(item.maximum)
        || item.attempt > item.maximum
        || item.maximum !== reconnects[0].maximum
    ))
    || reconnects.some((item, index) => (
      index > 0 && item.attempt !== reconnects[index - 1].attempt + 1
    ))) {
    throw new Error("R6_T5_RECONNECT_SEQUENCE_INVALID");
  }
  const spawnNs = BigInt(spawn.receivedAtNs);
  const reconnectReceipts = reconnects.map((item) => ({
    attempt: item.attempt,
    maximum: item.maximum,
    sequence: item.sequence,
    elapsedFromSpawnMs: ceilMs(BigInt(item.receivedAtNs) - spawnNs),
    rawSha256: item.rawSha256,
  }));
  const gaps = reconnects.slice(1).map((item, index) => (
    BigInt(item.receivedAtNs) - BigInt(reconnects[index].receivedAtNs)
  ));
  const maxObservedGapMs = ceilMs(gaps.reduce(
    (maximum, value) => value > maximum ? value : maximum,
    0n,
  ));
  const deadlineElapsedMs = ceilMs(BigInt(signal.receivedAtNs) - spawnNs);
  return deepFreeze({
    schemaVersion: "R6-T5-deadline-evidence-replay-v1",
    sourceTask: "R6-T4",
    sourceDecisionAttempt: 1,
    sourceVerdict: "adjust",
    codexVersion: localPreflight.codexVersion,
    clock: {
      domain: receiptLedger.clock.domain,
      provider: receiptLedger.clock.provider,
      unit: receiptLedger.clock.unit,
      origin: "process-spawned",
    },
    reconnectReceipts,
    reconnectMaximum: reconnects[0].maximum,
    lastObservedReconnectAttempt: reconnects.at(-1).attempt,
    maxObservedReconnectGapMs: maxObservedGapMs,
    runnerDeadlinePolicyMs: termination.policy.deadlineMs,
    runnerDeadlineElapsedMs: deadlineElapsedMs,
    providerTerminalObserved: false,
    authoritativeResponseObserved: false,
    retryHorizonObservation: "incomplete-lower-bound-only",
    observedProviderRetryHorizonLowerBoundMs: deadlineElapsedMs,
    reconnectLogAuthorizesRetry: false,
    classification: "runner-wall-clock-terminated-before-response",
    retryable: false,
    processTreeTerminated: true,
    evidenceSealed: true,
    evidenceHashes,
  });
}

export function deriveR6DeadlineRequirements(replay) {
  if (!isRecord(replay)
    || replay.schemaVersion !== "R6-T5-deadline-evidence-replay-v1"
    || replay.sourceVerdict !== "adjust"
    || replay.providerTerminalObserved !== false
    || replay.authoritativeResponseObserved !== false
    || replay.retryHorizonObservation !== "incomplete-lower-bound-only"
    || replay.reconnectLogAuthorizesRetry !== false
    || replay.retryable !== false
    || replay.processTreeTerminated !== true
    || replay.evidenceSealed !== true
    || !Number.isSafeInteger(replay.observedProviderRetryHorizonLowerBoundMs)
    || !Number.isSafeInteger(replay.maxObservedReconnectGapMs)) {
    throw new Error("R6_T5_REQUIREMENTS_REPLAY_INVALID");
  }
  const minimumExplicitProviderRetryHorizonMs =
    replay.observedProviderRetryHorizonLowerBoundMs + 1;
  const minimumTerminalObservationMarginMs = Math.max(
    5_000 + 5_000,
    replay.maxObservedReconnectGapMs * 2,
  );
  const record = {
    schemaVersion: "R6-T5-deadline-compatibility-contract-v1",
    sourceReplayHash: canonicalSha256(replay),
    retryHorizonMustBeExplicit: true,
    reconnectLogInferenceForbidden: true,
    retryHorizonProvenanceAllowlist: HORIZON_PROVENANCE,
    minimumExplicitProviderRetryHorizonMs,
    minimumTerminalObservationMarginMs,
    minimumOuterDeadlineMs:
      minimumExplicitProviderRetryHorizonMs
        + minimumTerminalObservationMarginMs,
    maximumOuterDeadlineMs: MAX_OUTER_DEADLINE_MS,
    maximumTerminalObservationMarginMs:
      MAX_TERMINAL_OBSERVATION_MARGIN_MS,
    clockDomain: "node:process.hrtime.bigint",
    deadlineOrigin: "process-spawned",
    terminationPolicyPreserved: {
      graceMs: 5_000,
      forceObservationMs: 5_000,
      gracefulSignal: "SIGTERM",
      forceSignal: "SIGKILL",
      maxRetriesPerArm: 1,
      maxProcessAttempts: 20,
      runnerTerminationRetryable: false,
      everyAttemptConsumesBudget: true,
      everyAttemptEvidenceRetained: true,
    },
    exactAttemptTwoDeadlineSelected: false,
    policySelectionDeferredToTask: "R6-T6",
    externalExecutionAuthorized: false,
  };
  return deepFreeze({
    ...record,
    contractHash: canonicalSha256(record),
  });
}

export function validateR6AttemptTwoDeadlineCandidate({
  requirements,
  candidate,
}) {
  if (!isRecord(requirements)
    || requirements.schemaVersion
      !== "R6-T5-deadline-compatibility-contract-v1"
    || !HASH.test(requirements.contractHash ?? "")
    || canonicalSha256(withoutHash(requirements, "contractHash"))
      !== requirements.contractHash
    || !isRecord(candidate)
    || candidate.schemaVersion !== "R6-T6-deadline-candidate-v1"
    || !isRecord(candidate.retryHorizonProvenance)
    || !HORIZON_PROVENANCE.includes(candidate.retryHorizonProvenance.kind)
    || !HASH.test(candidate.retryHorizonProvenance.evidenceHash ?? "")
    || candidate.retryHorizonProvenance.codexVersion
      !== candidate.codexVersion
    || candidate.codexVersion !== candidate.retryHorizonProvenance.codexVersion
    || typeof candidate.codexVersion !== "string"
    || !Number.isSafeInteger(candidate.providerRetryHorizonMs)
    || candidate.providerRetryHorizonMs
      < requirements.minimumExplicitProviderRetryHorizonMs
    || !Number.isSafeInteger(candidate.terminalObservationMarginMs)
    || candidate.terminalObservationMarginMs
      < requirements.minimumTerminalObservationMarginMs
    || candidate.terminalObservationMarginMs
      > requirements.maximumTerminalObservationMarginMs
    || !Number.isSafeInteger(candidate.deadlineMs)
    || candidate.deadlineMs !== candidate.providerRetryHorizonMs
      + candidate.terminalObservationMarginMs
    || candidate.deadlineMs < requirements.minimumOuterDeadlineMs
    || candidate.deadlineMs > requirements.maximumOuterDeadlineMs
    || candidate.clockDomain !== requirements.clockDomain
    || candidate.deadlineOrigin !== requirements.deadlineOrigin
    || canonicalSha256(candidate.terminationPolicy)
      !== canonicalSha256(requirements.terminationPolicyPreserved)
    || candidate.externalExecutionAuthorized !== false) {
    throw new Error("R6_T5_ATTEMPT_TWO_DEADLINE_CANDIDATE_INVALID");
  }
  const record = {
    schemaVersion: "R6-T5-validated-deadline-candidate-v1",
    requirementsHash: requirements.contractHash,
    candidate,
    bounded: true,
    providerRetryHorizonExplicit: true,
    reconnectLogUsedAsTerminal: false,
    runnerTerminationRetryable: false,
    attemptOneEvidenceOverwritten: false,
    externalExecutionAuthorized: false,
  };
  return deepFreeze({
    ...record,
    candidateHash: canonicalSha256(record),
  });
}

function requireExactHashes(evidenceHashes) {
  if (!isRecord(evidenceHashes)
    || canonicalSha256(evidenceHashes)
      !== canonicalSha256(R6_T4_IMMUTABLE_HASHES)) {
    throw new Error("R6_T5_ATTEMPT_ONE_EVIDENCE_CHANGED");
  }
}

function assertLedgerSequence(entries) {
  if (entries.some((entry, index) => (
    !isRecord(entry)
      || entry.sequence !== index
      || !/^\d+$/u.test(entry.receivedAtNs ?? "")
      || (index > 0
        && BigInt(entry.receivedAtNs) < BigInt(entries[index - 1].receivedAtNs))
  ))) {
    throw new Error("R6_T5_RECEIPT_LEDGER_INVALID");
  }
}

function uniqueEntry(entries, kind) {
  const matches = entries.filter((entry) => entry.kind === kind);
  if (matches.length !== 1) throw new Error("R6_T5_RECEIPT_LEDGER_INVALID");
  return matches[0];
}

function jsonlChunks(value) {
  const chunks = value.match(/[^\n]*\n/gu) ?? [];
  if (chunks.length === 0 || chunks.join("") !== value) {
    throw new Error("R6_T5_REPLAY_STDOUT_JSON_INVALID");
  }
  return chunks;
}

function ceilMs(value) {
  if (value < 0n) throw new Error("R6_T5_NEGATIVE_DURATION");
  return Number((value + NS_PER_MS - 1n) / NS_PER_MS);
}

function withoutHash(value, key) {
  return Object.fromEntries(
    Object.entries(value).filter(([candidate]) => candidate !== key),
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
