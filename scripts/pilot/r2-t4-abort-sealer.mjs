import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
} from "../../packages/pilot-harness/dist/index.js";
import { auditCodexJsonlV2 } from "./capsule-audit-v2.mjs";
import { evaluateR2Recovery } from "./r2-recovery-plan.mjs";
import {
  verifyR2OwnerAuthorization,
  verifyR2Preregistration,
} from "./r2-t4.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const PREREGISTRATION_PARENT = join(REPO_ROOT, "docs/test-evidence/R2-T3");
const RESULT_PARENT = join(REPO_ROOT, "docs/test-evidence/R2-T4");
const AUDIT_MARKERS = Object.freeze([
  "AGENTS.md",
  "SKILL.md",
  ".agents/",
  ".codex/skills/",
  "/.agents/",
  "/.codex/skills/",
  "/home/",
  "/mnt/",
  "/root/",
]);

export function diagnoseR2CapsuleAudit({ jsonl, stderr = "" }) {
  try {
    const audit = auditCodexJsonlV2({ jsonl, stderr });
    return Object.freeze({
      failureCode: null,
      valid: true,
      forbiddenMarkers: Object.freeze([]),
      commandEventLines: Object.freeze([]),
      audit,
    });
  } catch (error) {
    const failureCode = error instanceof Error ? error.message : "UNKNOWN_AUDIT_FAILURE";
    const commandEventLines = [];
    const forbiddenMarkers = new Set();
    for (const [index, line] of jsonl.split(/\r?\n/u).filter(Boolean).entries()) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if ((event.type !== "item.started" && event.type !== "item.completed")
        || event.item?.type !== "command_execution") continue;
      const text = `${event.item.command ?? ""}\n${event.item.aggregated_output ?? ""}`;
      let matched = false;
      for (const marker of AUDIT_MARKERS) {
        if (text.includes(marker)) {
          forbiddenMarkers.add(marker);
          matched = true;
        }
      }
      if (matched) commandEventLines.push(index + 1);
    }
    for (const marker of AUDIT_MARKERS) {
      if (stderr.includes(marker)) forbiddenMarkers.add(marker);
    }
    return Object.freeze({
      failureCode,
      valid: false,
      forbiddenMarkers: Object.freeze([...forbiddenMarkers].sort()),
      commandEventLines: Object.freeze(commandEventLines),
      audit: null,
    });
  }
}

export function buildR2AbortedVerdict({
  runs,
  prepareSetupDurationNs,
  expectedInstrumentationHash,
}) {
  const verdict = evaluateR2Recovery({
    runs,
    totalSetupDurationNs: prepareSetupDurationNs,
    expectedInstrumentationHash,
  });
  if (verdict.verdict !== "stop"
    || !verdict.stopReasons.includes("capsule-integrity-failed")
    || !verdict.stopReasons.includes("failure-evidence-not-sealed-before-return")
    || !verdict.adjustReasons.includes(
      "external-run-did-not-produce-ten-fresh-complete-processes",
    )) {
    throw new Error("R2_T4_ABORT_VERDICT_INVALID");
  }
  return Object.freeze({
    ...verdict,
    setupCostMeasurement: Object.freeze({
      status: "lower-bound-only",
      preregistrationPrepareNs: prepareSetupDurationNs,
      capsuleSetupNs: null,
      reason: "frozen-runner-aborted-before-top-level-setup-cost-seal",
    }),
    limitations: Object.freeze([
      ...verdict.limitations,
      "CAPSULE_SETUP_DURATION_UNAVAILABLE_AFTER_UNHANDLED_AUDIT_ABORT",
    ]),
  });
}

