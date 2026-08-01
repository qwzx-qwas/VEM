import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import {
  cleanupR7Attempt,
  containR7UnspawnedAttempt,
  markR7AttemptProcessStarted,
  sealR7Attempt,
  snapshotR7Attempt,
} from "./r7-attempt-factory.mjs";

const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const STAGES = new Set([
  "retry-planning",
  "capsule-preparation",
  "spawn",
  "classification",
  "aggregate-evaluation",
  "terminal-manifest",
  "batch-execution",
  "cleanup",
]);

export async function runR7ExceptionSafeBatch({
  resultRoot,
  authorizationLedgerRoot,
  authorizationId,
  expectedArmCount,
  maxProcessAttempts,
  attemptFactory,
  runBatch,
  aggregate = () => ({ ok: true }),
  terminalManifestProbe = () => {},
  verdictFactory = null,
}) {
  const root = requirePrivateEmptyDirectory(resultRoot, "R7_BATCH_ROOT_INVALID");
  const ledgerRoot = requirePrivateDirectory(
    authorizationLedgerRoot,
    "R7_AUTHORIZATION_LEDGER_INVALID",
  );
  if (!ID.test(authorizationId ?? "")
    || !Number.isSafeInteger(expectedArmCount)
    || expectedArmCount < 1
    || expectedArmCount > 100
    || !Number.isSafeInteger(maxProcessAttempts)
    || maxProcessAttempts < expectedArmCount
    || maxProcessAttempts > 200
    || typeof attemptFactory?.prepare !== "function"
    || typeof runBatch !== "function"
    || typeof aggregate !== "function"
    || typeof terminalManifestProbe !== "function"
    || verdictFactory !== null && typeof verdictFactory !== "function") {
    throw new Error("R7_BATCH_REQUEST_INVALID");
  }
  claimAuthorization({ ledgerRoot, authorizationId, resultRoot: root });
  const resultsRoot = join(root, "results");
  mkdirSync(resultsRoot, { mode: 0o700 });

  const state = {
    authorizationId,
    expectedArmCount,
    maxProcessAttempts,
    handles: [],
    attempts: [],
    retryDecisions: [],
    completedArms: new Set(),
    processAttemptCount: 0,
    currentStage: "batch-execution",
    exceptions: [],
    externalRerunPerformed: false,
  };
  const controller = buildController(state, attemptFactory);

  try {
    await runBatch(controller);
  } catch (error) {
    recordException(state, state.currentStage, error);
  }
  containAndClean(state);

  let aggregateObservation = null;
  try {
    state.currentStage = "aggregate-evaluation";
    aggregateObservation = await aggregate(Object.freeze({
      attempts: Object.freeze([...state.attempts]),
      completedArmCount: state.completedArms.size,
      processAttemptCount: state.processAttemptCount,
    }));
  } catch (error) {
    recordException(state, "aggregate-evaluation", error);
  }
  try {
    state.currentStage = "terminal-manifest";
    await terminalManifestProbe(Object.freeze({
      exceptionCount: state.exceptions.length,
      processAttemptCount: state.processAttemptCount,
    }));
  } catch (error) {
    recordException(state, "terminal-manifest", error);
  }

  let stopped = state.exceptions.length > 0
    || state.completedArms.size !== expectedArmCount
    || state.attempts.some((attempt) => (
      attempt.processStarted && !attempt.evidenceSealed
    ));
  const retryAuthorized = state.retryDecisions.some((entry) => entry.authorized);
  const retryProcessStarted = state.retryDecisions.some(
    (entry) => entry.processStarted,
  );
  let suppliedVerdict = null;
  if (verdictFactory !== null) {
    try {
      suppliedVerdict = await verdictFactory(Object.freeze({
        stopped,
        aggregateObservation,
        attempts: Object.freeze([...state.attempts]),
        completedArmCount: state.completedArms.size,
        processAttemptCount: state.processAttemptCount,
        retryAuthorized,
        retryProcessStarted,
      }));
      if (typeof suppliedVerdict !== "object"
        || suppliedVerdict === null
        || Array.isArray(suppliedVerdict)
        || typeof suppliedVerdict.schemaVersion !== "string"
        || suppliedVerdict.schemaVersion.length < 1
        || typeof suppliedVerdict.verdict !== "string") {
        throw new Error("R7_VERDICT_FACTORY_RESULT_INVALID");
      }
    } catch (error) {
      recordException(state, "aggregate-evaluation", error);
      suppliedVerdict = null;
      stopped = true;
    }
  }
  const batchStop = {
    schemaVersion: "R7-T2-batch-stop-v1",
    stopped,
    failureCode: stopped ? "R7_BATCH_STOPPED" : null,
    expectedArmCount,
    completedArmCount: state.completedArms.size,
    processAttemptCount: state.processAttemptCount,
    remainingProcessAttemptBudget: maxProcessAttempts - state.processAttemptCount,
    preparedAttemptCount: state.handles.length,
    sealedProcessAttemptCount: state.attempts.filter((attempt) => (
      attempt.processStarted && attempt.evidenceSealed
    )).length,
    retryAuthorized,
    retryProcessStarted,
    unspawnedRetryConsumedBudget: false,
    externalRerunPerformed: false,
    priorAttemptEvidenceOverwritten: false,
    allSealedAttemptEvidenceRetained: state.attempts.every((attempt) => (
      attempt.evidenceSealed
    )),
  };
  const exceptionEvidence = {
    schemaVersion: "R7-T2-batch-exceptions-v1",
    exceptionCount: state.exceptions.length,
    exceptions: state.exceptions,
    rawMessagesPersisted: false,
  };
  const verdict = suppliedVerdict === null ? {
    schemaVersion: "R7-T2-local-batch-verdict-v1",
    outcome: stopped ? "stopped" : "completed",
    decision: "not-evaluated",
    externalExecutionAuthorized: false,
    productUnlockCount: 0,
    aggregateObservationHash: aggregateObservation === null
      ? null
      : sha256(canonicalJson(aggregateObservation)),
    exceptionCount: state.exceptions.length,
    evidenceSealedBeforeReturn: true,
  } : {
    ...suppliedVerdict,
    batchStopped: stopped,
    aggregateObservationHash: aggregateObservation === null
      ? null
      : sha256(canonicalJson(aggregateObservation)),
    exceptionCount: state.exceptions.length,
    evidenceSealedBeforeReturn: true,
  };
  writeJson(join(resultsRoot, "batch-stop.json"), batchStop);
  writeJson(join(resultsRoot, "exceptions.json"), exceptionEvidence);
  writeJson(join(resultsRoot, "retry-decisions.json"), {
    schemaVersion: "R7-T2-retry-decisions-v1",
    decisions: state.retryDecisions,
  });
  writeJson(join(resultsRoot, "run-index.json"), {
    schemaVersion: "R7-T2-run-index-v1",
    authorizationIdHash: sha256(authorizationId),
    processAttemptCount: state.processAttemptCount,
    completedArms: [...state.completedArms].sort(),
    attempts: state.attempts,
    batchStopHash: sha256(canonicalJson(batchStop)),
    exceptionEvidenceHash: sha256(canonicalJson(exceptionEvidence)),
    verdictHash: sha256(canonicalJson(verdict)),
  });
  writeJson(join(resultsRoot, "verdict.json"), verdict);
  writeManifest(root, "RESULTS.sha256");
  if (!verifyR7BatchManifest(root)) throw new Error("R7_BATCH_MANIFEST_INVALID");
  return Object.freeze({
    ok: !stopped,
    stopped,
    processAttemptCount: state.processAttemptCount,
    remainingProcessAttemptBudget: maxProcessAttempts - state.processAttemptCount,
    completedArmCount: state.completedArms.size,
    retryAuthorized,
    retryProcessStarted,
    exceptionCount: state.exceptions.length,
    evidenceSealed: true,
    resultRoot: root,
  });
}

