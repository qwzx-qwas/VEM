import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import {
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import { buildR3CodexCapsuleInvocation } from "./r3-capsule.mjs";
import {
  classifyR6AttemptFour,
  planR6AttemptFourRetry,
  sealR6AttemptFourEvidence,
} from "./r6-attempt-four-policy.mjs";
import {
  evaluateR6T13Recovery,
  R6_T13_MODEL,
} from "./r6-attempt-four-plan.mjs";
import { verifyR5EvidenceManifest } from "./r5-process-terminalizer.mjs";
import {
  verifyR6T12Preregistration,
  verifyR6T13OwnerAuthorization,
} from "./r6-t13.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const PREREGISTRATION_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T12");
const RESULT_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T13");
const PUBLISHED_COMMIT = "53e2e1093fd107476efdc236afc07a75affabead";
const EXPECTED_RUN_ID =
  "r6-network-terminal-01-policy-heading-direct-search-attempt-1";
const ABORT_CODE = "R6_T13_RETRY_CAPSULE_OUTPUT_REUSED";
const UNDERLYING_CODE = "R2_CAPSULE_OUTPUT_ALREADY_PREPARED";

export function buildR6T13AbortedVerdict({
  arm,
  processAttempt,
  totalSetupDurationNs,
  expectedInstrumentationHash,
}) {
  const verdict = evaluateR6T13Recovery({
    arms: [arm],
    processAttempts: [processAttempt],
    totalSetupDurationNs,
    expectedInstrumentationHash,
    aggregateIntegrityPassed: false,
  });
  if (verdict.verdict !== "stop"
    || canonicalJson(verdict.stopReasons)
      !== canonicalJson(["aggregate-integrity-failed"])
    || !verdict.adjustReasons.includes(
      "fewer-than-ten-arms-complete-after-bounded-attempts",
    )
    || verdict.metrics.successfulArmCount !== 0
    || verdict.metrics.processAttemptCount !== 1
    || verdict.metrics.aggregateIntegrityPassed !== false) {
    throw new Error("R6_T13_ABORT_VERDICT_INVALID");
  }
  return verdict;
}

export function reproduceR6T13RetryOutputReuse({
  preregistrationRoot,
  taskId,
}) {
  const capsule = createParticipantCapsule({
    sourceRoot: join(preregistrationRoot, "fixture"),
    taskId: `${taskId}-abort-reproduction`,
    arm: "direct-search",
    responseSchemaPath: join(
      preregistrationRoot,
      "inputs/response-schema.json",
    ),
  });
  const options = {
    capsule,
    prompt: readRegular(
      join(preregistrationRoot, `participant/tasks/${taskId}/prompt.txt`),
    ).toString("utf8").trimEnd(),
    model: R6_T13_MODEL,
    authFile: join(homedir(), ".codex/auth.json"),
  };
  let observedCode = null;
  try {
    buildR3CodexCapsuleInvocation(options);
    try {
      buildR3CodexCapsuleInvocation(options);
    } catch (error) {
      observedCode = error instanceof Error ? error.message : null;
    }
  } finally {
    cleanupParticipantCapsule(capsule);
  }
  if (observedCode !== UNDERLYING_CODE) {
    throw new Error("R6_T13_ABORT_NOT_REPRODUCED");
  }
  return Object.freeze({
    schemaVersion: "R6-T13-runner-exception-v1",
    failureCode: ABORT_CODE,
    underlyingFailureCode: observedCode,
    trigger: "frozen-runner-reused-capsule-before-retry-spawn",
    firstInvocationPrepared: true,
    retryInvocationPrepared: false,
    retryProcessSpawned: false,
    externalProcessAttemptCount: 1,
    retryWasAuthorizedByFrozenClassifier: true,
    frozenRuntimeSourceChangedBeforeExecution: false,
    postAbortExternalCallPerformed: false,
    aggregateIntegrityPassed: false,
    postAbortEvidenceSealed: true,
  });
}