export function sealR2AbortedBatch({
  preregistrationRoot,
  resultRoot,
  authorizationPath,
  failureRunId,
}) {
  const preregRoot = requireChildDirectory(
    preregistrationRoot,
    PREREGISTRATION_PARENT,
    "R2_T4_ABORT_PREREGISTRATION_ROOT_INVALID",
  );
  const outputRoot = requireChildDirectory(
    resultRoot,
    RESULT_PARENT,
    "R2_T4_ABORT_RESULT_ROOT_INVALID",
  );
  const resultsRoot = join(outputRoot, "results");
  const runsRoot = requireDirectory(
    join(resultsRoot, "runs"),
    "R2_T4_ABORT_RUNS_ROOT_INVALID",
  );
  for (const terminalFile of [
    "RESULTS.sha256",
    "results/audit-failure.json",
    "results/batch-stopped.json",
    "results/run-index.json",
    "results/setup-cost.json",
    "results/verdict.json",
  ]) {
    if (existsSync(join(outputRoot, terminalFile))) {
      throw new Error("R2_T4_ABORT_TERMINAL_ALREADY_EXISTS");
    }
  }

  const preregistrationHash = verifyR2Preregistration(preregRoot);
  const plan = readJson(join(preregRoot, "PREREGISTRATION.json"));
  verifyBoundSources(plan.sourceBindings);
  const authorization = readJson(resolve(authorizationPath));
  const authorizationEvidence = verifyR2OwnerAuthorization({
    authorization,
    preregistrationHash,
  });
  const manifest = readJson(join(preregRoot, "inputs/task-manifest.json"));
  const expectedRunIds = manifest.tasks.flatMap((task) => (
    task.armOrder.map((arm, index) => `${task.taskId}-${index + 1}-${arm}`)
  ));
  const runIds = readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => expectedRunIds.indexOf(left) - expectedRunIds.indexOf(right));
  if (runIds.length < 1
    || runIds.length >= expectedRunIds.length
    || runIds.some((runId, index) => runId !== expectedRunIds[index])
    || runIds.at(-1) !== failureRunId) {
    throw new Error("R2_T4_ABORT_RUN_SEQUENCE_INVALID");
  }

  const runs = [];
  let auditFailure;
  for (const runId of runIds) {
    const runRoot = requireDirectory(
      join(runsRoot, runId),
      "R2_T4_ABORT_RUN_ROOT_INVALID",
    );
    if (!verifyRunHashes(runRoot)) throw new Error("R2_T4_ABORT_RUN_HASH_INVALID");
    const stdout = readFileSync(join(runRoot, "stdout.jsonl"), "utf8");
    const stderr = readFileSync(join(runRoot, "stderr.txt"), "utf8");
    const recorded = readJson(join(runRoot, "run.json"));
    const ledger = readJson(join(runRoot, "receipt-ledger.json"));
    const evaluationPath = join(runRoot, "evaluation.json");
    if (runId !== failureRunId) {
      if (!existsSync(evaluationPath)) throw new Error("R2_T4_ABORT_EVALUATION_MISSING");
      const evaluation = readJson(evaluationPath);
      const audit = diagnoseR2CapsuleAudit({ jsonl: stdout, stderr });
      if (!audit.valid
        || evaluation.capsuleAudit !== "passed"
        || evaluation.evidenceHashesValid !== true
        || evaluation.evidenceSealed !== true) {
        throw new Error("R2_T4_ABORT_PRIOR_RUN_INVALID");
      }
      runs.push(evaluation);
      continue;
    }
    if (existsSync(evaluationPath)) throw new Error("R2_T4_ABORT_FAILURE_ALREADY_EVALUATED");
    const diagnosis = diagnoseR2CapsuleAudit({ jsonl: stdout, stderr });
    if (diagnosis.failureCode !== "CAPSULE_AUDIT_V2_ESCAPE"
      || diagnosis.forbiddenMarkers.length === 0) {
      throw new Error("R2_T4_ABORT_AUDIT_FAILURE_NOT_REPRODUCED");
    }
    const task = manifest.tasks.find((candidate) => runId.startsWith(`${candidate.taskId}-`));
    if (task === undefined) throw new Error("R2_T4_ABORT_TASK_NOT_FOUND");
    const groundTruth = readJson(
      join(preregRoot, `private/ground-truth/${task.taskId}.json`),
    );
    const selectedResponse = recorded.selectedResponse;
    const responseMatchesGroundTruth = recorded.successfulResponseComplete === true
      && selectedResponse?.relativeFile === groundTruth.expectedRelativeFile
      && selectedResponse?.line === groundTruth.expectedLine
      && (recorded.arm !== "vem-assisted"
        ? selectedResponse?.sourceAnchorId === null
        : selectedResponse?.sourceAnchorId === groundTruth.expectedSourceAnchorId);
    const failureEvaluation = {
      schemaVersion: "R2-T4-run-evaluation-v1",
      runId,
      taskId: task.taskId,
      arm: recorded.arm,
      model: recorded.model,
      outcome: "failed",
      failureCodes: [diagnosis.failureCode],
      exitCode: recorded.process.exitCode,
      signal: recorded.process.signal,
      threadId: extractThreadId(stdout),
      receiptDurationNs: (
        BigInt(ledger.lastReceivedAtNs) - BigInt(ledger.firstReceivedAtNs)
      ).toString(),
      responseMatchesGroundTruth,
      vemDirectPrimaryMatch: recorded.arm !== "vem-assisted"
        ? null
        : responseMatchesGroundTruth
          && selectedResponse.sourceAnchorId === groundTruth.expectedSourceAnchorId,
      capsuleAudit: "failed",
      evidenceHashesValid: true,
      instrumentationHash: recorded.instrumentationHash,
      ledgerContentHash: recorded.ledgerContentHash,
      baseContextHash: recorded.baseContextHash,
      treatmentHash: recorded.treatmentHash,
      preregistrationHashChanged: verifyR2Preregistration(preregRoot)
        !== preregistrationHash,
      groundTruthVisible: false,
      holdoutConsumed: false,
      priorTaskOrPromptReused: false,
      protocolFailure: false,
      wrongAttribution: !responseMatchesGroundTruth,
      evidenceSealed: false,
      successfulResponseComplete: recorded.successfulResponseComplete === true,
      failureEvidenceSealedBeforeReturn: false,
      postAbortEvidenceSealed: true,
    };
    writeJson(evaluationPath, failureEvaluation);
    runs.push(failureEvaluation);
    auditFailure = {
      schemaVersion: "R2-T4-audit-failure-v1",
      runId,
      failureCode: diagnosis.failureCode,
      forbiddenMarkers: diagnosis.forbiddenMarkers,
      commandEventLines: diagnosis.commandEventLines,
      recorderOutcome: recorded.outcome,
      authoritativeResponseStatus: recorded.authoritativeResponseStatus,
      recorderEvidenceHashManifestValid: true,
      failureEvidenceSealedBeforeReturn: false,
      postAbortEvidenceSealed: true,
      externalRetryPerformed: false,
    };
  }
  if (auditFailure === undefined) throw new Error("R2_T4_ABORT_FAILURE_MISSING");

  const prepareSetup = readJson(join(preregRoot, "inputs/prepare-setup-cost.json"));
  const verdict = buildR2AbortedVerdict({
    runs,
    prepareSetupDurationNs: prepareSetup.totalPrepareSetupDurationNs,
    expectedInstrumentationHash: plan.instrumentationHash,
  });
  writeJson(join(resultsRoot, "audit-failure.json"), auditFailure);
  writeJson(join(resultsRoot, "batch-stopped.json"), {
    schemaVersion: "R2-T4-batch-stopped-v1",
    failedRunId: failureRunId,
    completedRunCount: runs.length,
    remainingRunCount: expectedRunIds.length - runs.length,
    outcome: "capsule-integrity-failed",
    failureCodes: [auditFailure.failureCode],
    recorderEvidenceSealed: true,
    failureEvidenceSealedBeforeReturn: false,
    postAbortEvidenceSealed: true,
    successfulResponseComplete: runs.at(-1).successfulResponseComplete,
    externalRetryPerformed: false,
  });
  writeJson(join(resultsRoot, "verdict.json"), verdict);
  writeJson(join(resultsRoot, "run-index.json"), {
    schemaVersion: "R2-T4-run-index-v1",
    decisionKey: "R2-RECOVERY",
    decisionAttempt: 1,
    preregistrationHash,
    instrumentationHash: plan.instrumentationHash,
    authorizationHash: authorizationEvidence.authorizationHash,
    batchStopped: true,
    runIds,
    threadIds: runs.map((run) => run.threadId),
    ledgerContentHashes: runs.map((run) => run.ledgerContentHash),
    verdictHash: sha256(readFileSync(join(resultsRoot, "verdict.json"))),
  });
  writeJson(join(resultsRoot, "setup-cost.json"), {
    schemaVersion: "R2-T4-setup-cost-v1",
    preregistrationPrepareNs: prepareSetup.totalPrepareSetupDurationNs,
    capsuleSetupNs: null,
    totalSetupDurationNs: null,
    measurementStatus: "lower-bound-only",
    lowerBoundNs: prepareSetup.totalPrepareSetupDurationNs,
    incompleteReason: "frozen-runner-aborted-before-top-level-setup-cost-seal",
    perArmReceiptDurationsExcluded: true,
  });
  writeText(join(outputRoot, "RESULTS.sha256"), `${collectFiles(resultsRoot).map((path) => (
    `${sha256(readFileSync(path))}  ${relative(outputRoot, path).replaceAll("\\", "/")}`
  )).join("\n")}\n`);
  if (verifyR2Preregistration(preregRoot) !== preregistrationHash) {
    throw new Error("R2_T4_ABORT_PREREGISTRATION_CHANGED");
  }
  return Object.freeze({
    ok: true,
    verdict: verdict.verdict,
    preregistrationHash,
    instrumentationHash: plan.instrumentationHash,
    resultRoot: outputRoot,
    batchStopped: true,
    completedRunCount: runs.length,
    remainingRunCount: expectedRunIds.length - runs.length,
  });
}

