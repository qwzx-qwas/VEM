import { createHash } from "node:crypto";
import {
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";

const HASH = /^[a-f0-9]{64}$/u;
const NS_PER_MS = 1_000_000n;
const MAX_OUTER_DEADLINE_MS = 1_200_000;
const MAX_TERMINAL_OBSERVATION_MARGIN_MS = 600_000;
const RECONNECT =
  /^Reconnecting\.\.\. ([1-9]\d*)\/([1-9]\d*) \(request timed out\)$/u;
const FALLBACK_MESSAGE =
  "Falling back from WebSockets to HTTPS transport. request timed out";
const HORIZON_PROVENANCE = Object.freeze([
  "explicit-model-provider-config",
  "version-bound-codex-instrumentation",
]);

export const R6_T7_IMMUTABLE_HASHES = deepFreeze({
  authorization:
    "f08b974449cbe3472fd68bc6def492b1348845c9c9afb0f7727e1f37265dc34d",
  resultsManifest:
    "2ba2b0537b4fb312e2e82cdd69a7c87b41d05b7117572c5b58978bd300e8fdd7",
  localPreflight:
    "36afe7753a484ba5a1fdd00e58a8dfa868b2090f5ecc1d25ba0e6fffdb938ffd",
  runIndex:
    "cea55223658df24837b5f3995c345e260c228343ccc431487ec82a6f7915c1f3",
  verdict:
    "1283979be6a67ed5298877f8ab30c0eca087f8a1fcf88d3032364a353d0acf96",
  attemptManifest:
    "13113f8ee9d46a1182be1d23eb4ec6784e7b9c4340543df3d4d7c7c7849a1e4b",
  run:
    "71d69a312de265fc62927f84f696d0835899f0b843fe284680c5a2a6d433d07a",
  boundary:
    "86947f11430fe6fa784ee7ae0bfe5cb7c8069e189a8784d3d171846478e0d547",
  failure:
    "e3ef8e5ddb751aa86a85df6467b7c247922ae52c65d35d0f4956ab25b35f2f17",
  termination:
    "fd83abe99da23ad800e80dd126d93517c44da51d5cec6ec772127a190d238c27",
  finalResponse:
    "824d7ba1b04fe34ce21393663e2cd4462fa5f3a23762f9454f8cc321dbdc6878",
  receiptLedger:
    "c6c81139ed97a267fb326c3f946495f8ffa011ad8a725fe9c9d928a41d77f215",
  stdout:
    "7bb2395a5ac1bab1fb31e1ef551030ac541221feeded730778c8dd8ea5316fb7",
  stderr:
    "222144eafad9289198d6830f8ad5af735a0e99b451106cefbed68dedac627d21",
});

export function replayR6T7DualTransportEvidence({
  evidenceHashes,
  localPreflight,
  runIndex,
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
    || localPreflight.schemaVersion !== "R6-T7-local-preflight-v1"
    || localPreflight.ok !== true
    || localPreflight.modelCall !== false
    || localPreflight.networkRuntimeProbed !== false
    || localPreflight.codexVersion !== "codex-cli 0.144.5"
    || !isRecord(runIndex)
    || runIndex.schemaVersion !== "R6-T7-run-index-v1"
    || runIndex.decisionAttempt !== 2
    || runIndex.supersedesAttempt !== "R6-T4"
    || runIndex.attemptOneResultManifestHash
      !== "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8"
    || runIndex.processAttemptCount !== 1
    || runIndex.successfulArmCount !== 0
    || runIndex.batchStopped !== true
    || !Array.isArray(runIndex.runIds)
    || runIndex.runIds.length !== 1
    || !isRecord(verdict)
    || verdict.schemaVersion !== "R6-T7-verdict-v1"
    || verdict.decisionAttempt !== 2
    || verdict.supersedesAttempt !== "R6-T4"
    || verdict.verdict !== "adjust"
    || !Array.isArray(verdict.adjustReasons)
    || !verdict.adjustReasons.includes(
      "runner-wall-clock-terminated-before-response",
    )
    || canonicalSha256(verdict) !== runIndex.verdictHash
    || !isRecord(run)
    || run.runId !== runIndex.runIds[0]
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
    || termination.forceSignalSent !== false
    || termination.policy?.deadlineMs !== 600_000
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
    throw new Error("R6_T8_REPLAY_INPUT_INVALID");
  }

  const entries = receiptLedger.entries;
  assertLedgerSequence(entries);
  const spawn = uniqueEntry(entries, "process-spawned");
  const signal = uniqueEntry(entries, "process-group-signal-sent");
  if (spawn.processGroupEstablished !== true
    || signal.signal !== "SIGTERM"
    || BigInt(signal.receivedAtNs) <= BigInt(spawn.receivedAtNs)) {
    throw new Error("R6_T8_REPLAY_TERMINATION_INVALID");
  }

  const chunks = jsonlChunks(stdout);
  const stdoutEntries = entries.filter(
    (entry) => entry.kind === "stdout-chunk-received",
  );
  if (chunks.length !== stdoutEntries.length) {
    throw new Error("R6_T8_REPLAY_STDOUT_LEDGER_MISMATCH");
  }
  const events = chunks.map((chunk, index) => {
    const receipt = stdoutEntries[index];
    const rawSha256 = sha256(chunk);
    if (receipt.rawSha256 !== rawSha256
      || receipt.bytes !== String(Buffer.byteLength(chunk, "utf8"))) {
      throw new Error("R6_T8_REPLAY_STDOUT_LEDGER_MISMATCH");
    }
    let event;
    try {
      event = JSON.parse(chunk);
    } catch {
      throw new Error("R6_T8_REPLAY_STDOUT_JSON_INVALID");
    }
    return {
      event,
      sequence: receipt.sequence,
      receivedAtNs: receipt.receivedAtNs,
      rawSha256,
    };
  });

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
    throw new Error("R6_T8_PROVIDER_TERMINAL_SEPARATION_FAILED");
  }

  const fallbacks = events.filter(({ event }) => (
    event.type === "item.completed"
      && event.item?.type === "error"
      && event.item?.message === FALLBACK_MESSAGE
  ));
  if (fallbacks.length !== 1) {
    throw new Error("R6_T8_TRANSPORT_FALLBACK_INVALID");
  }
  const fallback = fallbacks[0];
  const reconnects = events.flatMap(({ event, ...receipt }) => {
    if (event.type !== "error" || typeof event.message !== "string") return [];
    const match = RECONNECT.exec(event.message);
    if (match === null) return [];
    return [{
      attempt: Number(match[1]),
      maximum: Number(match[2]),
      transport: receipt.sequence < fallback.sequence
        ? "websocket"
        : "https",
      ...receipt,
    }];
  });
  const websocket = reconnects.filter(
    (item) => item.transport === "websocket",
  );
  const https = reconnects.filter((item) => item.transport === "https");
  assertReconnectPhase(websocket, [2, 3, 4, 5]);
  assertReconnectPhase(https, [1, 2, 3]);
  if (websocket.at(-1).sequence >= fallback.sequence
    || https[0].sequence <= fallback.sequence) {
    throw new Error("R6_T8_TRANSPORT_PHASE_ORDER_INVALID");
  }

  const spawnNs = BigInt(spawn.receivedAtNs);
  const withElapsed = (items) => items.map((item) => ({
    attempt: item.attempt,
    maximum: item.maximum,
    transport: item.transport,
    sequence: item.sequence,
    elapsedFromSpawnMs: ceilMs(BigInt(item.receivedAtNs) - spawnNs),
    rawSha256: item.rawSha256,
  }));
  const reconnectReceipts = withElapsed(reconnects);
  const duplicateCrossTransportReceipts = [...new Set(
    reconnects.map((item) => item.rawSha256),
  )].flatMap((rawSha256) => {
    const occurrences = reconnects.filter(
      (item) => item.rawSha256 === rawSha256,
    );
    return new Set(occurrences.map((item) => item.transport)).size > 1
      ? [{
          rawSha256,
          occurrences: withElapsed(occurrences),
        }]
      : [];
  }).sort((left, right) => left.rawSha256.localeCompare(right.rawSha256));
  if (duplicateCrossTransportReceipts.length !== 2) {
    throw new Error("R6_T8_DUPLICATE_RECEIPT_CORRELATION_INVALID");
  }

  const maxObservedHttpsReconnectGapMs = maxGapMs(https);
  const runnerDeadlineElapsedMs =
    ceilMs(BigInt(signal.receivedAtNs) - spawnNs);
  return deepFreeze({
    schemaVersion: "R6-T8-dual-transport-evidence-replay-v1",
    sourceTask: "R6-T7",
    sourceDecisionAttempt: 2,
    sourceVerdict: "adjust",
    supersedesAttempt: "R6-T4",
    codexVersion: localPreflight.codexVersion,
    clock: {
      domain: receiptLedger.clock.domain,
      provider: receiptLedger.clock.provider,
      unit: receiptLedger.clock.unit,
      origin: "process-spawned",
    },
    transportPhaseAttribution:
      "ordered-receipt-sequence-plus-fallback-boundary",
    rawHashUniquenessAssumed: false,
    fallbackReceipt: {
      sequence: fallback.sequence,
      elapsedFromSpawnMs:
        ceilMs(BigInt(fallback.receivedAtNs) - spawnNs),
      rawSha256: fallback.rawSha256,
    },
    reconnectReceipts,
    websocketReconnectAttempts: websocket.map((item) => item.attempt),
    httpsReconnectAttempts: https.map((item) => item.attempt),
    duplicateCrossTransportReceipts,
    duplicateCrossTransportRawHashCount:
      duplicateCrossTransportReceipts.length,
    maxObservedHttpsReconnectGapMs,
    runnerDeadlinePolicyMs: termination.policy.deadlineMs,
    runnerDeadlineElapsedMs,
    observedDualTransportTerminalHorizonLowerBoundMs: Math.max(
      termination.policy.deadlineMs,
      runnerDeadlineElapsedMs,
    ),
    providerTerminalObserved: false,
    authoritativeResponseObserved: false,
    retryHorizonObservation: "incomplete-lower-bound-only",
    reconnectLogAuthorizesRetry: false,
    classification: "runner-wall-clock-terminated-before-response",
    retryable: false,
    processTreeTerminated: true,
    evidenceSealed: true,
    evidenceHashes,
  });
}

