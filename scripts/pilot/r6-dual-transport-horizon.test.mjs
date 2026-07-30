import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  deriveR6DualTransportDeadlineRequirements,
  replayR6T7DualTransportEvidence,
  R6_T7_IMMUTABLE_HASHES,
  validateR6AttemptThreeDeadlineCandidate,
} from "./r6-dual-transport-horizon.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const RESULT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T7/20260730T183547-0800",
);
const RUN_ROOT = join(
  RESULT_ROOT,
  "runs/r6-deadline-01-horizon-heading-direct-search-attempt-1",
);

describe("R6-T8 dual-transport terminal-horizon compatibility", () => {
  test("replays immutable attempt two by ordered receipt occurrence", () => {
    const replay = replayR6T7DualTransportEvidence(loadReplayInput());
    expect(replay).toMatchObject({
      sourceTask: "R6-T7",
      sourceDecisionAttempt: 2,
      sourceVerdict: "adjust",
      supersedesAttempt: "R6-T4",
      transportPhaseAttribution:
        "ordered-receipt-sequence-plus-fallback-boundary",
      rawHashUniquenessAssumed: false,
      fallbackReceipt: {
        sequence: 13,
        elapsedFromSpawnMs: 137_057,
      },
      websocketReconnectAttempts: [2, 3, 4, 5],
      httpsReconnectAttempts: [1, 2, 3],
      duplicateCrossTransportRawHashCount: 2,
      maxObservedHttpsReconnectGapMs: 154_113,
      runnerDeadlinePolicyMs: 600_000,
      runnerDeadlineElapsedMs: 599_996,
      observedDualTransportTerminalHorizonLowerBoundMs: 600_000,
      providerTerminalObserved: false,
      authoritativeResponseObserved: false,
      reconnectLogAuthorizesRetry: false,
      retryable: false,
      processTreeTerminated: true,
      evidenceSealed: true,
    });
    expect(replay.reconnectReceipts.map((receipt) => ({
      transport: receipt.transport,
      attempt: receipt.attempt,
      elapsedFromSpawnMs: receipt.elapsedFromSpawnMs,
    }))).toEqual([
      { transport: "websocket", attempt: 2, elapsedFromSpawnMs: 70_862 },
      { transport: "websocket", attempt: 3, elapsedFromSpawnMs: 86_311 },
      { transport: "websocket", attempt: 4, elapsedFromSpawnMs: 102_114 },
      { transport: "websocket", attempt: 5, elapsedFromSpawnMs: 118_739 },
      { transport: "https", attempt: 1, elapsedFromSpawnMs: 290_850 },
      { transport: "https", attempt: 2, elapsedFromSpawnMs: 444_962 },
      { transport: "https", attempt: 3, elapsedFromSpawnMs: 599_075 },
    ]);
    expect(replay.evidenceHashes).toEqual(R6_T7_IMMUTABLE_HASHES);
  });

  test("retains duplicate hashes as distinct cross-transport receipts", () => {
    const replay = replayR6T7DualTransportEvidence(loadReplayInput());
    expect(replay.duplicateCrossTransportReceipts).toHaveLength(2);
    for (const duplicate of replay.duplicateCrossTransportReceipts) {
      expect(duplicate.occurrences).toHaveLength(2);
      expect(duplicate.occurrences.map((item) => item.transport))
        .toEqual(["websocket", "https"]);
      expect(new Set(duplicate.occurrences.map((item) => item.sequence)).size)
        .toBe(2);
    }
  });

  test("derives a bounded envelope but selects no attempt-three policy", () => {
    const requirements = deriveR6DualTransportDeadlineRequirements(
      replayR6T7DualTransportEvidence(loadReplayInput()),
    );
    expect(requirements).toMatchObject({
      disposition: "continue-to-preregistration-only",
      boundedEnvelopeAvailable: true,
      previousMaximumOuterDeadlineMs: 600_000,
      previousMaximumExhausted: true,
      minimumExplicitProviderTerminalHorizonMs: 600_001,
      minimumTerminalObservationMarginMs: 308_226,
      minimumOuterDeadlineMs: 908_227,
      maximumTerminalObservationMarginMs: 600_000,
      maximumOuterDeadlineMs: 1_200_000,
      exactAttemptThreeDeadlineSelected: false,
      policySelectionDeferredToTask: "R6-T9",
      externalExecutionAuthorized: false,
      terminationPolicyPreserved: {
        graceMs: 5_000,
        forceObservationMs: 5_000,
        gracefulSignal: "SIGTERM",
        forceSignal: "SIGKILL",
        maxRetriesPerArm: 1,
        maxProcessAttempts: 20,
        runnerTerminationRetryable: false,
      },
    });
  });

  test("validates only explicit bounded attempt-three candidates", () => {
    const requirements = deriveR6DualTransportDeadlineRequirements(
      replayR6T7DualTransportEvidence(loadReplayInput()),
    );
    const candidate = validCandidate(requirements);
    expect(validateR6AttemptThreeDeadlineCandidate({
      requirements,
      candidate,
    })).toMatchObject({
      bounded: true,
      providerTerminalHorizonExplicit: true,
      orderedTransportReceiptsBound: true,
      reconnectLogUsedAsTerminal: false,
      runnerTerminationRetryable: false,
      priorAttemptEvidenceOverwritten: false,
      externalExecutionAuthorized: false,
    });
    expect(() => validateR6AttemptThreeDeadlineCandidate({
      requirements,
      candidate: {
        ...candidate,
        terminalHorizonProvenance: {
          ...candidate.terminalHorizonProvenance,
          kind: "reconnect-log-inference",
        },
      },
    })).toThrowError("R6_T8_ATTEMPT_THREE_DEADLINE_CANDIDATE_INVALID");
    expect(() => validateR6AttemptThreeDeadlineCandidate({
      requirements,
      candidate: {
        ...candidate,
        deadlineMs: requirements.minimumOuterDeadlineMs - 1,
      },
    })).toThrowError("R6_T8_ATTEMPT_THREE_DEADLINE_CANDIDATE_INVALID");
    expect(() => validateR6AttemptThreeDeadlineCandidate({
      requirements,
      candidate: {
        ...candidate,
        externalExecutionAuthorized: true,
      },
    })).toThrowError("R6_T8_ATTEMPT_THREE_DEADLINE_CANDIDATE_INVALID");
  });

  test("fails closed on evidence hash and ordered phase mutation", () => {
    expect(() => replayR6T7DualTransportEvidence({
      ...loadReplayInput(),
      evidenceHashes: {
        ...R6_T7_IMMUTABLE_HASHES,
        stdout: "a".repeat(64),
      },
    })).toThrowError("R6_T8_ATTEMPT_TWO_EVIDENCE_CHANGED");
    const input = loadReplayInput();
    const entries = input.receiptLedger.entries.map((entry) => ({ ...entry }));
    [entries[15].sequence, entries[17].sequence] = [
      entries[17].sequence,
      entries[15].sequence,
    ];
    expect(() => replayR6T7DualTransportEvidence({
      ...input,
      receiptLedger: {
        ...input.receiptLedger,
        entries,
      },
    })).toThrowError("R6_T8_RECEIPT_LEDGER_INVALID");
  });
});

