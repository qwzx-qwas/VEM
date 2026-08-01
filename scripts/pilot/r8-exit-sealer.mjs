import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,63}$/u;
const CLASSIFICATIONS = new Set([
  "schema-valid-response",
  "deadline-timeout",
  "transport-failure",
  "runner-failure",
  "incomplete-final-output",
]);
const FINAL_OUTPUT_STATUSES = new Set(["valid", "empty", "missing", "invalid"]);
const TERMINAL_SEALS = Object.freeze([
  "processTreeTerminated",
  "streamsSealed",
  "finalObservationSealed",
  "ledgerSealed",
  "boundarySealed",
  "manifestsSealed",
]);

export async function runR8OneShotExit({
  resultRoot,
  authorizationLedgerRoot,
  authorizationId,
  execute,
}) {
  const root = requirePrivateEmptyDirectory(resultRoot, "R8_RESULT_ROOT_INVALID");
  const ledgerRoot = requirePrivateDirectory(
    authorizationLedgerRoot,
    "R8_AUTHORIZATION_LEDGER_INVALID",
  );
  if (!ID.test(authorizationId ?? "") || typeof execute !== "function") {
    throw new Error("R8_ONE_SHOT_REQUEST_INVALID");
  }
  claimAuthorization({ ledgerRoot, authorizationId, resultRoot: root });
  const state = {
    processAttemptCount: 0,
    processStarted: false,
    runId: null,
    terminal: null,
    exceptions: [],
  };
  const controller = Object.freeze({
    schemaVersion: "R8-T2-one-shot-controller-v1",
    maximumProcessAttempts: 1,
    maximumRetries: 0,
    markProcessStarted(runId) {
      if (state.processStarted || state.processAttemptCount !== 0 || !ID.test(runId ?? "")) {
        throw new Error("R8_SECOND_PROCESS_FORBIDDEN");
      }
      state.processStarted = true;
      state.processAttemptCount = 1;
      state.runId = runId;
      return snapshot(state);
    },
    sealTerminal(observation) {
      if (!state.processStarted || state.terminal !== null) {
        throw new Error("R8_TERMINAL_SEAL_INVALID");
      }
      state.terminal = normalizeTerminal(observation, state.runId);
      return snapshot(state);
    },
  });

  try {
    await execute(controller);
  } catch (error) {
    state.exceptions.push(Object.freeze({
      stage: state.processStarted ? "process-or-terminal" : "pre-spawn",
      code: safeErrorCode(error),
      rawMessagePersisted: false,
    }));
  }

  const terminalEvidenceComplete = state.terminal !== null
    && TERMINAL_SEALS.every((field) => state.terminal[field] === true);
  const successfulResponse = state.exceptions.length === 0
    && terminalEvidenceComplete
    && state.terminal.classification === "schema-valid-response"
    && state.terminal.responseSchemaValid === true
    && state.terminal.finalOutputStatus === "valid";
  const exitVerdict = successfulResponse ? "continue" : "stop";
  const failureReason = successfulResponse
    ? null
    : classifyFailure(state, terminalEvidenceComplete);
  const runRecord = {
    schemaVersion: "R8-T2-one-shot-run-v1",
    authorizationIdHash: sha256(authorizationId),
    processAttemptCount: state.processAttemptCount,
    remainingProcessAttemptBudget: 1 - state.processAttemptCount,
    maximumProcessAttempts: 1,
    maximumRetries: 0,
    retryAuthorized: false,
    retryProcessStarted: false,
    externalRerunPerformed: false,
    processStarted: state.processStarted,
    terminal: state.terminal,
  };
  const exceptionEvidence = {
    schemaVersion: "R8-T2-one-shot-exceptions-v1",
    exceptionCount: state.exceptions.length,
    exceptions: state.exceptions,
    rawMessagesPersisted: false,
  };
  const verdict = {
    schemaVersion: "R8-T2-one-shot-exit-verdict-v1",
    exitVerdict,
    failureReason,
    timeoutRequiresStop: state.terminal?.classification === "deadline-timeout",
    terminalEvidenceComplete,
    processAttemptCount: state.processAttemptCount,
    retryCount: 0,
    r9Allowed: false,
    productUnlockCount: 0,
    providerReachabilityIsMcpCorrectness: false,
    authoritativeDecisionRecorded: false,
    externalExecutionAuthorizedBySealer: false,
    evidenceSealedBeforeReturn: true,
  };
  writePrivate(join(root, "run.json"), `${canonicalJson(runRecord)}\n`);
  writePrivate(join(root, "exceptions.json"), `${canonicalJson(exceptionEvidence)}\n`);
  writePrivate(join(root, "verdict.json"), `${canonicalJson(verdict)}\n`);
  writeManifest(root, "RESULTS.sha256");
  if (!verifyR8OneShotManifest(root)) throw new Error("R8_RESULT_MANIFEST_INVALID");
  return Object.freeze({
    ok: successfulResponse,
    exitVerdict,
    failureReason,
    processAttemptCount: state.processAttemptCount,
    retryCount: 0,
    terminalEvidenceComplete,
    evidenceSealed: true,
    resultRoot: root,
  });
}

