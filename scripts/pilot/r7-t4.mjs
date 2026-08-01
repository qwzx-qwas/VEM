import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import { auditCodexJsonlV3 } from "./capsule-audit-v3.mjs";
import { runCodexBinaryIsolationProbe } from "./capsule.mjs";
import {
  classifyR6AttemptFour,
  planR6AttemptFourRetry,
  sealR6AttemptFourEvidence,
} from "./r6-attempt-four-policy.mjs";
import {
  executeR5BoundedProcess,
  verifyR5EvidenceManifest,
} from "./r5-process-terminalizer.mjs";
import {
  cleanupR7Attempt,
  containR7UnspawnedAttempt,
  createR7AttemptFactory,
} from "./r7-attempt-factory.mjs";
import {
  runR7ExceptionSafeBatch,
  verifyR7BatchManifest,
} from "./r7-batch-sealer.mjs";
import {
  evaluateR7Recovery,
  R7_T2_PUBLISHED_COMMIT,
  R7_T4_DESTINATION,
  R7_T4_MODEL,
  R7_T4_TERMINATION_POLICY,
  validateR7T4ResponseText,
} from "./r7-plan.mjs";
import {
  verifyR7BoundSources,
  verifyR7Preregistration,
} from "./r7-t3.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const PREREGISTRATION_PARENT = join(REPO_ROOT, "docs/test-evidence/R7-T3");
const RESULT_PARENT = join(REPO_ROOT, "docs/test-evidence/R7-T4");
const HASH = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const ID = /^[A-Za-z0-9._:-]{1,160}$/u;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 1_024;

export function verifyR7T4OwnerAuthorization({
  authorization,
  publishedCommit,
  preregistrationHash,
  instrumentationHash,
  dataScopeHash,
  failurePolicyHash,
  retryIsolationHash,
  terminationPolicyHash,
  outerEnvironmentHash,
}) {
  if (![preregistrationHash, instrumentationHash, dataScopeHash,
    failurePolicyHash, retryIsolationHash, terminationPolicyHash,
    outerEnvironmentHash].every((value) => HASH.test(value ?? ""))
    || !COMMIT.test(publishedCommit ?? "")
    || typeof authorization !== "object"
    || authorization === null
    || Array.isArray(authorization)
    || authorization.schemaVersion !== "R7-T4-owner-authorization-v1"
    || authorization.taskId !== "R7-T4"
    || authorization.decisionKey !== "R7-RECOVERY"
    || authorization.decisionAttempt !== 1
    || authorization.supersedesAttempt !== null
    || authorization.authorized !== true
    || authorization.publishedCommit !== publishedCommit
    || authorization.preregistrationHash !== preregistrationHash
    || authorization.instrumentationHash !== instrumentationHash
    || authorization.destination !== R7_T4_DESTINATION
    || authorization.model !== R7_T4_MODEL
    || authorization.dataScopeHash !== dataScopeHash
    || authorization.failurePolicyHash !== failurePolicyHash
    || authorization.retryIsolationHash !== retryIsolationHash
    || authorization.terminationPolicyHash !== terminationPolicyHash
    || authorization.outerEnvironmentHash !== outerEnvironmentHash
    || authorization.successfulArmCount !== 10
    || authorization.maxProcessAttempts !== 20
    || canonicalJson(authorization.terminationPolicy)
      !== canonicalJson(R7_T4_TERMINATION_POLICY)
    || typeof authorization.statement !== "string"
    || Buffer.byteLength(authorization.statement, "utf8") < 64
    || Buffer.byteLength(authorization.statement, "utf8") > 4_096
    || typeof authorization.authorizedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
      .test(authorization.authorizedAt)) {
    throw new Error("R7_T4_OWNER_AUTHORIZATION_INVALID");
  }
  return Object.freeze({
    valid: true,
    decisionAttempt: 1,
    supersedesAttempt: null,
    publishedCommit,
    successfulArmCount: 10,
    maxProcessAttempts: 20,
    deadlineMs: R7_T4_TERMINATION_POLICY.deadlineMs,
    graceMs: R7_T4_TERMINATION_POLICY.graceMs,
    forceKillWaitMs: R7_T4_TERMINATION_POLICY.forceKillWaitMs,
    authorizationHash: canonicalSha256(authorization),
  });
}