function verifyBoundSources(sourceBindings) {
  if (typeof sourceBindings !== "object" || sourceBindings === null) {
    throw new Error("R2_T4_ABORT_SOURCE_BINDINGS_INVALID");
  }
  for (const [path, expectedHash] of Object.entries(sourceBindings)) {
    if (!/^[A-Za-z0-9._~/-]{1,512}$/u.test(path)
      || !/^[a-f0-9]{64}$/u.test(expectedHash)
      || sha256(readFileSync(join(REPO_ROOT, path))) !== expectedHash) {
      throw new Error("R2_T4_ABORT_BOUND_SOURCE_CHANGED");
    }
  }
}

function verifyRunHashes(runRoot) {
  const lines = readFileSync(join(runRoot, "SHA256SUMS"), "utf8")
    .trim().split("\n").filter(Boolean);
  return lines.length >= 6 && lines.every((line) => {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._-]+)$/u.exec(line);
    return match !== null && sha256(readFileSync(join(runRoot, match[2]))) === match[1];
  });
}

function extractThreadId(stdout) {
  for (const line of stdout.split("\n")) {
    if (line.length === 0) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "thread.started" && typeof event.thread_id === "string") {
        return event.thread_id;
      }
    } catch { return null; }
  }
  return null;
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R2_T4_ABORT_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R2_T4_ABORT_NON_REGULAR_FILE_REJECTED");
    }
  };
  visit(root);
  return files.sort();
}

function requireChildDirectory(path, parent, code) {
  const resolved = resolve(path);
  if (dirname(resolved) !== parent
    || !existsSync(resolved)
    || !lstatSync(resolved).isDirectory()
    || lstatSync(resolved).isSymbolicLink()) throw new Error(code);
  return resolved;
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  if (!existsSync(resolved)
    || !lstatSync(resolved).isDirectory()
    || lstatSync(resolved).isSymbolicLink()) throw new Error(code);
  return resolved;
}

function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeJson(path, value) { writeText(path, `${canonicalJson(value)}\n`); }
function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 7 || process.argv[2] !== "seal") {
    throw new Error(
      "USAGE: node scripts/pilot/r2-t4-abort-sealer.mjs seal "
      + "<preregistration-root> <result-root> <authorization-json> <failure-run-id>",
    );
  }
  const result = sealR2AbortedBatch({
    preregistrationRoot: process.argv[3],
    resultRoot: process.argv[4],
    authorizationPath: process.argv[5],
    failureRunId: process.argv[6],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