function loadReplayInput() {
  const paths = {
    authorization: join(
      REPO_ROOT,
      "docs/test-evidence/R6-T7/OWNER_AUTHORIZATION_20260730.json",
    ),
    resultsManifest: join(RESULT_ROOT, "RESULTS.sha256"),
    localPreflight: join(RESULT_ROOT, "results/local-preflight.json"),
    runIndex: join(RESULT_ROOT, "results/run-index.json"),
    verdict: join(RESULT_ROOT, "results/verdict.json"),
    attemptManifest: join(RUN_ROOT, "SHA256SUMS"),
    run: join(RUN_ROOT, "run.json"),
    boundary: join(RUN_ROOT, "boundary-state.json"),
    failure: join(RUN_ROOT, "failure.json"),
    termination: join(RUN_ROOT, "termination.json"),
    finalResponse: join(RUN_ROOT, "final-response-observation.json"),
    receiptLedger: join(RUN_ROOT, "receipt-ledger.json"),
    stdout: join(RUN_ROOT, "stdout.jsonl"),
    stderr: join(RUN_ROOT, "stderr.txt"),
  };
  return {
    evidenceHashes: Object.fromEntries(Object.entries(paths).map(
      ([key, path]) => [key, sha256(readFileSync(path))],
    )),
    localPreflight: readJson(paths.localPreflight),
    runIndex: readJson(paths.runIndex),
    verdict: readJson(paths.verdict),
    run: readJson(paths.run),
    boundary: readJson(paths.boundary),
    termination: readJson(paths.termination),
    finalResponse: readJson(paths.finalResponse),
    receiptLedger: readJson(paths.receiptLedger),
    stdout: readFileSync(paths.stdout, "utf8"),
  };
}

function validCandidate(requirements) {
  return {
    schemaVersion: "R6-T9-deadline-candidate-v1",
    codexVersion: "codex-cli 0.144.5",
    dualTransportContractHash: requirements.contractHash,
    providerTerminalHorizonMs: 800_000,
    terminalObservationMarginMs: 350_000,
    deadlineMs: 1_150_000,
    clockDomain: requirements.clockDomain,
    deadlineOrigin: requirements.deadlineOrigin,
    terminalHorizonProvenance: {
      kind: "version-bound-codex-instrumentation",
      codexVersion: "codex-cli 0.144.5",
      evidenceHash: "b".repeat(64),
    },
    terminationPolicy: requirements.terminationPolicyPreserved,
    externalExecutionAuthorized: false,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