export function verifyR8OneShotManifest(rootPath) {
  const root = requirePrivateDirectory(rootPath, "R8_RESULT_ROOT_INVALID");
  const manifestPath = join(root, "RESULTS.sha256");
  if (!existsSync(manifestPath)) return false;
  const manifest = readFileSync(manifestPath, "utf8").trim().split("\n").filter(Boolean);
  const files = collectFiles(root).filter((entry) => entry.relativePath !== "RESULTS.sha256");
  return manifest.length === files.length && manifest.every((line, index) => {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/u.exec(line);
    return match !== null
      && match[2] === files[index].relativePath
      && match[1] === sha256(readFileSync(files[index].absolutePath));
  });
}

function normalizeTerminal(value, expectedRunId) {
  if (typeof value !== "object" || value === null || Array.isArray(value)
    || value.runId !== expectedRunId
    || !CLASSIFICATIONS.has(value.classification)
    || !FINAL_OUTPUT_STATUSES.has(value.finalOutputStatus)
    || typeof value.responseSchemaValid !== "boolean"
    || TERMINAL_SEALS.some((field) => typeof value[field] !== "boolean")) {
    throw new Error("R8_TERMINAL_OBSERVATION_INVALID");
  }
  return Object.freeze({
    runId: value.runId,
    classification: value.classification,
    finalOutputStatus: value.finalOutputStatus,
    responseSchemaValid: value.responseSchemaValid,
    ...Object.fromEntries(TERMINAL_SEALS.map((field) => [field, value[field]])),
  });
}

function classifyFailure(state, complete) {
  if (!state.processStarted) return "process-not-started";
  if (state.exceptions.length > 0) return "runner-or-sealer-exception";
  if (state.terminal === null) return "terminal-observation-missing";
  if (!complete) return "terminal-evidence-incomplete";
  if (state.terminal.classification === "deadline-timeout") return "deadline-timeout";
  if (state.terminal.classification !== "schema-valid-response") {
    return state.terminal.classification;
  }
  if (state.terminal.finalOutputStatus !== "valid") return "final-output-not-valid";
  return "response-schema-invalid";
}

function snapshot(state) {
  return Object.freeze({
    processAttemptCount: state.processAttemptCount,
    processStarted: state.processStarted,
    terminalSealed: state.terminal !== null,
  });
}

function claimAuthorization({ ledgerRoot, authorizationId, resultRoot }) {
  const claimPath = join(ledgerRoot, `${sha256(authorizationId)}.json`);
  if (existsSync(claimPath)) throw new Error("R8_AUTHORIZATION_ALREADY_CLAIMED");
  writePrivate(claimPath, `${canonicalJson({
    schemaVersion: "R8-T2-authorization-claim-v1",
    authorizationIdHash: sha256(authorizationId),
    resultRootIdentityHash: sha256(realpathSync(resultRoot)),
    maximumProcessAttempts: 1,
    maximumRetries: 0,
  })}\n`);
}

function requirePrivateEmptyDirectory(path, code) {
  const root = requirePrivateDirectory(path, code);
  if (readdirSync(root).length !== 0) throw new Error(code);
  return root;
}

function requirePrivateDirectory(path, code) {
  const root = resolve(path);
  if (!existsSync(root)) throw new Error(code);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error(code);
  }
  return realpathSync(root);
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) throw new Error("R8_RESULT_SYMLINK_FORBIDDEN");
      if (stat.isDirectory()) visit(absolutePath);
      else if (stat.isFile()) files.push({
        absolutePath,
        relativePath: relative(root, absolutePath),
      });
      else throw new Error("R8_RESULT_ENTRY_INVALID");
    }
  };
  visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function writeManifest(root, name) {
  const files = collectFiles(root).filter((entry) => basename(entry.absolutePath) !== name);
  writePrivate(join(root, name), `${files.map((entry) => (
    `${sha256(readFileSync(entry.absolutePath))}  ${entry.relativePath}`
  )).join("\n")}\n`);
}

function writePrivate(path, body) {
  writeFileSync(path, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

function safeErrorCode(error) {
  return ERROR_CODE.test(error?.message ?? "") ? error.message : "R8_UNEXPECTED_EXCEPTION";
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
