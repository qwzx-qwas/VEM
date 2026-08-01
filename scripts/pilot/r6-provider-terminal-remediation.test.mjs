import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  R6_T11_IMMUTABLE_HASHES,
  deriveR6ProviderTerminalCompatibilityContract,
  replayR6T10ProviderTerminalEvidence,
} from "./r6-provider-terminal-remediation.mjs";
import { buildR6T11Proof } from "./prove-r6-t11.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const RESULT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T10/20260730T195616-0800",
);
const RUN_ROOT = join(
  RESULT_ROOT,
  "runs/r6-terminal-01-fallback-heading-direct-search-attempt-1",
);

describe("R6-T11 non-timeout provider-terminal remediation", () => {
  test("replays immutable attempts and preserves the nonretryable terminal", () => {
    const replay = replayR6T10ProviderTerminalEvidence(loadInputs());
    expect(replay).toMatchObject({
      sourceTask: "R6-T10",
      sourceDecisionAttempt: 3,
      sourceVerdict: "adjust",
      websocketReconnectAttempts: [2, 3, 4, 5],
      httpsReconnectAttempts: [1, 2, 3, 4, 5],
      fallbackReceipt: {
        elapsedFromSpawnMs: 123_049,
        observedFailureClass: "network-unreachable",
      },
      providerTerminalReceipt: {
        elapsedFromSpawnMs: 992_292,
        observedFailureClass: "error-sending-request",
      },
      providerTerminalObserved: true,
      providerTerminalTimeout: false,
      runnerDeadlineExpired: false,
      authoritativeResponseObserved: false,
      attemptThreeClassification: "protocol-or-unknown-failure",
      attemptThreeRetryable: false,
      intermediateReconnectTimeoutDefinesTerminal: false,
      processTreeTerminated: true,
      evidenceSealed: true,
    });
  });

  test("derives only a bounded preregistration disposition", () => {
    const contract = deriveR6ProviderTerminalCompatibilityContract(
      replayR6T10ProviderTerminalEvidence(loadInputs()),
    );
    expect(contract).toMatchObject({
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
      unknownOrDifferentNonTimeoutTerminalRetryable: false,
      maxRetriesPerArm: 1,
      maxProcessAttempts: 20,
      exactAttemptFourPolicySelected: false,
      policySelectionDeferredToTask: "R6-T12",
      externalExecutionAuthorized: false,
      productUnlockCount: 0,
    });
    expect(contract.futureEligibilityRequiredEvidence).toHaveLength(6);
    expect(contract.contractHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("rejects promoting reconnect text to a final provider timeout", () => {
    const inputs = loadInputs();
    const lines = inputs.stdout.trimEnd().split("\n");
    const message = "stream disconnected before completion: request timed out";
    lines[12] = JSON.stringify({ type: "error", message });
    lines[13] = JSON.stringify({
      type: "turn.failed",
      error: { message },
    });
    replaceStdout(inputs, lines);
    expect(() => replayR6T10ProviderTerminalEvidence(inputs))
      .toThrowError("R6_T11_PROVIDER_TERMINAL_INVALID");
  });

  test("rejects missing network-unreachable fallback attribution", () => {
    const inputs = loadInputs();
    const lines = inputs.stdout.trimEnd().split("\n");
    lines[6] = JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_0",
        type: "error",
        message:
          "Falling back from WebSockets to HTTPS transport. request timed out",
      },
    });
    replaceStdout(inputs, lines);
    expect(() => replayR6T10ProviderTerminalEvidence(inputs))
      .toThrowError("R6_T11_TRANSPORT_FALLBACK_INVALID");
  });

  test("rejects evidence mutation and integrity boundary regression", () => {
    const changedHash = loadInputs();
    changedHash.evidenceHashes.stdout = "0".repeat(64);
    expect(() => replayR6T10ProviderTerminalEvidence(changedHash))
      .toThrowError("R6_T11_ATTEMPT_THREE_EVIDENCE_CHANGED");

    const changedBoundary = loadInputs();
    changedBoundary.boundary.audit.valid = false;
    expect(() => replayR6T10ProviderTerminalEvidence(changedBoundary))
      .toThrowError("R6_T11_REPLAY_INPUT_INVALID");
  });

  test("builds a zero-call proof bound to all three immutable attempts", () => {
    const proof = buildR6T11Proof();
    expect(proof).toMatchObject({
      taskId: "R6-T11",
      outcome: "passed",
      executionBoundary: {
        participantProcessSpawned: false,
        providerRequestSent: false,
        providerNetworkProbed: false,
        externalProcessCount: 0,
        externalModelCall: false,
      },
      noRetryPreservation: {
        attemptThreeRetried: false,
        attemptThreeClassificationChanged: false,
        intermediateReconnectTimeoutPromotedToProviderTerminal: false,
        unknownNonTimeoutTerminalUpgradedToRetryable: false,
      },
      nextStage: {
        taskId: "R6-T12",
        noCallPreregistrationStructurallyEligible: true,
        exactAttemptFourPolicySelected: false,
        preregistrationFrozen: false,
        externalExecutionAuthorized: false,
        separatelyAuthorized: false,
      },
    });
    expect(proof.immutableDecisionAttempts.map(({ taskId }) => taskId))
      .toEqual(["R6-T4", "R6-T7", "R6-T10"]);
    expect(proof.immutableDecisionAttempts.every(
      ({ evidenceImmutable }) => evidenceImmutable,
    )).toBe(true);
  });

  test("fails closed if a prior manifest changes and contains no call path", () => {
    expect(() => buildR6T11Proof(REPO_ROOT, {
      readFile(path) {
        if (String(path).includes("R6-T7/20260730T183547-0800/RESULTS.sha256")) {
          return Buffer.from("changed\n", "utf8");
        }
        return readFileSync(path);
      },
    })).toThrowError("R6_T11_PRIOR_ATTEMPT_CHAIN_CHANGED");

    for (const path of [
      "scripts/pilot/r6-provider-terminal-remediation.mjs",
      "scripts/pilot/prove-r6-t11.mjs",
    ]) {
      const source = readFileSync(join(REPO_ROOT, path), "utf8");
      expect(source).not.toMatch(/node:child_process|\bfetch\s*\(|node:https|node:http/u);
    }
  });
});

function loadInputs() {
  const evidencePaths = {
    authorization: join(
      REPO_ROOT,
      "docs/test-evidence/R6-T10/OWNER_AUTHORIZATION_20260730.json",
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
  const inputs = {
    evidenceHashes: { ...R6_T11_IMMUTABLE_HASHES },
    localPreflight: readJson(evidencePaths.localPreflight),
    runIndex: readJson(evidencePaths.runIndex),
    verdict: readJson(evidencePaths.verdict),
    run: readJson(evidencePaths.run),
    boundary: readJson(evidencePaths.boundary),
    termination: readJson(evidencePaths.termination),
    finalResponse: readJson(evidencePaths.finalResponse),
    receiptLedger: readJson(evidencePaths.receiptLedger),
    stdout: readFileSync(evidencePaths.stdout, "utf8"),
  };
  expect(Object.fromEntries(Object.entries(evidencePaths).map(([key, path]) => (
    [key, sha256(readFileSync(path))]
  )))).toEqual(R6_T11_IMMUTABLE_HASHES);
  return inputs;
}

function replaceStdout(inputs, lines) {
  const chunks = lines.map((line) => `${line}\n`);
  inputs.stdout = chunks.join("");
  const receipts = inputs.receiptLedger.entries.filter(
    ({ kind }) => kind === "stdout-chunk-received",
  );
  for (const index of [6, 12, 13]) {
    receipts[index].rawSha256 = sha256(chunks[index]);
    receipts[index].bytes = String(Buffer.byteLength(chunks[index], "utf8"));
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
