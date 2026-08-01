import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { canonicalJson } from "../../packages/pilot-harness/dist/index.js";
import {
  finalizeR3RecordedRun,
  sealR3BatchOutcome,
  verifyOuterManifest,
} from "./r3-run-finalizer.mjs";

const roots = [];
const groundTruth = Object.freeze({
  relativeFile: "packages/demo-fixture/src/App.tsx",
  line: 7,
  sourceAnchorId: null,
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R3 run finalizer", () => {
  test("layers audit, evaluation, terminal and outer hashes without mutating recorder seal", () => {
    const root = createRecordedRun("r3-success");
    const originalRecorderManifest = readFileSync(join(root, "SHA256SUMS"), "utf8");
    const result = finalizeR3RecordedRun({ runRoot: root, groundTruth });

    expect(result).toMatchObject({
      ok: true,
      outcome: "success",
      capsuleAudit: "passed",
      attribution: "correct",
      evidenceSealed: true,
    });
    expect(readFileSync(join(root, "SHA256SUMS"), "utf8"))
      .toBe(originalRecorderManifest);
    expect(verifyOuterManifest(root, "R3-SHA256SUMS")).toBe(true);
    expect(readJson(join(root, "r3-terminal/terminal.json"))).toMatchObject({
      rawEvidencePresent: true,
      finalEvidencePresent: true,
      terminalEvidencePresent: true,
      ledgerEvidencePresent: true,
      evidenceSealedBeforeReturn: true,
    });
  });

  test.each([
    ["audit", {
      audit() { throw new Error("R3_TEST_AUDIT_THROW"); },
    }, "R3_TEST_AUDIT_THROW"],
    ["evaluator", {
      evaluationProbe() { throw new Error("R3_TEST_EVALUATOR_THROW"); },
    }, "R3_TEST_EVALUATOR_THROW"],
    ["hash", {
      verifyRecorderEvidence() { throw new Error("R3_TEST_HASH_THROW"); },
    }, "R3_TEST_HASH_THROW"],
  ])("seals a %s exception before returning structured failure", (_stage, options, code) => {
    const root = createRecordedRun(`r3-${_stage}`);
    const result = finalizeR3RecordedRun({
      runRoot: root,
      groundTruth,
      ...options,
    });

    expect(result).toMatchObject({
      ok: false,
      outcome: "failed",
      evidenceSealed: true,
    });
    expect(result.failureCodes).toContain(code);
    expect(readJson(join(root, "r3-terminal/errors.json"))).toMatchObject({
      rawMessagesPersisted: false,
    });
    expect(verifyOuterManifest(root, "R3-SHA256SUMS")).toBe(true);
  });

  test("records a symlink as a violation without following it or losing terminal evidence", () => {
    const root = createRecordedRun("r3-symlink");
    symlinkSync("/codex-home/auth.json", join(root, "untrusted-link"));
    const result = finalizeR3RecordedRun({ runRoot: root, groundTruth });

    expect(result).toMatchObject({
      ok: false,
      outcome: "failed",
      evidenceSealed: true,
    });
    expect(result.failureCodes).toContain("R3_BASE_EVIDENCE_UNSAFE_NODE");
    expect(readJson(join(root, "r3-terminal/terminal.json"))).toMatchObject({
      unsafeBaseNodeCount: 1,
      evidenceSealedBeforeReturn: true,
    });
    expect(readFileSync(join(root, "R3-SHA256SUMS"), "utf8"))
      .not.toContain("untrusted-link");
    expect(verifyOuterManifest(root, "R3-SHA256SUMS")).toBe(true);
  });

  test("seals cancellation as a non-attribution terminal state", () => {
    const root = createRecordedRun("r3-cancelled", {
      outcome: "cancelled",
      successfulResponseComplete: false,
      failureCodes: ["CANCELLED_BY_RUNNER"],
      selectedResponse: null,
    });
    const result = finalizeR3RecordedRun({ runRoot: root, groundTruth });

    expect(result).toMatchObject({
      ok: false,
      outcome: "cancelled",
      attribution: null,
      evidenceSealed: true,
    });
    expect(readJson(join(root, "r3-terminal/evaluation.json"))).toMatchObject({
      protocolFailure: true,
      attribution: null,
      failureEvidenceSealedBeforeReturn: true,
    });
  });

  test("seals an explicit wrong attribution as a failed run and batch stop", () => {
    const resultRoot = makeRoot("vem-r3-wrong-batch-");
    const runRoot = join(resultRoot, "runs/r3-wrong");
    mkdirSync(join(resultRoot, "runs"), { recursive: true, mode: 0o700 });
    createRecordedRunAt(runRoot, "r3-wrong", {
      selectedResponse: {
        ...groundTruth,
        line: groundTruth.line + 1,
      },
    });
    const run = finalizeR3RecordedRun({ runRoot, groundTruth });
    expect(run).toMatchObject({
      ok: false,
      outcome: "failed",
      attribution: "wrong",
      failureCodes: ["R3_WRONG_ATTRIBUTION"],
      evidenceSealed: true,
    });
    const batch = sealR3BatchOutcome({
      resultRoot,
      runs: [run],
      expectedRunCount: 2,
    });
    expect(batch).toMatchObject({
      batchStopped: true,
      failedRunId: "r3-wrong",
      completedRunCount: 1,
      remainingRunCount: 1,
      evidenceSealed: true,
    });
  });

  test("seals an aggregate exception and stops before an unrecorded run", () => {
    const resultRoot = makeRoot("vem-r3-batch-");
    const runRoot = join(resultRoot, "runs/r3-first");
    mkdirSync(join(resultRoot, "runs"), { recursive: true, mode: 0o700 });
    createRecordedRunAt(runRoot, "r3-first");
    const run = finalizeR3RecordedRun({ runRoot, groundTruth });
    const batch = sealR3BatchOutcome({
      resultRoot,
      runs: [run],
      expectedRunCount: 2,
      aggregateProbe() { throw new Error("R3_TEST_AGGREGATE_THROW"); },
    });

    expect(batch).toMatchObject({
      ok: false,
      batchStopped: true,
      completedRunCount: 1,
      remainingRunCount: 1,
      evidenceSealed: true,
    });
    expect(readJson(
      join(resultRoot, "r3-batch-terminal/aggregate-errors.json"),
    )).toMatchObject({
      errorCount: 1,
      rawMessagesPersisted: false,
    });
    expect(verifyOuterManifest(resultRoot, "R3-BATCH-SHA256SUMS")).toBe(true);
  });
});