export function verifyR7BatchManifest(rootPath) {
  const root = requirePrivateDirectory(rootPath, "R7_BATCH_ROOT_INVALID");
  const manifestPath = join(root, "RESULTS.sha256");
  if (!existsSync(manifestPath)) return false;
  const lines = readFileSync(manifestPath, "utf8").trim().split("\n").filter(Boolean);
  const files = collectFiles(root).filter((file) => file.relativePath !== "RESULTS.sha256");
  return lines.length === files.length && lines.every((line, index) => {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/u.exec(line);
    return match !== null
      && match[2] === files[index].relativePath
      && match[1] === sha256(readFileSync(files[index].absolutePath));
  });
}

function buildController(state, attemptFactory) {
  return Object.freeze({
    atStage: async (stage, callback) => {
      if (!STAGES.has(stage) || typeof callback !== "function") {
        throw new Error("R7_BATCH_STAGE_INVALID");
      }
      state.currentStage = stage;
      return callback();
    },
    prepareAttempt: (specification) => {
      state.currentStage = "capsule-preparation";
      const handle = attemptFactory.prepare(specification);
      state.handles.push(handle);
      return handle;
    },
    authorizeRetry: ({ armKey, nextAttemptNumber }) => {
      state.currentStage = "retry-planning";
      if (!ID.test(armKey ?? "")
        || nextAttemptNumber !== 2
        || state.retryDecisions.some((entry) => entry.armKey === armKey)) {
        throw new Error("R7_RETRY_AUTHORIZATION_INVALID");
      }
      state.retryDecisions.push({
        armKey,
        nextAttemptNumber,
        authorized: true,
        processStarted: false,
      });
    },
    markProcessStarted: (handle, runId) => {
      state.currentStage = "spawn";
      if (!ID.test(runId ?? "")
        || state.processAttemptCount >= state.maxProcessAttempts) {
        throw new Error("R7_PROCESS_BUDGET_EXHAUSTED");
      }
      if (handle.attemptNumber === 2) {
        const retry = state.retryDecisions.find((entry) => (
          entry.armKey === `${handle.taskId}:${handle.arm}`
        ));
        if (retry === undefined || retry.processStarted) {
          throw new Error("R7_RETRY_START_NOT_AUTHORIZED");
        }
        retry.processStarted = true;
      }
      markR7AttemptProcessStarted(handle);
      state.processAttemptCount += 1;
      const record = { handle, runId };
      state.attempts.push(record);
      return snapshotR7Attempt(handle);
    },
    sealAttempt: (handle, terminal) => {
      state.currentStage = "classification";
      const entry = state.attempts.find((candidate) => candidate.handle === handle);
      if (entry === undefined || entry.runId !== terminal?.runId) {
        throw new Error("R7_ATTEMPT_RECORD_INVALID");
      }
      const snapshot = sealR7Attempt(handle, terminal);
      Object.assign(entry, snapshot);
      return snapshot;
    },
    cleanupAttempt: (handle) => cleanupR7Attempt(handle),
    completeArm: (armKey) => {
      if (!ID.test(armKey ?? "") || state.completedArms.has(armKey)) {
        throw new Error("R7_ARM_COMPLETION_INVALID");
      }
      state.completedArms.add(armKey);
    },
    processAttemptCount: () => state.processAttemptCount,
  });
}

