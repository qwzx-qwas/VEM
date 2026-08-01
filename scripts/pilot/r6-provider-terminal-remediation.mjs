import { createHash } from "node:crypto";
import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import { classifyR6Attempt } from "./r6-attempt-policy.mjs";

const NS_PER_MS = 1_000_000n;
const RECONNECT =
  /^Reconnecting\.\.\. ([1-9]\d*)\/([1-9]\d*) \(request timed out\)$/u;
const FALLBACK =
  /^Falling back from WebSockets to HTTPS transport\. stream disconnected before completion: Network unreachable \(os error 101\)$/u;
const PROVIDER_TERMINAL =
  /^stream disconnected before completion: error sending request for url \(https:\/\/chatgpt\.com\/backend-api\/codex\/responses\)$/u;

export const R6_T11_IMMUTABLE_HASHES = deepFreeze({
  authorization:
    "996303410562ca181303e086a896b199546d632e4deae209276f9a8f48aacdeb",
  resultsManifest:
    "a45f1970978996cdbe8df8b99e7b09fd3fbcf4865f76d8eeb504dcde2bead13b",
  localPreflight:
    "cb8aeb618c927ac17e48ca9f9ec9064eb4b708b560436b4d7197e442c3463e5f",
  runIndex:
    "df9f95141b63b6c11369aeeb6b8b62f8a3c3e05126d273e047f602465dbf139c",
  verdict:
    "d1550d8b18c8ab5dd45e25c5a462de044f5605aa5a9eac7a7bfe82e2f1e1db4d",
  attemptManifest:
    "495db20af478abdf3f8506d00fc507ac22b3244bf125391e506f49d9688e86de",
  run:
    "4947dc24647161b74666b7eba63dab086a5b952ec61aeb78d7c8df48b20ef91d",
  boundary:
    "4f7f3531f92e77aa0776a3423083b0fff777b965b53801e4b1006633ba804fcc",
  failure:
    "d5dfc800628cc90493a1aa5d329c676f257a5f6fbf243c54a7647bd12eebce5a",
  termination:
    "8ab8ff49c971fba5c8a23b659ef7dced784ada1890f1aaf62267ef2dec68d520",
  finalResponse:
    "824d7ba1b04fe34ce21393663e2cd4462fa5f3a23762f9454f8cc321dbdc6878",
  receiptLedger:
    "ee7bb627cc7397373d41c346387e78a0b5dee11dd44c831ab395b72293bc194e",
  stdout:
    "d321b71e850e4d7e210f5bd709ede60035071fe5220f656c5332dd1de3542cef",
  stderr:
    "09cb6400df966bbe4d3586ddb3445785c02b0fbe462c1ebd87a8d185c1499396",
});