export function sealR6T13AbortedBatch({
  preregistrationRoot,
  resultRoot,
  authorizationPath,
}) {
  const preregRoot = requireExactChild(
    preregistrationRoot,
    PREREGISTRATION_PARENT,
    "R6_T13_ABORT_PREREGISTRATION_INVALID",
  );
  const outputRoot = requireExactChild(
    resultRoot,
    RESULT_PARENT,
    "R6_T13_ABORT_RESULT_INVALID",
  );
  for (const path of [
    "RESULTS.sha256",
    "results/attempt-classification.json",
    "results/batch-stopped.json",
    "results/retry-decision.json",
    "results/run-index.json",
    "results/runner-exception.json",
    "results/verdict.json",
  ]) {
    if (existsSync(join(outputRoot, path))) {
      throw new Error("R6_T13_ABORT_TERMINAL_ALREADY_EXISTS");
    }
  }

  const verified = verifyR6T12Preregistration(preregRoot);
  const authorization = readJson(resolve(authorizationPath));
  if (authorization.publishedCommit !== PUBLISHED_COMMIT) {
    throw new Error("R6_T13_ABORT_PUBLISHED_COMMIT_INVALID");
  }
  const authorizationEvidence = verifyR6T13OwnerAuthorization({
    authorization,
    preregistrationHash: verified.preregistrationHash,
    dataScopeHash: verified.plan.dataScopeHash,
    terminationPolicy: verified.plan.terminationPolicy,
    outerEnvironmentHash: verified.plan.outerEnvironmentHash,
    failureContractHash: verified.plan.failureContractHash,
    failureCandidateHash: verified.plan.failureCandidateHash,
  });
  const preflight = readJson(join(outputRoot, "results/local-preflight.json"));
  if (preflight.schemaVersion !== "R6-T13-local-preflight-v1"
    || preflight.ok !== true
    || preflight.modelCall !== false
    || preflight.networkRuntimeProbed !== false
    || preflight.failureCandidateHash !== verified.plan.failureCandidateHash
    || preflight.outerEnvironmentHash !== verified.plan.outerEnvironmentHash) {
    throw new Error("R6_T13_ABORT_PREFLIGHT_INVALID");
  }

  const runsRoot = requireDirectory(
    join(outputRoot, "runs"),
    "R6_T13_ABORT_RUNS_INVALID",
  );
  const runIds = readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name).sort();
  if (canonicalJson(runIds) !== canonicalJson([EXPECTED_RUN_ID])) {
    throw new Error("R6_T13_ABORT_RUN_SEQUENCE_INVALID");
  }
  const runRoot = requireDirectory(
    join(runsRoot, EXPECTED_RUN_ID),
    "R6_T13_ABORT_RUN_INVALID",
  );
  if (!verifyR5EvidenceManifest(runRoot)) {
    throw new Error("R6_T13_ABORT_RUN_MANIFEST_INVALID");
  }

  const events = readJsonl(join(runRoot, "stdout.jsonl"));
  const run = readJson(join(runRoot, "run.json"));
  const termination = readJson(join(runRoot, "termination.json"));
  const finalResponse = readJson(
    join(runRoot, "final-response-observation.json"),
  );
  const boundary = readJson(join(runRoot, "boundary-state.json"));
  const classification = classifyR6AttemptFour({
    run,
    termination,
    finalResponse,
    boundary,
    events,
    evidenceSealed: true,
    failurePolicy: verified.plan.failurePolicy,
  });
  if (classification.kind !== "external-transport-timeout-before-response"
    || classification.retryable !== true) {
    throw new Error("R6_T13_ABORT_CLASSIFICATION_INVALID");
  }
  const evidenceHashes = Object.fromEntries(collectFiles(runRoot).map(
    ({ absolutePath, relativePath }) => [
      relativePath,
      sha256(readFileSync(absolutePath)),
    ],
  ));
  const sealedAttempt = sealR6AttemptFourEvidence({
    runId: EXPECTED_RUN_ID,
    armKey: "r6-network-terminal-01-policy-heading:direct-search",
    attemptNumber: 1,
    classification,
    evidenceHashes,
  });
  const retryDecision = planR6AttemptFourRetry({
    armKey: sealedAttempt.armKey,
    attempts: [sealedAttempt],
    batchProcessAttemptCount: 1,
  });
  if (retryDecision.action !== "retry"
    || retryDecision.reason !== "sealed-provider-timeout-before-response"
    || retryDecision.nextAttemptNumber !== 2) {
    throw new Error("R6_T13_ABORT_RETRY_DECISION_INVALID");
  }

  const ledger = readJson(join(runRoot, "receipt-ledger.json"));
  const firstNs = ledger.entries?.at(0)?.receivedAtNs;
  const lastNs = ledger.entries?.at(-1)?.receivedAtNs;
  if (!/^[0-9]+$/u.test(firstNs ?? "")
    || !/^[0-9]+$/u.test(lastNs ?? "")
    || BigInt(lastNs) < BigInt(firstNs)) {
    throw new Error("R6_T13_ABORT_LEDGER_INVALID");
  }
  const durationNs = (BigInt(lastNs) - BigInt(firstNs)).toString();
  const threadIds = events.filter((event) => event.type === "thread.started")
    .map((event) => event.thread_id);
  if (threadIds.length !== 1 || typeof threadIds[0] !== "string") {
    throw new Error("R6_T13_ABORT_THREAD_INVALID");
  }
  const processAttempt = {
    runId: EXPECTED_RUN_ID,
    armKey: sealedAttempt.armKey,
    attemptNumber: 1,
    classification: classification.kind,
    retried: true,
    retryProcessStarted: false,
    evidenceSealed: true,
    evidenceRetained: true,
    processTreeTerminated: classification.evidence.processTreeTerminated,
    terminalContradiction: false,
    wrongAttribution: false,
    responseMatchesGroundTruth: null,
    threadId: threadIds[0],
    attemptEvidenceHash: sealedAttempt.attemptEvidenceHash,
  };
  const arm = {
    taskId: "r6-network-terminal-01-policy-heading",
    arm: "direct-search",
    success: false,
    retryExhausted: false,
    totalArmDurationNs: durationNs,
    instrumentationHash: verified.plan.instrumentationHash,
    groundTruthVisible: false,
    holdoutConsumed: false,
    priorTaskOrPromptReused: false,
    attemptBudgetDrift: false,
    wrongAttribution: false,
  };
  const prepareSetup = readJson(
    join(preregRoot, "inputs/prepare-setup-cost.json"),
  );
  const verdict = buildR6T13AbortedVerdict({
    arm,
    processAttempt,
    totalSetupDurationNs: prepareSetup.totalPrepareSetupDurationNs,
    expectedInstrumentationHash: verified.plan.instrumentationHash,
  });
  const exception = reproduceR6T13RetryOutputReuse({
    preregistrationRoot: preregRoot,
    taskId: arm.taskId,
  });

  const resultsRoot = join(outputRoot, "results");
  writeJson(join(resultsRoot, "attempt-classification.json"), {
    ...sealedAttempt,
    retryDecisionHash: canonicalSha256(retryDecision),
  });
  writeJson(join(resultsRoot, "retry-decision.json"), retryDecision);
  writeJson(join(resultsRoot, "runner-exception.json"), exception);
  writeJson(join(resultsRoot, "batch-stopped.json"), {
    schemaVersion: "R6-T13-batch-stopped-v1",
    failureCode: ABORT_CODE,
    failedRunId: EXPECTED_RUN_ID,
    externalProcessAttemptCount: 1,
    successfulArmCount: 0,
    remainingProcessAttemptBudget: 19,
    retryAuthorized: true,
    retryProcessStarted: false,
    completedArmCount: 0,
    remainingArmCount: 10,
    aggregateIntegrityPassed: false,
    attemptEvidenceSealedBeforeAbort: true,
    postAbortEvidenceSealed: true,
    externalRerunPerformed: false,
  });
  writeJson(join(resultsRoot, "verdict.json"), verdict);
  const runnerExceptionHash = canonicalSha256(exception);
  writeJson(join(resultsRoot, "run-index.json"), {
    schemaVersion: "R6-T13-run-index-v1",
    decisionKey: "R6-RECOVERY",
    decisionAttempt: 4,
    supersedesAttempt: "R6-T10",
    publishedCommit: PUBLISHED_COMMIT,
    preregistrationHash: verified.preregistrationHash,
    instrumentationHash: verified.plan.instrumentationHash,
    authorizationHash: authorizationEvidence.authorizationHash,
    dataScopeHash: verified.plan.dataScopeHash,
    failureContractHash: verified.plan.failureContractHash,
    failureCandidateHash: verified.plan.failureCandidateHash,
    terminationPolicyHash: verified.plan.terminationPolicyHash,
    outerEnvironmentHash: verified.plan.outerEnvironmentHash,
    batchStopped: true,
    successfulArmCount: 0,
    processAttemptCount: 1,
    runIds,
    threadIds,
    runnerExceptionHash,
    postAbortSealerHash: sha256(readRegular(SCRIPT_PATH)),
    verdictHash: canonicalSha256(verdict),
  });
  writeManifest(outputRoot, "RESULTS.sha256");
  if (verifyR6T12Preregistration(preregRoot).preregistrationHash
      !== verified.preregistrationHash
    || !verifyR5EvidenceManifest(runRoot)) {
    throw new Error("R6_T13_ABORT_INPUT_CHANGED");
  }
  return Object.freeze({
    ok: true,
    verdict: verdict.verdict,
    failureCode: ABORT_CODE,
    batchStopped: true,
    successfulArmCount: 0,
    processAttemptCount: 1,
    retryProcessStarted: false,
    remainingProcessAttemptBudget: 19,
    resultRoot: outputRoot,
    evidenceSealed: true,
  });
}