export function deriveR6DualTransportDeadlineRequirements(replay) {
  if (!isRecord(replay)
    || replay.schemaVersion
      !== "R6-T8-dual-transport-evidence-replay-v1"
    || replay.sourceVerdict !== "adjust"
    || replay.providerTerminalObserved !== false
    || replay.authoritativeResponseObserved !== false
    || replay.retryHorizonObservation !== "incomplete-lower-bound-only"
    || replay.reconnectLogAuthorizesRetry !== false
    || replay.retryable !== false
    || replay.processTreeTerminated !== true
    || replay.evidenceSealed !== true
    || replay.transportPhaseAttribution
      !== "ordered-receipt-sequence-plus-fallback-boundary"
    || replay.rawHashUniquenessAssumed !== false
    || replay.duplicateCrossTransportRawHashCount < 1
    || !Number.isSafeInteger(
      replay.observedDualTransportTerminalHorizonLowerBoundMs,
    )
    || !Number.isSafeInteger(replay.maxObservedHttpsReconnectGapMs)) {
    throw new Error("R6_T8_REQUIREMENTS_REPLAY_INVALID");
  }
  const minimumExplicitProviderTerminalHorizonMs =
    replay.observedDualTransportTerminalHorizonLowerBoundMs + 1;
  const minimumTerminalObservationMarginMs = Math.max(
    5_000 + 5_000,
    replay.maxObservedHttpsReconnectGapMs * 2,
  );
  const minimumOuterDeadlineMs =
    minimumExplicitProviderTerminalHorizonMs
      + minimumTerminalObservationMarginMs;
  if (minimumOuterDeadlineMs > MAX_OUTER_DEADLINE_MS
    || minimumTerminalObservationMarginMs
      > MAX_TERMINAL_OBSERVATION_MARGIN_MS) {
    return boundedDisposition(replay, {
      disposition: "stop-no-bounded-envelope",
      minimumExplicitProviderTerminalHorizonMs,
      minimumTerminalObservationMarginMs,
      minimumOuterDeadlineMs,
      boundedEnvelopeAvailable: false,
    });
  }
  return boundedDisposition(replay, {
    disposition: "continue-to-preregistration-only",
    minimumExplicitProviderTerminalHorizonMs,
    minimumTerminalObservationMarginMs,
    minimumOuterDeadlineMs,
    boundedEnvelopeAvailable: true,
  });
}

