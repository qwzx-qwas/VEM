import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { canonicalJson } from "../../packages/pilot-harness/dist/index.js";
import { auditCodexJsonlV3 } from "./capsule-audit-v3.mjs";

const MAX_STDOUT_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 16 * 1024 * 1024;
const MAX_CONTROL_BYTES = 1024 * 1024;
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 256;
const MAX_RUNS = 10;
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const MANIFEST_LINE = /^([a-f0-9]{64}) {2}([A-Za-z0-9._-]{1,128})$/u;
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._~/-]{1,512}$/u;

const REQUIRED_RECORDER_FILES = Object.freeze([
  "stdout.jsonl",
  "stderr.txt",
  "final-response-observation.json",
  "receipt-ledger.json",
  "run.json",
  "SHA256SUMS",
]);

export function finalizeR3RecordedRun({
  runRoot,
  groundTruth,
  forbiddenContentNeedles = [],
  audit = auditCodexJsonlV3,
  verifyRecorderEvidence = verifyRecorderHashManifest,
  evaluationProbe = () => {},
}) {
  const root = requireOwnedDirectory(runRoot, "R3_FINALIZER_RUN_ROOT_INVALID");
  const terminalRoot = join(root, "r3-terminal");
  if (existsSync(terminalRoot) || existsSync(join(root, "R3-SHA256SUMS"))) {
    throw new Error("R3_FINALIZER_ALREADY_FINALIZED");
  }
  mkdirSync(terminalRoot, { mode: 0o700 });

  const errors = [];
  const baseScan = scanEvidenceTree(root, { excludeTerminal: true });
  if (baseScan.unsafeNodeFingerprints.length > 0) {
    errors.push(stageError(
      "base-evidence-scan",
      new Error("R3_BASE_EVIDENCE_UNSAFE_NODE"),
    ));
  }

  const observed = {
    stdout: readStageFile(root, "stdout.jsonl", MAX_STDOUT_BYTES, errors),
    stderr: readStageFile(root, "stderr.txt", MAX_STDERR_BYTES, errors),
    run: readJsonStage(root, "run.json", MAX_CONTROL_BYTES, errors),
    ledger: readJsonStage(root, "receipt-ledger.json", MAX_LEDGER_BYTES, errors),
    finalObservation: readJsonStage(
      root,
      "final-response-observation.json",
      MAX_CONTROL_BYTES,
      errors,
    ),
  };
  const runId = ID.test(observed.run?.runId ?? "")
    ? observed.run.runId
    : "unknown-run";

  let recorderEvidenceValid = false;
  try {
    recorderEvidenceValid = verifyRecorderEvidence(root) === true;
    if (!recorderEvidenceValid) throw new Error("R3_RECORDER_HASH_INVALID");
  } catch (error) {
    errors.push(stageError("recorder-hash-verification", error));
  }

  let auditResult = null;
  try {
    auditResult = audit({
      jsonl: observed.stdout ?? "",
      stderr: observed.stderr ?? "",
      forbiddenContentNeedles,
    });
    if (!isAuditResult(auditResult)) throw new Error("R3_AUDIT_RESULT_INVALID");
  } catch (error) {
    errors.push(stageError("capsule-audit", error));
  }
  const sealedAudit = auditResult === null
    ? {
        schemaVersion: "R3-T2-capsule-audit-observation-v1",
        status: "exception",
        valid: false,
        failureCodes: ["R3_AUDIT_EXCEPTION"],
        warningCodes: [],
        eventCount: null,
        threadCount: null,
      }
    : {
        schemaVersion: "R3-T2-capsule-audit-observation-v1",
        status: auditResult.valid ? "passed" : "failed",
        valid: auditResult.valid,
        failureCodes: [...auditResult.failureCodes],
        warningCodes: auditWarningCodes(auditResult),
        eventCount: auditResult.eventCount,
        threadCount: auditResult.threadIds.length,
      };
  writeJson(join(terminalRoot, "capsule-audit.json"), sealedAudit);

  let groundTruthObservation;
  try {
    const selectedResponse = observed.run?.selectedResponse ?? null;
    const groundTruthHash = canonicalHashBounded(groundTruth, "R3_GROUND_TRUTH_INVALID");
    const selectedResponseHash = selectedResponse === null
      ? null
      : canonicalHashBounded(selectedResponse, "R3_SELECTED_RESPONSE_INVALID");
    groundTruthObservation = {
      schemaVersion: "R3-T2-ground-truth-observation-v1",
      status: "observed",
      groundTruthSha256: groundTruthHash,
      selectedResponseSha256: selectedResponseHash,
      responseMatchesGroundTruth: selectedResponseHash !== null
        && selectedResponseHash === groundTruthHash,
      valuesPersisted: false,
    };
  } catch (error) {
    errors.push(stageError("ground-truth-observation", error));
    groundTruthObservation = {
      schemaVersion: "R3-T2-ground-truth-observation-v1",
      status: "exception",
      groundTruthSha256: null,
      selectedResponseSha256: null,
      responseMatchesGroundTruth: null,
      valuesPersisted: false,
    };
  }
  writeJson(
    join(terminalRoot, "ground-truth-observation.json"),
    groundTruthObservation,
  );

  try {
    evaluationProbe(Object.freeze({
      runId,
      recorderEvidenceValid,
      auditValid: auditResult?.valid === true,
      responseMatchesGroundTruth: groundTruthObservation.responseMatchesGroundTruth,
    }));
  } catch (error) {
    errors.push(stageError("evaluator", error));
  }

  const auditFailureCodes = auditResult?.valid === false
    ? auditResult.failureCodes
    : [];
  const recorderFailureCodes = Array.isArray(observed.run?.failureCodes)
    ? observed.run.failureCodes.filter((code) => (
        typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(code)
      ))
    : [];
  const containedFailureCodes = [...new Set([
    ...recorderFailureCodes,
    ...auditFailureCodes,
    ...errors.map((entry) => entry.code),
  ])].sort();
  const protocolFailure = observed.run?.successfulResponseComplete !== true;
  const attribution = protocolFailure
    || groundTruthObservation.responseMatchesGroundTruth === null
    ? null
    : groundTruthObservation.responseMatchesGroundTruth ? "correct" : "wrong";
  const failureCodes = attribution === "wrong"
    ? [...containedFailureCodes, "R3_WRONG_ATTRIBUTION"].sort()
    : containedFailureCodes;
  const outcome = failureCodes.length === 0
    && recorderEvidenceValid
    && auditResult?.valid === true
    && attribution === "correct"
    ? "success"
    : observed.run?.outcome === "cancelled" ? "cancelled" : "failed";
  const evaluation = {
    schemaVersion: "R3-T2-run-evaluation-v1",
    runId,
    outcome,
    failureCodes,
    recorderOutcome: safeRecorderOutcome(observed.run?.outcome),
    recorderEvidenceValid,
    capsuleAudit: auditResult?.valid === true ? "passed" : "failed",
    protocolFailure,
    attribution,
    responseMatchesGroundTruth: groundTruthObservation.responseMatchesGroundTruth,
    groundTruthVisibleToParticipant: false,
    successfulResponseComplete: observed.run?.successfulResponseComplete === true,
    failureEvidenceSealedBeforeReturn: true,
  };
  writeJson(join(terminalRoot, "evaluation.json"), evaluation);
  if (errors.length > 0) {
    writeJson(join(terminalRoot, "errors.json"), {
      schemaVersion: "R3-T2-contained-errors-v1",
      runId,
      errorCount: errors.length,
      errors,
      rawMessagesPersisted: false,
    });
  }
  const terminal = {
    schemaVersion: "R3-T2-run-terminal-v1",
    runId,
    outcome,
    failureCodes,
    rawEvidencePresent: observed.stdout !== null && observed.stderr !== null,
    finalEvidencePresent: observed.finalObservation !== null,
    terminalEvidencePresent: observed.run !== null,
    ledgerEvidencePresent: observed.ledger !== null,
    recorderHashManifestPresent: existsSync(join(root, "SHA256SUMS")),
    unsafeBaseNodeCount: baseScan.unsafeNodeFingerprints.length,
    unsafeBaseNodeFingerprints: baseScan.unsafeNodeFingerprints,
    exceptionCount: errors.length,
    evidenceSealedBeforeReturn: true,
  };
  writeJson(join(terminalRoot, "terminal.json"), terminal);
  writeOuterManifest(root, "R3-SHA256SUMS");
  if (!verifyOuterManifest(root, "R3-SHA256SUMS")) {
    throw new Error("R3_FINALIZER_OUTER_MANIFEST_INVALID");
  }
  return deepFreeze({
    ok: outcome === "success",
    runId,
    outcome,
    failureCodes,
    capsuleAudit: evaluation.capsuleAudit,
    attribution,
    evidenceSealed: true,
    terminalRoot,
  });
}