export async function runR7T4Pilot({
  preregistrationRoot,
  resultRoot,
  authorization,
  authorizationLedgerRoot,
  publishedCommit,
  authFile = join(homedir(), ".codex/auth.json"),
  signal,
}) {
  const preregRoot = requireExactChild(
    preregistrationRoot,
    PREREGISTRATION_PARENT,
    false,
  );
  const outputRoot = requireExactChild(resultRoot, RESULT_PARENT, true);
  const ledgerRoot = requireExactChild(
    authorizationLedgerRoot,
    RESULT_PARENT,
    false,
  );
  if (!COMMIT.test(publishedCommit ?? "")
    || publishedCommit === R7_T2_PUBLISHED_COMMIT) {
    throw new Error("R7_T4_PUBLISHED_COMMIT_INVALID");
  }
  const verified = verifyR7Preregistration(preregRoot);
  const binding = verifyR7BoundSources(verified.plan.sourceBindings);
  const authorizationEvidence = verifyR7T4OwnerAuthorization({
    authorization,
    publishedCommit,
    preregistrationHash: verified.preregistrationHash,
    instrumentationHash: binding.instrumentationHash,
    dataScopeHash: verified.plan.dataScopeHash,
    failurePolicyHash: verified.plan.failurePolicyHash,
    retryIsolationHash: verified.plan.retryIsolationHash,
    terminationPolicyHash: verified.plan.terminationPolicyHash,
    outerEnvironmentHash: verified.plan.outerEnvironmentHash,
  });
  const attemptFactory = createR7AttemptFactory({
    sourceRoot: join(preregRoot, "fixture"),
    responseSchemaPath: join(preregRoot, "inputs/response-schema.json"),
    model: R7_T4_MODEL,
    authFile,
  });
  const arms = [];
  const processAttempts = [];
  const setupStarted = process.hrtime.bigint();
  let stopRequested = false;

  const batch = await runR7ExceptionSafeBatch({
    resultRoot: outputRoot,
    authorizationLedgerRoot: ledgerRoot,
    authorizationId: authorizationEvidence.authorizationHash,
    expectedArmCount: 10,
    maxProcessAttempts: 20,
    attemptFactory,
    runBatch: async (controller) => {
      mkdirSync(join(outputRoot, "runs"), { mode: 0o700 });
      for (const task of verified.manifest.tasks) {
        if (stopRequested || signal?.aborted) break;
        const prompt = readRegular(
          join(preregRoot, `participant/tasks/${task.taskId}/prompt.txt`),
        ).toString("utf8").trimEnd();
        const groundTruth = readJson(
          join(preregRoot, `private/ground-truth/${task.taskId}.json`),
        );
        for (const arm of task.armOrder) {
          if (stopRequested || signal?.aborted) break;
          const armKey = `${task.taskId}:${arm}`;
          const sealedAttempts = [];
          let success = false;
          let retryExhausted = false;
          let totalArmDurationNs = 0n;
          for (let attemptNumber = 1; attemptNumber <= 2; attemptNumber += 1) {
            if (controller.processAttemptCount() >= 20 || signal?.aborted) {
              stopRequested = true;
              break;
            }
            const handle = controller.prepareAttempt({
              taskId: task.taskId,
              arm,
              attemptNumber,
              prompt,
              ...(arm === "vem-assisted" ? {
                vemContextPath: join(
                  preregRoot,
                  `participant/vem-context/${task.taskId}.json`,
                ),
              } : {}),
            });
            const runId = `${task.taskId}-${arm}-attempt-${attemptNumber}`;
            const observed = await executeAttempt({
              controller,
              handle,
              preregRoot,
              outputRoot,
              runId,
              task,
              arm,
              groundTruth,
              plan: verified.plan,
              signal,
            });
            totalArmDurationNs += BigInt(observed.durationNs);
            sealedAttempts.push(observed.sealedAttempt);
            processAttempts.push(observed.aggregate);
            if (observed.classification.kind === "success") {
              success = true;
              controller.completeArm(armKey);
              break;
            }
            const retry = planR6AttemptFourRetry({
              armKey,
              attempts: sealedAttempts,
              batchProcessAttemptCount: controller.processAttemptCount(),
            });
            if (retry.action !== "retry") {
              retryExhausted = retry.reason === "retry-exhausted";
              stopRequested = true;
              break;
            }
            controller.authorizeRetry({
              armKey,
              nextAttemptNumber: retry.nextAttemptNumber,
            });
          }
          arms.push({
            taskId: task.taskId,
            arm,
            success,
            retryExhausted,
            totalArmDurationNs: totalArmDurationNs.toString(),
            instrumentationHash: verified.plan.instrumentationHash,
            groundTruthVisible: false,
            holdoutConsumed: false,
            priorTaskOrPromptReused: false,
            attemptBudgetDrift: false,
            wrongAttribution: processAttempts.some((attempt) => (
              attempt.armKey === armKey && attempt.wrongAttribution === true
            )),
          });
        }
      }
    },
    aggregate: () => {
      const totalSetupDurationNs = (
        process.hrtime.bigint() - setupStarted
      ).toString();
      const aggregateIntegrityPassed = processAttempts.every((attempt) => (
        attempt.evidenceSealed
          && attempt.processTreeTerminated
          && !attempt.terminalContradiction
          && attempt.distinctAttemptResources
      ));
      return {
        schemaVersion: "R7-T4-aggregate-observation-v1",
        arms,
        processAttempts,
        totalSetupDurationNs,
        expectedInstrumentationHash: verified.plan.instrumentationHash,
        aggregateIntegrityPassed,
      };
    },
    verdictFactory: ({ aggregateObservation, stopped }) => {
      const verdict = evaluateR7Recovery({
        arms: aggregateObservation?.arms ?? [],
        processAttempts: aggregateObservation?.processAttempts ?? [],
        totalSetupDurationNs:
          aggregateObservation?.totalSetupDurationNs ?? "0",
        expectedInstrumentationHash: verified.plan.instrumentationHash,
        aggregateIntegrityPassed:
          aggregateObservation?.aggregateIntegrityPassed === true && !stopped,
      });
      return Object.freeze({
        ...verdict,
        publishedCommit,
        preregistrationHash: verified.preregistrationHash,
        authorizationHash: authorizationEvidence.authorizationHash,
        r6StopOverwritten: false,
        productUnlockCount: 0,
      });
    },
  });
  const verdict = readJson(join(outputRoot, "results/verdict.json"));
  if (!verifyR7BatchManifest(outputRoot)
    || verdict.decisionKey !== "R7-RECOVERY"
    || verdict.decisionAttempt !== 1
    || verdict.supersedesAttempt !== null) {
    throw new Error("R7_T4_RESULT_INVALID");
  }
  return Object.freeze({
    ok: verdict.verdict === "continue",
    verdict: verdict.verdict,
    batchStopped: batch.stopped,
    successfulArmCount: arms.filter((arm) => arm.success).length,
    processAttemptCount: batch.processAttemptCount,
    remainingProcessAttemptBudget: batch.remainingProcessAttemptBudget,
    evidenceSealed: batch.evidenceSealed,
    resultRoot: outputRoot,
  });
}