export function replayR6T10ProviderTerminalEvidence({
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
  requireAttemptThreeEnvelope({
    localPreflight,
    runIndex,
    verdict,
    run,
    boundary,
    termination,
    finalResponse,
    receiptLedger,
    stdout,
  });

  const entries = receiptLedger.entries;
  assertLedgerSequence(entries);
  const spawn = uniqueEntry(entries, "process-spawned");
  const stdoutEntries = entries.filter(
    (entry) => entry.kind === "stdout-chunk-received",
  );
  const chunks = jsonlChunks(stdout);
  if (chunks.length !== stdoutEntries.length) {
    throw new Error("R6_T11_STDOUT_LEDGER_MISMATCH");
  }
  const received = chunks.map((chunk, index) => {
    const receipt = stdoutEntries[index];
    if (sha256(chunk) !== receipt.rawSha256
      || String(Buffer.byteLength(chunk, "utf8")) !== receipt.bytes) {
      throw new Error("R6_T11_STDOUT_LEDGER_MISMATCH");
    }
    let event;
    try {
      event = JSON.parse(chunk);
    } catch {
      throw new Error("R6_T11_STDOUT_JSON_INVALID");
    }
    return {
      event,
      sequence: receipt.sequence,
      receivedAtNs: receipt.receivedAtNs,
      rawSha256: receipt.rawSha256,
    };
  });

  const fallbacks = received.filter(({ event }) => (
    event.type === "item.completed"
      && event.item?.type === "error"
      && FALLBACK.test(event.item.message ?? "")
  ));
  if (fallbacks.length !== 1) {
    throw new Error("R6_T11_TRANSPORT_FALLBACK_INVALID");
  }
  const fallback = fallbacks[0];
  const reconnects = received.flatMap(({ event, ...receipt }) => {
    const match = event.type === "error"
      ? RECONNECT.exec(event.message ?? "")
      : null;
    return match === null ? [] : [{
      transport: receipt.sequence < fallback.sequence
        ? "websocket"
        : "https",
      attempt: Number(match[1]),
      maximum: Number(match[2]),
      ...receipt,
    }];
  });
  const websocket = reconnects.filter(({ transport }) => (
    transport === "websocket"
  ));
  const https = reconnects.filter(({ transport }) => transport === "https");
  assertReconnectPhase(websocket, [2, 3, 4, 5], "websocket");
  assertReconnectPhase(https, [1, 2, 3, 4, 5], "https");

  const turnFailed = received.filter(({ event }) => (
    event.type === "turn.failed"
  ));
  const final = received.at(-1);
  const terminalMessage = turnFailed[0]?.event?.error?.message ?? "";
  const precursor = received.filter(({ event }) => (
    event.type === "error" && event.message === terminalMessage
  ));
  if (received.filter(({ event }) => event.type === "thread.started").length !== 1
    || received.filter(({ event }) => event.type === "turn.started").length !== 1
    || turnFailed.length !== 1
    || final !== turnFailed[0]
    || precursor.length !== 1
    || precursor[0].sequence >= final.sequence
    || !PROVIDER_TERMINAL.test(terminalMessage)
    || /timed out/iu.test(terminalMessage)
    || received.some(({ event }) => (
      event.type === "turn.completed"
        || (event.type === "item.completed"
          && event.item?.type === "agent_message")
    ))) {
    throw new Error("R6_T11_PROVIDER_TERMINAL_INVALID");
  }

  const events = received.map(({ event }) => event);
  const classification = classifyR6Attempt({
    run,
    termination,
    finalResponse,
    boundary,
    events,
    evidenceSealed: true,
  });
  if (classification.kind !== "protocol-or-unknown-failure"
    || classification.retryable !== false
    || classification.evidence.providerTimeout !== false
    || classification.evidence.runnerDeadline !== false) {
    throw new Error("R6_T11_NO_RETRY_PRESERVATION_FAILED");
  }

  const spawnNs = BigInt(spawn.receivedAtNs);
  const receiptView = (item) => ({
    sequence: item.sequence,
    elapsedFromSpawnMs:
      ceilMs(BigInt(item.receivedAtNs) - spawnNs),
    rawSha256: item.rawSha256,
  });
  return deepFreeze({
    schemaVersion: "R6-T11-provider-terminal-replay-v1",
    sourceTask: "R6-T10",
    sourceDecisionAttempt: 3,
    sourceVerdict: "adjust",
    supersedesAttempt: "R6-T7",
    codexVersion: localPreflight.codexVersion,
    clock: {
      ...receiptLedger.clock,
      origin: "process-spawned",
    },
    transportPhaseAttribution:
      "ordered-receipt-sequence-plus-fallback-boundary",
    websocketReconnectAttempts: websocket.map(({ attempt }) => attempt),
    httpsReconnectAttempts: https.map(({ attempt }) => attempt),
    fallbackReceipt: {
      ...receiptView(fallback),
      observedFailureClass: "network-unreachable",
    },
    terminalPrecursorReceipt: receiptView(precursor[0]),
    providerTerminalReceipt: {
      ...receiptView(final),
      messageSha256: sha256(terminalMessage),
      observedFailureClass: "error-sending-request",
    },
    providerTerminalObserved: true,
    providerTerminalTimeout: false,
    runnerDeadlineExpired: false,
    authoritativeResponseObserved: false,
    processExitCode: termination.process.exitCode,
    attemptThreeClassification: classification.kind,
    attemptThreeRetryable: classification.retryable,
    intermediateReconnectTimeoutDefinesTerminal: false,
    processTreeTerminated: true,
    evidenceSealed: true,
    evidenceHashes,
  });
}

export function deriveR6ProviderTerminalCompatibilityContract(replay) {
  if (!isRecord(replay)
    || replay.schemaVersion !== "R6-T11-provider-terminal-replay-v1"
    || replay.sourceVerdict !== "adjust"
    || replay.transportPhaseAttribution
      !== "ordered-receipt-sequence-plus-fallback-boundary"
    || replay.providerTerminalObserved !== true
    || replay.providerTerminalTimeout !== false
    || replay.runnerDeadlineExpired !== false
    || replay.authoritativeResponseObserved !== false
    || replay.attemptThreeClassification !== "protocol-or-unknown-failure"
    || replay.attemptThreeRetryable !== false
    || replay.intermediateReconnectTimeoutDefinesTerminal !== false
    || replay.fallbackReceipt?.observedFailureClass !== "network-unreachable"
    || replay.providerTerminalReceipt?.observedFailureClass
      !== "error-sending-request"
    || replay.processTreeTerminated !== true
    || replay.evidenceSealed !== true) {
    throw new Error("R6_T11_COMPATIBILITY_REPLAY_INVALID");
  }
  const record = {
    schemaVersion: "R6-T11-provider-terminal-compatibility-contract-v1",
    sourceReplayHash: canonicalSha256(replay),
    disposition: "continue-to-preregistration-only",
    boundedRemediationAvailable: true,
    preservedAttemptThreeClassification: "protocol-or-unknown-failure",
    preservedAttemptThreeRetryable: false,
    providerTimeoutClassUnchanged: true,
    intermediateReconnectTimeoutCannotDefineTerminal: true,
    compatibleFutureClass:
      "sealed-network-fallback-plus-nontimeout-provider-terminal-before-response",
    compatibleFutureClassIsTimeout: false,
    compatibleFutureClassRootCauseClaimed: false,
    futureEligibilityRequiredEvidence: [
      "ordered-websocket-to-https-fallback-receipts",
      "explicit-network-unreachable-fallback",
      "final-nontimeout-turn-failed-error-sending-request",
      "no-agent-message-or-turn-completed",
      "nonzero-process-exit-before-runner-deadline",
      "sealed-audit-permission-terminal-and-manifest-boundary",
    ],
    unknownOrDifferentNonTimeoutTerminalRetryable: false,
    maxRetriesPerArm: 1,
    maxProcessAttempts: 20,
    everyAttemptConsumesBudget: true,
    everyAttemptEvidenceRetained: true,
    exactAttemptFourPolicySelected: false,
    policySelectionDeferredToTask: "R6-T12",
    externalExecutionAuthorized: false,
    productUnlockCount: 0,
  };
  return deepFreeze({
    ...record,
    contractHash: canonicalSha256(record),
  });
}

function requireAttemptThreeEnvelope({
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
  if (!isRecord(localPreflight)
    || localPreflight.schemaVersion !== "R6-T10-local-preflight-v1"
    || localPreflight.ok !== true
    || localPreflight.modelCall !== false
    || localPreflight.networkRuntimeProbed !== false
    || localPreflight.codexVersion !== "codex-cli 0.144.5"
    || !isRecord(runIndex)
    || runIndex.schemaVersion !== "R6-T10-run-index-v1"
    || runIndex.decisionAttempt !== 3
    || runIndex.supersedesAttempt !== "R6-T7"
    || runIndex.attemptTwoResultManifestHash
      !== "2ba2b0537b4fb312e2e82cdd69a7c87b41d05b7117572c5b58978bd300e8fdd7"
    || runIndex.processAttemptCount !== 1
    || runIndex.successfulArmCount !== 0
    || runIndex.batchStopped !== true
    || !Array.isArray(runIndex.runIds)
    || runIndex.runIds.length !== 1
    || !isRecord(verdict)
    || verdict.schemaVersion !== "R6-T10-verdict-v1"
    || verdict.decisionAttempt !== 3
    || verdict.supersedesAttempt !== "R6-T7"
    || verdict.verdict !== "adjust"
    || verdict.metrics?.aggregateIntegrityPassed !== true
    || canonicalSha256(verdict) !== runIndex.verdictHash
    || !isRecord(run)
    || run.runId !== runIndex.runIds[0]
    || run.outcome !== "failed"
    || run.deadlineExpired !== false
    || run.processTreeTerminated !== true
    || run.providerTurnFailedObserved !== true
    || run.providerTerminalInvented !== false
    || run.evidenceSealedBeforeReturn !== true
    || !Array.isArray(run.failureCodes)
    || !run.failureCodes.includes("R5_FINAL_RESPONSE_EMPTY")
    || !run.failureCodes.includes("R5_PROCESS_EXIT_NONZERO")
    || !isRecord(boundary)
    || boundary.audit?.status !== "passed"
    || boundary.audit?.valid !== true
    || boundary.audit?.eventCount !== 14
    || boundary.permission?.status !== "passed"
    || boundary.permission?.permissionProfilePassed !== true
    || boundary.permission?.workspaceWritable !== false
    || boundary.permission?.authReadableToGeneratedCommands !== false
    || boundary.evaluator?.status !== "passed"
    || boundary.evaluator?.valid !== true
    || boundary.evaluator?.responsePresent !== false
    || !isRecord(termination)
    || termination.trigger !== "process-exit"
    || termination.deadlineExpired !== false
    || termination.providerTurnFailedObserved !== true
    || termination.providerTerminalInvented !== false
    || termination.process?.exitCode !== 1
    || termination.process?.signal !== null
    || termination.process?.launchFailed !== false
    || termination.processGroupEstablished !== true
    || termination.processGroupEmptyAfterTermination !== true
    || termination.gracefulSignalSent !== false
    || termination.forceSignalSent !== false
    || termination.policy?.deadlineMs !== 1_200_000
    || termination.policy?.graceMs !== 5_000
    || termination.policy?.forceKillWaitMs !== 5_000
    || !isRecord(finalResponse)
    || finalResponse.status !== "empty"
    || finalResponse.bytes !== "0"
    || !isRecord(receiptLedger)
    || receiptLedger.schemaVersion !== "R5-T2-terminal-receipt-ledger-v1"
    || receiptLedger.clock?.domain !== "node:process.hrtime.bigint"
    || receiptLedger.clock?.provider !== "trusted-outer-runner"
    || receiptLedger.clock?.unit !== "nanoseconds"
    || !Array.isArray(receiptLedger.entries)
    || receiptLedger.entries.length !== receiptLedger.entryCount
    || receiptLedger.entryCount !== 27
    || typeof stdout !== "string") {
    throw new Error("R6_T11_REPLAY_INPUT_INVALID");
  }
}

function requireExactHashes(evidenceHashes) {
  if (!isRecord(evidenceHashes)
    || canonicalSha256(evidenceHashes)
      !== canonicalSha256(R6_T11_IMMUTABLE_HASHES)) {
    throw new Error("R6_T11_ATTEMPT_THREE_EVIDENCE_CHANGED");
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
    throw new Error("R6_T11_RECEIPT_LEDGER_INVALID");
  }
}

function uniqueEntry(entries, kind) {
  const matches = entries.filter((entry) => entry.kind === kind);
  if (matches.length !== 1) throw new Error("R6_T11_RECEIPT_LEDGER_INVALID");
  return matches[0];
}

function assertReconnectPhase(items, attempts, transport) {
  if (items.length !== attempts.length
    || items.some((item, index) => (
      item.transport !== transport
        || item.maximum !== 5
        || item.attempt !== attempts[index]
        || (index > 0 && item.sequence <= items[index - 1].sequence)
    ))) {
    throw new Error("R6_T11_RECONNECT_PHASE_INVALID");
  }
}

function jsonlChunks(value) {
  const chunks = value.match(/[^\n]*\n/gu) ?? [];
  if (chunks.length === 0 || chunks.join("") !== value) {
    throw new Error("R6_T11_STDOUT_JSON_INVALID");
  }
  return chunks;
}

function ceilMs(value) {
  if (value < 0n) throw new Error("R6_T11_NEGATIVE_DURATION");
  return Number((value + NS_PER_MS - 1n) / NS_PER_MS);
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