export function verifyR6T13AbortManifest(root) {
  const outputRoot = requireDirectory(root, "R6_T13_ABORT_RESULT_INVALID");
  const manifest = readRegular(join(outputRoot, "RESULTS.sha256"))
    .toString("utf8").trim().split("\n").filter(Boolean);
  const actualFiles = collectFiles(outputRoot)
    .filter(({ relativePath }) => relativePath !== "RESULTS.sha256")
    .map(({ relativePath }) => relativePath);
  if (manifest.length !== actualFiles.length) return false;
  return manifest.every((line, index) => {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/u.exec(line);
    return match !== null
      && match[2] === actualFiles[index]
      && sha256(readRegular(join(outputRoot, match[2]))) === match[1];
  });
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R6_T13_ABORT_SYMLINK");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(root, absolutePath).replaceAll("\\", "/"),
        });
      } else throw new Error("R6_T13_ABORT_UNSAFE_NODE");
    }
  };
  visit(root);
  return files;
}

function writeManifest(root, name) {
  const lines = collectFiles(root)
    .filter(({ relativePath }) => relativePath !== name)
    .map(({ absolutePath, relativePath }) => (
      `${sha256(readFileSync(absolutePath))}  ${relativePath}`
    ));
  writeText(join(root, name), `${lines.join("\n")}\n`);
}