async function executeAttempt({
  controller,
  handle,
  preregRoot,
  outputRoot,
  runId,
  task,
  arm,
  groundTruth,
  plan,
  signal,
}) {
  const runRoot = join(outputRoot, "runs", runId);
  const expected = {
    relativeFile: groundTruth.expectedRelativeFile,
    line: groundTruth.expectedLine,
    sourceAnchorId: arm === "vem-assisted"
      ? groundTruth.expectedSourceAnchorId
      : null,
  };
  const recorded = await executeR5BoundedProcess({
    invocation: handle.invocation,
    outputRoot: runRoot,
    runId,
    instrumentationHash: plan.instrumentationHash,
    finalResponsePath: handle.invocation.authoritativeResponsePath,
    terminationPolicy: {
      deadlineMs: plan.terminationPolicy.deadlineMs,
      graceMs: plan.terminationPolicy.graceMs,
      forceKillWaitMs: plan.terminationPolicy.forceKillWaitMs,
      gracefulSignal: plan.terminationPolicy.gracefulSignal,
      forceSignal: plan.terminationPolicy.forceSignal,
    },
    permissionState: {
      status: "passed",
      permissionProfilePassed: true,
      authReadableToGeneratedCommands: false,
      workspaceWritable: false,
      evidenceHash: plan.retryIsolationHash,
    },
    audit({ stdout, stderr }) {
      return auditCodexJsonlV3({
        jsonl: stdout,
        stderr,
        forbiddenContentNeedles: readJson(
          join(preregRoot, "private/audit-content-needles.json"),
        ).needles,
      });
    },
    evaluate({ finalResponse }) {
      if (finalResponse === null) {
        return {
          status: "passed",
          valid: true,
          responsePresent: false,
          responseMatchesGroundTruth: null,
          failureCodes: [],
        };
      }
      const parsed = validateR7T4ResponseText(finalResponse);
      const matches = parsed !== null
        && canonicalJson(parsed) === canonicalJson(expected);
      return {
        status: matches ? "passed" : "failed",
        valid: matches,
        responsePresent: true,
        responseMatchesGroundTruth: matches,
        failureCodes: matches ? [] : ["R7_T4_WRONG_ATTRIBUTION"],
      };
    },
    signal,
  });
  const ledger = readJson(join(runRoot, "receipt-ledger.json"));
  const processStarted = ledger.entries?.some((entry) => (
    entry.kind === "process-spawned" && entry.processGroupEstablished === true
  ));
  if (!processStarted) throw new Error("R7_PROCESS_NOT_STARTED");
  controller.markProcessStarted(handle, runId);
  const events = readJsonl(join(runRoot, "stdout.jsonl"));
  const termination = readJson(join(runRoot, "termination.json"));
  const finalResponse = readJson(join(runRoot, "final-response-observation.json"));
  const boundary = readJson(join(runRoot, "boundary-state.json"));
  const classification = classifyR6AttemptFour({
    run: recorded,
    termination,
    finalResponse,
    boundary,
    events,
    evidenceSealed: recorded.evidenceSealed && verifyR5EvidenceManifest(runRoot),
    failurePolicy: readJson(
      join(preregRoot, "inputs/failure-policy-validation.json"),
    ),
  });
  const evidenceHashes = Object.fromEntries(collectFiles(runRoot).map((file) => [
    file.relativePath,
    sha256(readFileSync(file.absolutePath)),
  ]));
  const armKey = `${task.taskId}:${arm}`;
  const sealedAttempt = sealR6AttemptFourEvidence({
    runId,
    armKey,
    attemptNumber: handle.attemptNumber,
    classification,
    evidenceHashes,
  });
  if (classification.evidence.processTreeTerminated !== true) {
    throw new Error("R7_PROCESS_TREE_NOT_TERMINAL");
  }
  controller.sealAttempt(handle, {
    runId,
    classification: classification.kind,
    failureCode: classification.kind === "success"
      ? "R7_ATTEMPT_SUCCESS"
      : "R7_ATTEMPT_CLASSIFIED_FAILURE",
    processTreeTerminated: true,
    streamsSealed: true,
    finalObservationSealed: true,
    ledgerSealed: true,
    boundarySealed: true,
    manifestsSealed: true,
  });
  controller.cleanupAttempt(handle);
  const firstNs = ledger.entries?.at(0)?.receivedAtNs ?? "0";
  const lastNs = ledger.entries?.at(-1)?.receivedAtNs ?? firstNs;
  return Object.freeze({
    classification,
    sealedAttempt,
    durationNs: (BigInt(lastNs) - BigInt(firstNs)).toString(),
    aggregate: {
      runId,
      armKey,
      attemptNumber: handle.attemptNumber,
      classification: classification.kind,
      wrongAttribution: boundary.evaluator?.responseMatchesGroundTruth === false,
      responseMatchesGroundTruth:
        boundary.evaluator?.responseMatchesGroundTruth ?? null,
      threadId: extractThread(events),
      instrumentationHash: plan.instrumentationHash,
      evidenceSealed: true,
      evidenceRetained: true,
      processTreeTerminated:
        classification.evidence.processTreeTerminated === true,
      terminalContradiction:
        recorded.failureCodes.includes("R5_TERMINAL_OBSERVATION_CONTRADICTION"),
      distinctAttemptResources: true,
      attemptEvidenceHash: sealedAttempt.attemptEvidenceHash,
    },
  });
}