export function sealR3BatchOutcome({
  resultRoot,
  runs,
  expectedRunCount,
  aggregateProbe = () => {},
}) {
  const root = requireOwnedDirectory(resultRoot, "R3_BATCH_ROOT_INVALID");
  if (!Array.isArray(runs)
    || runs.length > MAX_RUNS
    || !Number.isSafeInteger(expectedRunCount)
    || expectedRunCount < 1
    || expectedRunCount > MAX_RUNS
    || runs.length > expectedRunCount
    || new Set(runs.map((run) => run?.runId)).size !== runs.length
    || runs.some((run) => (
      typeof run !== "object"
      || run === null
      || !ID.test(run.runId ?? "")
      || !["success", "failed", "cancelled"].includes(run.outcome)
      || run.evidenceSealed !== true
    ))) {
    throw new Error("R3_BATCH_INPUT_INVALID");
  }
  const terminalRoot = join(root, "r3-batch-terminal");
  if (existsSync(terminalRoot) || existsSync(join(root, "R3-BATCH-SHA256SUMS"))) {
    throw new Error("R3_BATCH_ALREADY_FINALIZED");
  }
  mkdirSync(terminalRoot, { mode: 0o700 });
  const errors = [];
  try {
    aggregateProbe(Object.freeze(runs.map((run) => Object.freeze({
      runId: run.runId,
      outcome: run.outcome,
    }))));
  } catch (error) {
    errors.push(stageError("aggregate", error));
  }
  const completedRunCount = runs.length;
  const failedRun = runs.find((run) => run.outcome !== "success");
  const batchStopped = failedRun !== undefined
    || errors.length > 0
    || completedRunCount !== expectedRunCount;
  if (errors.length > 0) {
    writeJson(join(terminalRoot, "aggregate-errors.json"), {
      schemaVersion: "R3-T2-aggregate-errors-v1",
      errorCount: errors.length,
      errors,
      rawMessagesPersisted: false,
    });
  }
  const terminal = {
    schemaVersion: "R3-T2-batch-terminal-v1",
    outcome: batchStopped ? "stopped" : "completed",
    batchStopped,
    failedRunId: failedRun?.runId ?? null,
    completedRunCount,
    remainingRunCount: expectedRunCount - completedRunCount,
    expectedRunCount,
    aggregateExceptionCount: errors.length,
    runIds: runs.map((run) => run.runId),
    allRunEvidenceSealed: runs.every((run) => run.evidenceSealed === true),
    evidenceSealedBeforeReturn: true,
  };
  writeJson(join(terminalRoot, "batch-terminal.json"), terminal);
  writeOuterManifest(root, "R3-BATCH-SHA256SUMS");
  if (!verifyOuterManifest(root, "R3-BATCH-SHA256SUMS")) {
    throw new Error("R3_BATCH_OUTER_MANIFEST_INVALID");
  }
  return deepFreeze({
    ok: !batchStopped,
    batchStopped,
    completedRunCount,
    remainingRunCount: terminal.remainingRunCount,
    failedRunId: terminal.failedRunId,
    evidenceSealed: true,
  });
}