function requireExactChild(path, parent, code) {
  const expectedParent = requireDirectory(parent, code);
  const output = requireDirectory(path, code);
  if (dirname(output) !== expectedParent) throw new Error(code);
  return output;
}

function requireDirectory(path, code) {
  const output = resolve(path);
  if (!existsSync(output)
    || !lstatSync(output).isDirectory()
    || lstatSync(output).isSymbolicLink()
    || realpathSync(output) !== output) throw new Error(code);
  return output;
}

function readRegular(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) {
    throw new Error("R6_T13_ABORT_FILE_INVALID");
  }
  return readFileSync(path);
}

function readJson(path) {
  return JSON.parse(readRegular(path).toString("utf8"));
}

function readJsonl(path) {
  return readRegular(path).toString("utf8").split(/\r?\n/u)
    .filter(Boolean).map((line) => JSON.parse(line));
}

function writeJson(path, value) {
  writeText(path, `${canonicalJson(value)}\n`);
}

function writeText(path, value) {
  writeFileSync(path, value, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 6 || process.argv[2] !== "seal") {
    throw new Error(
      "USAGE: node scripts/pilot/r6-t13-abort-sealer.mjs seal "
      + "<preregistration-root> <result-root> <authorization-json>",
    );
  }
  const result = sealR6T13AbortedBatch({
    preregistrationRoot: process.argv[3],
    resultRoot: process.argv[4],
    authorizationPath: process.argv[5],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