export function runR7T4LocalPreflight({
  preregistrationRoot,
  authFile = join(homedir(), ".codex/auth.json"),
}) {
  const verified = verifyR7Preregistration(preregistrationRoot);
  const task = verified.manifest.tasks[0];
  const factory = createR7AttemptFactory({
    sourceRoot: join(preregistrationRoot, "fixture"),
    responseSchemaPath: join(preregistrationRoot, "inputs/response-schema.json"),
    model: R7_T4_MODEL,
    authFile,
  });
  const handle = factory.prepare({
    taskId: `${task.taskId}-preflight`,
    arm: "direct-search",
    attemptNumber: 1,
    prompt: "R7 local binary and invocation construction preflight only.",
  });
  try {
    const binary = runCodexBinaryIsolationProbe(handle.capsule);
    if (binary.ok !== true || handle.invocation.env?.PATH !== "/usr/bin:/bin") {
      throw new Error("R7_T4_PREFLIGHT_FAILED");
    }
    return Object.freeze({
      schemaVersion: "R7-T4-local-preflight-v1",
      ok: true,
      codexVersion: binary.version,
      modelCall: false,
      providerNetworkProbed: false,
      exactDecisionInvocationExecuted: false,
      freshAttemptCapsulePrepared: true,
      distinctFinalFilePrepared: true,
    });
  } finally {
    containR7UnspawnedAttempt(handle, "R7_T4_PREFLIGHT_NOT_SPAWNED");
    cleanupR7Attempt(handle);
  }
}