export function verifyRecorderHashManifest(runRoot) {
  const root = requireOwnedDirectory(runRoot, "R3_RECORDER_ROOT_INVALID");
  const manifestBody = readBoundedRegularFile(
    join(root, "SHA256SUMS"),
    MAX_CONTROL_BYTES,
    "R3_RECORDER_MANIFEST_INVALID",
  ).toString("utf8");
  const lines = manifestBody.trim().split(/\r?\n/u).filter(Boolean);
  const seen = new Set();
  if (lines.length < 6 || lines.length > 12) return false;
  for (const line of lines) {
    const match = MANIFEST_LINE.exec(line);
    if (match === null || seen.has(match[2])) return false;
    seen.add(match[2]);
    const path = join(root, match[2]);
    const body = readBoundedRegularFile(
      path,
      recorderFileLimit(match[2]),
      "R3_RECORDER_EVIDENCE_INVALID",
    );
    if (sha256(body) !== match[1]) return false;
  }
  const allowedRootFiles = new Set([...seen, "SHA256SUMS"]);
  const rootEntriesValid = readdirSync(root, { withFileTypes: true }).every((entry) => (
    entry.name === "r3-terminal"
      ? entry.isDirectory() && !entry.isSymbolicLink()
      : entry.isFile()
        && !entry.isSymbolicLink()
        && allowedRootFiles.has(entry.name)
  ));
  return rootEntriesValid
    && allowedRootFiles.size === seen.size + 1
    && REQUIRED_RECORDER_FILES
    .filter((path) => path !== "SHA256SUMS")
    .every((path) => seen.has(path));
}