function containAndClean(state) {
  for (const handle of state.handles) {
    let snapshot = snapshotR7Attempt(handle);
    if (!snapshot.processStarted && !snapshot.evidenceSealed) {
      try {
        snapshot = containR7UnspawnedAttempt(handle, "R7_BATCH_EXCEPTION_BEFORE_SPAWN");
        state.attempts.push({ handle, runId: null, ...snapshot });
      } catch (error) {
        recordException(state, "cleanup", error);
      }
    }
    snapshot = snapshotR7Attempt(handle);
    if (snapshot.evidenceSealed && !snapshot.cleaned && !snapshot.cleanupFailed) {
      try {
        cleanupR7Attempt(handle);
      } catch (error) {
        recordException(state, "cleanup", error);
      }
    }
  }
  state.attempts = state.attempts.map((attempt) => {
    const snapshot = snapshotR7Attempt(attempt.handle);
    return { runId: attempt.runId, ...snapshot };
  });
}

function recordException(state, stage, error) {
  const code = error instanceof Error
    && /^[A-Z][A-Z0-9_]{1,63}$/u.test(error.message)
    ? error.message
    : "R7_CONTAINED_EXCEPTION";
  state.exceptions.push(Object.freeze({
    stage: STAGES.has(stage) ? stage : "batch-execution",
    code,
    fingerprint: sha256(`${stage}:${code}`),
  }));
}

function claimAuthorization({ ledgerRoot, authorizationId, resultRoot }) {
  const marker = join(ledgerRoot, `${sha256(authorizationId)}.json`);
  writeFileSync(marker, `${canonicalJson({
    schemaVersion: "R7-T2-authorization-result-root-v1",
    authorizationIdHash: sha256(authorizationId),
    resultRootIdentityHash: sha256(realpathSync(resultRoot)),
    resultRootBasename: basename(resultRoot),
    rerunAllowed: false,
  })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

function writeManifest(root, name) {
  const lines = collectFiles(root)
    .filter((file) => file.relativePath !== name)
    .map((file) => `${sha256(readFileSync(file.absolutePath))}  ${file.relativePath}`);
  writeFileSync(join(root, name), `${lines.join("\n")}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) throw new Error("R7_BATCH_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push({ absolutePath, relativePath });
      else throw new Error("R7_BATCH_UNSAFE_NODE");
    }
  };
  visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function requirePrivateEmptyDirectory(path, code) {
  const root = requirePrivateDirectory(path, code);
  if (readdirSync(root).length !== 0) throw new Error(code);
  return root;
}

function requirePrivateDirectory(path, code) {
  const root = resolve(path);
  if (!existsSync(root)) mkdirSync(root, { recursive: false, mode: 0o700 });
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root) {
    throw new Error(code);
  }
  chmodSync(root, 0o700);
  if ((lstatSync(root).mode & 0o777) !== 0o700) throw new Error(code);
  return root;
}

function writeJson(path, value) {
  writeFileSync(path, `${canonicalJson(value)}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