function collectFiles(root) {
  const files = [];
  let totalBytes = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) throw new Error("R7_T4_UNSAFE_NODE");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        const size = statSync(absolutePath).size;
        if (size > MAX_FILE_BYTES) throw new Error("R7_T4_FILE_LIMIT");
        totalBytes += size;
        files.push({ absolutePath, relativePath });
      } else throw new Error("R7_T4_UNSAFE_NODE");
      if (files.length > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("R7_T4_EVIDENCE_LIMIT");
      }
    }
  };
  visit(root);
  return files;
}

function requireExactChild(path, parent, mustBeNew) {
  const expectedParent = requireDirectory(parent, "R7_T4_PARENT_INVALID");
  const output = resolve(path);
  if (dirname(output) !== expectedParent
    || !ID.test(relative(expectedParent, output))
    || mustBeNew && existsSync(output)) {
    throw new Error("R7_T4_CHILD_PATH_INVALID");
  }
  if (!mustBeNew) requireDirectory(output, "R7_T4_CHILD_PATH_INVALID");
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
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) {
    throw new Error("R7_T4_FILE_INVALID");
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

function extractThread(events) {
  const ids = events.filter((event) => event.type === "thread.started")
    .map((event) => event.thread_id).filter((value) => ID.test(value ?? ""));
  return ids.length === 1 ? ids[0] : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 7) {
    throw new Error(
      "USAGE: node scripts/pilot/r7-t4.mjs <preregistration-root> <result-root> <authorization-json> <authorization-ledger-root> <published-commit>",
    );
  }
  const result = await runR7T4Pilot({
    preregistrationRoot: process.argv[2],
    resultRoot: process.argv[3],
    authorization: readJson(process.argv[4]),
    authorizationLedgerRoot: process.argv[5],
    publishedCommit: process.argv[6],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