export function verifyOuterManifest(rootPath, manifestName) {
  const root = requireOwnedDirectory(rootPath, "R3_OUTER_ROOT_INVALID");
  const manifest = readBoundedRegularFile(
    join(root, manifestName),
    MAX_CONTROL_BYTES,
    "R3_OUTER_MANIFEST_INVALID",
  ).toString("utf8");
  const lines = manifest.trim().split(/\r?\n/u).filter(Boolean);
  const expected = scanEvidenceTree(root, {
    excludedNames: new Set([manifestName]),
  });
  if (lines.length !== expected.files.length) return false;
  return lines.every((line, index) => {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._~/-]{1,512})$/u.exec(line);
    return match !== null
      && match[2] === expected.files[index].relativePath
      && match[1] === sha256(readFileSync(expected.files[index].absolutePath));
  });
}

function readStageFile(root, name, maxBytes, errors) {
  try {
    return readBoundedRegularFile(
      join(root, name),
      maxBytes,
      "R3_BASE_EVIDENCE_INVALID",
    ).toString("utf8");
  } catch (error) {
    errors.push(stageError(`read-${name}`, error));
    return null;
  }
}

function readJsonStage(root, name, maxBytes, errors) {
  const text = readStageFile(root, name, maxBytes, errors);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("R3_BASE_JSON_INVALID");
    }
    return parsed;
  } catch (error) {
    errors.push(stageError(`parse-${name}`, error));
    return null;
  }
}