function createRecordedRun(runId, overrides = {}) {
  const root = makeRoot("vem-r3-finalizer-");
  createRecordedRunAt(root, runId, overrides);
  return root;
}

function createRecordedRunAt(root, runId, overrides = {}) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const stdout = [
    JSON.stringify({ type: "thread.started", thread_id: `${runId}-thread` }),
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "message",
        type: "agent_message",
        text: JSON.stringify(groundTruth),
      },
    }),
    JSON.stringify({ type: "turn.completed", usage: {} }),
    "",
  ].join("\n");
  const run = {
    schemaVersion: "R2-T2-recorded-run-v1",
    runId,
    process: { exitCode: 0, signal: null, launchFailed: false },
    outcome: "success",
    failureCodes: [],
    selectedResponse: groundTruth,
    authoritativeResponseStatus: "valid-consistent",
    instrumentationHash: "a".repeat(64),
    ledgerContentHash: "b".repeat(64),
    successfulResponseComplete: true,
    ...overrides,
  };
  const files = {
    "stdout.jsonl": stdout,
    "stderr.txt": "",
    "final-response.txt": JSON.stringify(run.selectedResponse),
    "final-response-observation.json": `${canonicalJson({
      schemaVersion: "R2-T2-final-response-observation-v1",
      status: "captured",
      bytes: String(Buffer.byteLength(JSON.stringify(run.selectedResponse))),
      rawSha256: sha256(JSON.stringify(run.selectedResponse)),
      failureCode: null,
    })}\n`,
    "receipt-ledger.json": `${canonicalJson({
      schemaVersion: "R2-T2-authoritative-final-receipt-ledger-v1",
      runId,
      outcome: run.outcome,
      entries: [],
    })}\n`,
    "run.json": `${canonicalJson(run)}\n`,
  };
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(root, name), body, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }
  writeFileSync(join(root, "SHA256SUMS"), `${Object.keys(files).map((name) => (
    `${sha256(readFileSync(join(root, name)))}  ${name}`
  )).join("\n")}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function makeRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