export function validateR6AttemptThreeDeadlineCandidate({
  requirements,
  candidate,
}) {
  if (!isRecord(requirements)
    || requirements.schemaVersion
      !== "R6-T8-dual-transport-deadline-compatibility-contract-v1"
    || !HASH.test(requirements.contractHash ?? "")
    || canonicalSha256(withoutHash(requirements, "contractHash"))
      !== requirements.contractHash
    || requirements.boundedEnvelopeAvailable !== true
    || requirements.disposition !== "continue-to-preregistration-only"
    || !isRecord(candidate)
    || candidate.schemaVersion !== "R6-T9-deadline-candidate-v1"
    || candidate.dualTransportContractHash !== requirements.contractHash
    || !isRecord(candidate.terminalHorizonProvenance)
    || !HORIZON_PROVENANCE.includes(
      candidate.terminalHorizonProvenance.kind,
    )
    || !HASH.test(candidate.terminalHorizonProvenance.evidenceHash ?? "")
    || candidate.terminalHorizonProvenance.codexVersion
      !== candidate.codexVersion
    || typeof candidate.codexVersion !== "string"
    || !Number.isSafeInteger(candidate.providerTerminalHorizonMs)
    || candidate.providerTerminalHorizonMs
      < requirements.minimumExplicitProviderTerminalHorizonMs
    || !Number.isSafeInteger(candidate.terminalObservationMarginMs)
    || candidate.terminalObservationMarginMs
      < requirements.minimumTerminalObservationMarginMs
    || candidate.terminalObservationMarginMs
      > requirements.maximumTerminalObservationMarginMs
    || !Number.isSafeInteger(candidate.deadlineMs)
    || candidate.deadlineMs !== candidate.providerTerminalHorizonMs
      + candidate.terminalObservationMarginMs
    || candidate.deadlineMs < requirements.minimumOuterDeadlineMs
    || candidate.deadlineMs > requirements.maximumOuterDeadlineMs
    || candidate.clockDomain !== requirements.clockDomain
    || candidate.deadlineOrigin !== requirements.deadlineOrigin
    || canonicalSha256(candidate.terminationPolicy)
      !== canonicalSha256(requirements.terminationPolicyPreserved)
    || candidate.externalExecutionAuthorized !== false) {
    throw new Error("R6_T8_ATTEMPT_THREE_DEADLINE_CANDIDATE_INVALID");
  }
  const record = {
    schemaVersion: "R6-T8-validated-deadline-candidate-v1",
    requirementsHash: requirements.contractHash,
    candidate,
    bounded: true,
    providerTerminalHorizonExplicit: true,
    orderedTransportReceiptsBound: true,
    reconnectLogUsedAsTerminal: false,
    runnerTerminationRetryable: false,
    priorAttemptEvidenceOverwritten: false,
    externalExecutionAuthorized: false,
  };
  return deepFreeze({
    ...record,
    candidateHash: canonicalSha256(record),
  });
}