function readBoundedRegularFile(path, maxBytes, code) {
  let descriptor;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) {
      throw new Error(code);
    }
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error(code);
    }
    return readFileSync(descriptor);
  } catch {
    throw new Error(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function scanEvidenceTree(root, {
  excludeTerminal = false,
  excludedNames = new Set(),
} = {}) {
  const files = [];
  const unsafeNodeFingerprints = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
      if (excludedNames.has(relativePath)
        || (excludeTerminal && relativePath === "r3-terminal")) continue;
      if (!SAFE_RELATIVE_PATH.test(relativePath)) {
        unsafeNodeFingerprints.push(sha256(`unsafe-path:${relativePath}`));
      } else if (entry.isSymbolicLink()) {
        unsafeNodeFingerprints.push(sha256(`symlink:${relativePath}`));
      } else if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push({ absolutePath, relativePath });
      } else {
        unsafeNodeFingerprints.push(sha256(`non-regular:${relativePath}`));
      }
      if (files.length + unsafeNodeFingerprints.length > MAX_FILES) {
        throw new Error("R3_EVIDENCE_FILE_LIMIT_EXCEEDED");
      }
    }
  };
  visit(root);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  unsafeNodeFingerprints.sort();
  return { files, unsafeNodeFingerprints };
}

function writeOuterManifest(root, manifestName) {
  const scanned = scanEvidenceTree(root, {
    excludedNames: new Set([manifestName]),
  });
  const body = `${scanned.files.map(({ absolutePath, relativePath }) => (
    `${sha256(readFileSync(absolutePath))}  ${relativePath}`
  )).join("\n")}\n`;
  writeText(join(root, manifestName), body);
}

function isAuditResult(value) {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && typeof value.valid === "boolean"
    && Number.isSafeInteger(value.eventCount)
    && value.eventCount >= 0
    && Array.isArray(value.threadIds)
    && value.threadIds.every((id) => typeof id === "string" && ID.test(id))
    && Array.isArray(value.failureCodes)
    && value.failureCodes.every((code) => (
      typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(code)
    ))
    && (value.warningCodes === undefined
      || (Array.isArray(value.warningCodes)
        && value.warningCodes.every((code) => (
          typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(code)
        )))
    && (value.attemptedDiscoveryWarningCount === undefined
      || (Number.isSafeInteger(value.attemptedDiscoveryWarningCount)
        && value.attemptedDiscoveryWarningCount >= 0)));
}

function auditWarningCodes(auditResult) {
  if (Array.isArray(auditResult.warningCodes)) {
    return [...auditResult.warningCodes];
  }
  return auditResult.attemptedDiscoveryWarningCount > 0
    ? ["CAPSULE_AUDIT_V3_DISCOVERY_ATTEMPT"]
    : [];
}

function canonicalHashBounded(value, code) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  const serialized = canonicalJson(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_CONTROL_BYTES) {
    throw new Error(code);
  }
  return sha256(serialized);
}

function recorderFileLimit(name) {
  if (name === "stdout.jsonl") return MAX_STDOUT_BYTES;
  if (name === "stderr.txt") return MAX_STDERR_BYTES;
  if (name === "receipt-ledger.json") return MAX_LEDGER_BYTES;
  return MAX_CONTROL_BYTES;
}

function stageError(stage, error) {
  const rawCode = error instanceof Error ? error.message : "";
  const code = /^[A-Z][A-Z0-9_]{1,63}$/u.test(rawCode)
    ? rawCode
    : "R3_INTERNAL_EXCEPTION";
  const fingerprintSource = error instanceof Error
    ? `${error.name}:${error.message}`
    : typeof error;
  return Object.freeze({
    stage,
    code,
    errorFingerprint: sha256(fingerprintSource),
    rawMessagePersisted: false,
  });
}

function safeRecorderOutcome(value) {
  return ["success", "failed", "cancelled"].includes(value) ? value : "unknown";
}

function requireOwnedDirectory(path, code) {
  const resolved = resolve(path);
  let real;
  try {
    const stat = lstatSync(resolved);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
    real = realpathSync(resolved);
    if (real !== resolved) throw new Error(code);
  } catch {
    throw new Error(code);
  }
  return real;
}

function writeJson(path, value) {
  writeText(path, `${canonicalJson(value)}\n`);
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, value, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
