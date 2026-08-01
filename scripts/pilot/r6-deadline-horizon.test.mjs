import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  deriveR6DeadlineRequirements,
  replayR6T4DeadlineEvidence,
  R6_T4_IMMUTABLE_HASHES,
  validateR6AttemptTwoDeadlineCandidate,
} from "./r6-deadline-horizon.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const RESULT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T4/20260730T171100-0800",
);
const RUN_ROOT = join(
  RESULT_ROOT,
  "runs/r6-invocation-01-env-heading-direct-search-attempt-1",
);

describe("R6-T5 deadline-horizon compatibility", () => {
  test("replays immutable attempt-one receipts without promoting reconnects", () => {
    const replay = replayR6T4DeadlineEvidence(loadReplayInput());
    expect(replay).toMatchObject({
      sourceTask: "R6-T4",
      sourceDecisionAttempt: 1,
      sourceVerdict: "adjust",
      codexVersion: "codex-cli 0.144.5",
      reconnectReceipts: [
        { attempt: 2, maximum: 5, elapsedFromSpawnMs: 75_498 },
        { attempt: 3, maximum: 5, elapsedFromSpawnMs: 90_905 },
        { attempt: 4, maximum: 5, elapsedFromSpawnMs: 106_691 },
      ],
      reconnectMaximum: 5,
      lastObservedReconnectAttempt: 4,
      maxObservedReconnectGapMs: 15_787,
      runnerDeadlinePolicyMs: 120_000,
      runnerDeadlineElapsedMs: 120_005,
      providerTerminalObserved: false,
      authoritativeResponseObserved: false,
      retryHorizonObservation: "incomplete-lower-bound-only",
      reconnectLogAuthorizesRetry: false,
      classification: "runner-wall-clock-terminated-before-response",
      retryable: false,
      processTreeTerminated: true,
      evidenceSealed: true,
    });
    expect(replay.evidenceHashes).toEqual(R6_T4_IMMUTABLE_HASHES);
  });

  test("derives a bounded contract but defers the exact attempt-two policy", () => {
    const requirements = deriveR6DeadlineRequirements(
      replayR6T4DeadlineEvidence(loadReplayInput()),
    );
    expect(requirements).toMatchObject({
      retryHorizonMustBeExplicit: true,
      reconnectLogInferenceForbidden: true,
      retryHorizonProvenanceAllowlist: [
        "explicit-model-provider-config",
        "version-bound-codex-instrumentation",
      ],
      minimumExplicitProviderRetryHorizonMs: 120_006,
      minimumTerminalObservationMarginMs: 31_574,
      minimumOuterDeadlineMs: 151_580,
      maximumOuterDeadlineMs: 600_000,
      exactAttemptTwoDeadlineSelected: false,
      policySelectionDeferredToTask: "R6-T6",
      externalExecutionAuthorized: false,
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
    });
  });

  test("accepts only explicit bounded candidates that preserve safety policy", () => {
    const requirements = deriveR6DeadlineRequirements(
      replayR6T4DeadlineEvidence(loadReplayInput()),
    );
    const candidate = validCandidate(requirements);
    expect(validateR6AttemptTwoDeadlineCandidate({
      requirements,
      candidate,
    })).toMatchObject({
      bounded: true,
      providerRetryHorizonExplicit: true,
      reconnectLogUsedAsTerminal: false,
      runnerTerminationRetryable: false,
      attemptOneEvidenceOverwritten: false,
      externalExecutionAuthorized: false,
    });

    expect(() => validateR6AttemptTwoDeadlineCandidate({
      requirements,
      candidate: {
        ...candidate,
        retryHorizonProvenance: {
          ...candidate.retryHorizonProvenance,
          kind: "reconnect-log-inference",
        },
      },
    })).toThrowError("R6_T5_ATTEMPT_TWO_DEADLINE_CANDIDATE_INVALID");
    expect(() => validateR6AttemptTwoDeadlineCandidate({
      requirements,
      candidate: {
        ...candidate,
        deadlineMs: 120_000,
      },
    })).toThrowError("R6_T5_ATTEMPT_TWO_DEADLINE_CANDIDATE_INVALID");
    expect(() => validateR6AttemptTwoDeadlineCandidate({
      requirements,
      candidate: {
        ...candidate,
        terminationPolicy: {
          ...candidate.terminationPolicy,
          runnerTerminationRetryable: true,
        },
      },
    })).toThrowError("R6_T5_ATTEMPT_TWO_DEADLINE_CANDIDATE_INVALID");
  });

  test("fails closed on attempt-one hash or terminal-state mutation", () => {
    expect(() => replayR6T4DeadlineEvidence({
      ...loadReplayInput(),
      evidenceHashes: {
        ...R6_T4_IMMUTABLE_HASHES,
        stdout: "a".repeat(64),
      },
    })).toThrowError("R6_T5_ATTEMPT_ONE_EVIDENCE_CHANGED");
    const input = loadReplayInput();
    expect(() => replayR6T4DeadlineEvidence({
      ...input,
      termination: {
        ...input.termination,
        providerTurnFailedObserved: true,
      },
    })).toThrowError("R6_T5_REPLAY_INPUT_INVALID");
  });
});

function loadReplayInput() {
  return {
    evidenceHashes: Object.fromEntries(Object.entries({
      resultsManifest: join(RESULT_ROOT, "RESULTS.sha256"),
      localPreflight: join(RESULT_ROOT, "results/local-preflight.json"),
      verdict: join(RESULT_ROOT, "results/verdict.json"),
      run: join(RUN_ROOT, "run.json"),
      boundary: join(RUN_ROOT, "boundary-state.json"),
      termination: join(RUN_ROOT, "termination.json"),
      finalResponse: join(RUN_ROOT, "final-response-observation.json"),
      receiptLedger: join(RUN_ROOT, "receipt-ledger.json"),
      stdout: join(RUN_ROOT, "stdout.jsonl"),
    }).map(([key, path]) => [key, sha256(readFileSync(path))])),
    localPreflight: readJson(join(RESULT_ROOT, "results/local-preflight.json")),
    verdict: readJson(join(RESULT_ROOT, "results/verdict.json")),
    run: readJson(join(RUN_ROOT, "run.json")),
    boundary: readJson(join(RUN_ROOT, "boundary-state.json")),
    termination: readJson(join(RUN_ROOT, "termination.json")),
    finalResponse: readJson(join(RUN_ROOT, "final-response-observation.json")),
    receiptLedger: readJson(join(RUN_ROOT, "receipt-ledger.json")),
    stdout: readFileSync(join(RUN_ROOT, "stdout.jsonl"), "utf8"),
  };
}

function validCandidate(requirements) {
  return {
    schemaVersion: "R6-T6-deadline-candidate-v1",
    codexVersion: "codex-cli 0.144.5",
    providerRetryHorizonMs: 180_000,
    terminalObservationMarginMs:
      requirements.minimumTerminalObservationMarginMs,
    deadlineMs:
      180_000 + requirements.minimumTerminalObservationMarginMs,
    clockDomain: requirements.clockDomain,
    deadlineOrigin: requirements.deadlineOrigin,
    retryHorizonProvenance: {
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