function boundedDisposition(replay, disposition) {
  const record = {
    schemaVersion:
      "R6-T8-dual-transport-deadline-compatibility-contract-v1",
    sourceReplayHash: canonicalSha256(replay),
    transportPhaseAttribution:
      "ordered-receipt-sequence-plus-fallback-boundary",
    rawHashUniquenessAssumed: false,
    duplicateCrossTransportRawHashCount:
      replay.duplicateCrossTransportRawHashCount,
    previousMaximumOuterDeadlineMs: 600_000,
    previousMaximumExhausted: true,
    terminalHorizonMustBeExplicit: true,
    reconnectLogInferenceForbidden: true,
    terminalHorizonProvenanceAllowlist: HORIZON_PROVENANCE,
    ...disposition,
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
    exactAttemptThreeDeadlineSelected: false,
    policySelectionDeferredToTask: disposition.boundedEnvelopeAvailable
      ? "R6-T9"
      : null,
    externalExecutionAuthorized: false,
  };
  return deepFreeze({
    ...record,
    contractHash: canonicalSha256(record),
  });
}

function requireExactHashes(evidenceHashes) {
  if (!isRecord(evidenceHashes)
    || canonicalSha256(evidenceHashes)
      !== canonicalSha256(R6_T7_IMMUTABLE_HASHES)) {
    throw new Error("R6_T8_ATTEMPT_TWO_EVIDENCE_CHANGED");
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
    throw new Error("R6_T8_RECEIPT_LEDGER_INVALID");
  }
}

function uniqueEntry(entries, kind) {
  const matches = entries.filter((entry) => entry.kind === kind);
  if (matches.length !== 1) throw new Error("R6_T8_RECEIPT_LEDGER_INVALID");
  return matches[0];
}

function assertReconnectPhase(items, expectedAttempts) {
  if (items.length !== expectedAttempts.length
    || items.some((item, index) => (
      item.transport !== (expectedAttempts[0] === 1 ? "https" : "websocket")
        || item.maximum !== 5
        || item.attempt !== expectedAttempts[index]
        || (index > 0 && item.sequence <= items[index - 1].sequence)
    ))) {
    throw new Error("R6_T8_RECONNECT_PHASE_INVALID");
  }
}

function maxGapMs(items) {
  if (items.length < 2) throw new Error("R6_T8_RECONNECT_PHASE_INVALID");
  return items.slice(1).reduce((maximum, item, index) => {
    const gap = ceilMs(
      BigInt(item.receivedAtNs) - BigInt(items[index].receivedAtNs),
    );
    return gap > maximum ? gap : maximum;
  }, 0);
}

function jsonlChunks(value) {
  const chunks = value.match(/[^\n]*\n/gu) ?? [];
  if (chunks.length === 0 || chunks.join("") !== value) {
    throw new Error("R6_T8_REPLAY_STDOUT_JSON_INVALID");
  }
  return chunks;
}

function ceilMs(value) {
  if (value < 0n) throw new Error("R6_T8_NEGATIVE_DURATION");
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
