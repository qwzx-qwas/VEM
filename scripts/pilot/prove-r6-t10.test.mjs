import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import { verifyR5EvidenceManifest } from "./r5-process-terminalizer.mjs";
import { classifyR6Attempt } from "./r6-attempt-policy.mjs";
import {
  verifyR6T9Preregistration,
  verifyR6T10OwnerAuthorization,
} from "./r6-t10.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PREREGISTRATION_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T9/20260730T194005-0800",
);
const RESULT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T10/20260730T195616-0800",
);
const RUN_ROOT = join(
  RESULT_ROOT,
  "runs/r6-terminal-01-fallback-heading-direct-search-attempt-1",
);
const AUTHORIZATION_PATH = join(
  REPO_ROOT,
  "docs/test-evidence/R6-T10/OWNER_AUTHORIZATION_20260730.json",
);

describe("R6-T10 immutable attempt-three result", () => {
  test("binds the exact published authorization and frozen preregistration", () => {
    const verified = verifyR6T9Preregistration(PREREGISTRATION_ROOT);
    const authorization = readJson(AUTHORIZATION_PATH);
    expect(authorization).toMatchObject({
      publishedCommit: "a1b49c3d927197ebd2c7a007aaac4fce0b15deb9",
      instrumentationHash:
        "6f4d1ef9c81f869c7a9f4c91a43044cd1c2dbce5056e070f71371a8708b80ef1",
      terminationPolicyHash:
        "6e966a04617f79cc408af8cc2ef2ecc7da6cdec3603127c7c2ce69c8358531ff",
    });
    expect(authorization.instrumentationHash)
      .toBe(verified.plan.instrumentationHash);
    expect(authorization.terminationPolicyHash)
      .toBe(verified.plan.terminationPolicyHash);
    expect(verifyR6T10OwnerAuthorization({
      authorization,
      preregistrationHash: verified.preregistrationHash,
      dataScopeHash: verified.plan.dataScopeHash,
      terminationPolicy: verified.plan.terminationPolicy,
      outerEnvironmentHash: verified.plan.outerEnvironmentHash,
      deadlineContractHash: verified.plan.deadlineContractHash,
      deadlineCandidateHash: verified.plan.deadlineCandidateHash,
    })).toMatchObject({
      valid: true,
      decisionAttempt: 3,
      supersedesAttempt: "R6-T7",
      maxProcessAttempts: 20,
      deadlineMs: 1_200_000,
      authorizationHash:
        "61767b2f1a7fc0dbd3c3734f2f672ad345eebb1a5febd3c56d124687f05509c4",
    });
  });

  test("classifies the observed non-timeout provider terminal as nonretryable", () => {
    const events = readJsonl(join(RUN_ROOT, "stdout.jsonl"));
    const classification = classifyR6Attempt({
      run: readJson(join(RUN_ROOT, "run.json")),
      termination: readJson(join(RUN_ROOT, "termination.json")),
      finalResponse: readJson(
        join(RUN_ROOT, "final-response-observation.json"),
      ),
      boundary: readJson(join(RUN_ROOT, "boundary-state.json")),
      events,
      evidenceSealed: verifyR5EvidenceManifest(RUN_ROOT),
    });
    expect(classification).toMatchObject({
      kind: "protocol-or-unknown-failure",
      retryable: false,
      evidence: {
        sealedBoundary: true,
        processTreeTerminated: true,
        providerTerminalInvented: false,
        providerTurnFailedObserved: true,
        providerTimeout: false,
        runnerDeadline: false,
        finalEmpty: true,
        agentResponseObserved: false,
        turnCompletedCount: 0,
        turnFailedCount: 1,
      },
    });
    expect(events.at(-1)).toEqual({
      type: "turn.failed",
      error: {
        message:
          "stream disconnected before completion: error sending request "
          + "for url (https://chatgpt.com/backend-api/codex/responses)",
      },
    });
    expect(events.at(-1).error.message).not.toMatch(/timed out/iu);
  });

  test("preserves the ordered dual-transport receipts and terminal boundary", () => {
    const ledger = readJson(join(RUN_ROOT, "receipt-ledger.json"));
    const events = readJsonl(join(RUN_ROOT, "stdout.jsonl"));
    const receipts = ledger.entries.filter(
      (entry) => entry.kind === "stdout-chunk-received",
    );
    const spawn = ledger.entries.find(
      (entry) => entry.kind === "process-spawned",
    );
    expect(ledger).toMatchObject({
      entryCount: 27,
      stdoutBytes: "1233",
      stderrBytes: "1729",
    });
    expect(receipts).toHaveLength(14);
    expect(events).toHaveLength(14);
    expect(events[6].item.message).toContain(
      "Falling back from WebSockets to HTTPS transport",
    );
    expect(events.slice(2, 6).map((event) => event.message)).toEqual([
      "Reconnecting... 2/5 (request timed out)",
      "Reconnecting... 3/5 (request timed out)",
      "Reconnecting... 4/5 (request timed out)",
      "Reconnecting... 5/5 (request timed out)",
    ]);
    expect(events.slice(7, 12).map((event) => event.message)).toEqual([
      "Reconnecting... 1/5 (request timed out)",
      "Reconnecting... 2/5 (request timed out)",
      "Reconnecting... 3/5 (request timed out)",
      "Reconnecting... 4/5 (request timed out)",
      "Reconnecting... 5/5 (request timed out)",
    ]);
    expect([2, 6, 7, 11, 13].map((index) => (
      elapsedMs(receipts[index], spawn)
    ))).toEqual([71_956, 123_049, 276_928, 865_219, 992_292]);
    expect(readJson(join(RUN_ROOT, "termination.json"))).toMatchObject({
      trigger: "process-exit",
      deadlineExpired: false,
      process: {
        exitCode: 1,
        signal: null,
        launchFailed: false,
      },
      processGroupEmptyAfterTermination: true,
      providerTurnFailedObserved: true,
      providerTerminalInvented: false,
      gracefulSignalSent: false,
      forceSignalSent: false,
    });
  });

  test("seals one process and records immutable adjust without retry", () => {
    expect(verifyManifest(RESULT_ROOT, "RESULTS.sha256")).toBe(true);
    expect(verifyR5EvidenceManifest(RUN_ROOT)).toBe(true);
    const runIndex = readJson(join(RESULT_ROOT, "results/run-index.json"));
    const verdict = readJson(join(RESULT_ROOT, "results/verdict.json"));
    expect(runIndex).toMatchObject({
      schemaVersion: "R6-T10-run-index-v1",
      decisionAttempt: 3,
      supersedesAttempt: "R6-T7",
      attemptTwoResultManifestHash:
        "2ba2b0537b4fb312e2e82cdd69a7c87b41d05b7117572c5b58978bd300e8fdd7",
      r6T8ProofHash:
        "21cb7550bc5380f0f460efbf59672ebf9bbaa28a78bbf8ce2e2053ddf73296be",
      batchStopped: true,
      successfulArmCount: 0,
      processAttemptCount: 1,
      runIds: [
        "r6-terminal-01-fallback-heading-direct-search-attempt-1",
      ],
    });
    expect(verdict).toMatchObject({
      schemaVersion: "R6-T10-verdict-v1",
      decisionAttempt: 3,
      supersedesAttempt: "R6-T7",
      verdict: "adjust",
      stopReasons: [],
      adjustReasons: [
        "fewer-than-ten-arms-complete-after-bounded-attempts",
      ],
      metrics: {
        aggregateIntegrityPassed: true,
        successfulArmCount: 0,
        processAttemptCount: 1,
      },
    });
    expect(canonicalSha256(verdict))
      .toBe("b2c75c2bafa45bf80f83a2158779f70591ab06dbde025f4ad144809a5ef9fb16");
    expect(sha256(readFileSync(join(RESULT_ROOT, "RESULTS.sha256"))))
      .toBe("a45f1970978996cdbe8df8b99e7b09fd3fbcf4865f76d8eeb504dcde2bead13b");
    expect(readdirSync(join(RESULT_ROOT, "runs"))).toEqual([
      "r6-terminal-01-fallback-heading-direct-search-attempt-1",
    ]);
  });
});

function verifyManifest(root, name) {
  const lines = readFileSync(join(root, name), "utf8")
    .trim().split(/\r?\n/u).filter(Boolean);
  return lines.every((line) => {
    const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
    return match !== null
      && sha256(readFileSync(join(root, match[2]))) === match[1];
  });
}

function elapsedMs(receipt, spawn) {
  return Number((
    BigInt(receipt.receivedAtNs) - BigInt(spawn.receivedAtNs) + 999_999n
  ) / 1_000_000n);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8").trim().split(/\r?\n/u)
    .filter(Boolean).map((line) => JSON.parse(line));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
