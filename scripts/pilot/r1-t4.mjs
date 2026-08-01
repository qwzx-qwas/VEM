import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import { auditCodexJsonlV2 } from "./capsule-audit-v2.mjs";
import {
  assertIntendedCapsuleDifference,
  buildCodexCapsuleInvocation,
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import {
  evaluateR1Recovery,
  R1_MODEL,
  validateR1ResponseText,
} from "./r1-recovery-plan.mjs";
import { executeRecordedProcess } from "./r1-run-recorder.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const PREREGISTRATION_PARENT = join(REPO_ROOT, "docs/test-evidence/R1-T3");
const RESULT_PARENT = join(REPO_ROOT, "docs/test-evidence/R1-T4");

export function verifyR1OwnerAuthorization({
  authorization,
  preregistrationHash,
}) {
  if (typeof authorization !== "object"
    || authorization === null
    || Array.isArray(authorization)
    || authorization.schemaVersion !== "R1-T4-owner-authorization-v1"
    || authorization.taskId !== "R1-T4"
    || authorization.authorized !== true
    || authorization.preregistrationHash !== preregistrationHash
    || typeof authorization.statement !== "string"
    || authorization.statement.length < 8
    || authorization.statement.length > 1_024
    || typeof authorization.authorizedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T/u.test(authorization.authorizedAt)) {
    throw new Error("R1_T4_OWNER_AUTHORIZATION_INVALID");
  }
  return Object.freeze({
    valid: true,
    authorizationHash: canonicalSha256(authorization),
  });
}

export async function runR1RecoveryPilot({
  preregistrationRoot,
  resultRoot,
  authorizationPath,
}) {
  const preregRoot = requireChildDirectory(
    preregistrationRoot,
    PREREGISTRATION_PARENT,
    "R1_T4_PREREGISTRATION_ROOT_INVALID",
  );
  const outputRoot = requireNewChildPath(
    resultRoot,
    RESULT_PARENT,
    "R1_T4_RESULT_ROOT_INVALID",
  );
  const preregistrationHash = verifyR1Preregistration(preregRoot);
  const plan = readJson(join(preregRoot, "PREREGISTRATION.json"));
  verifyBoundSources(plan.sourceBindings);
  if (plan.preregistrationHashAlgorithm !== "sha256-canonical-file-manifest"
    || plan.decisionKey !== "R1-RECOVERY"
    || plan.decisionAttempt !== 1
    || plan.externalExecutionAuthorized !== false) {
    throw new Error("R1_T4_PREREGISTRATION_INVALID");
  }
  const authorization = readJson(resolve(authorizationPath));
  const authorizationEvidence = verifyR1OwnerAuthorization({
    authorization,
    preregistrationHash,
  });
  mkdirSync(outputRoot, { mode: 0o700 });
  const resultsRoot = join(outputRoot, "results");
  mkdirSync(join(resultsRoot, "runs"), { recursive: true, mode: 0o700 });

  const manifest = readJson(join(preregRoot, "inputs/task-manifest.json"));
  const prepareSetup = readJson(join(preregRoot, "inputs/prepare-setup-cost.json"));
  const runs = [];
  let capsuleSetupDurationNs = 0n;
  let batchStopped = false;
  for (const task of manifest.tasks) {
    if (batchStopped) break;
    const prompt = readFileSync(
      join(preregRoot, `participant/tasks/${task.taskId}/prompt.txt`),
      "utf8",
    ).trimEnd();
    const capsuleStartedAt = process.hrtime.bigint();
    const directCapsule = createParticipantCapsule({
      sourceRoot: join(preregRoot, "fixture"),
      taskId: task.taskId,
      arm: "direct-search",
      responseSchemaPath: join(preregRoot, "inputs/response-schema.json"),
    });
    let vemCapsule;
    try {
      vemCapsule = createParticipantCapsule({
        sourceRoot: join(preregRoot, "fixture"),
        taskId: task.taskId,
        arm: "vem-assisted",
        responseSchemaPath: join(preregRoot, "inputs/response-schema.json"),
        vemContextPath: join(
          preregRoot,
          `participant/vem-context/${task.taskId}.json`,
        ),
      });
      const difference = assertIntendedCapsuleDifference(
        directCapsule.manifest,
        vemCapsule.manifest,
      );
      capsuleSetupDurationNs += process.hrtime.bigint() - capsuleStartedAt;
      for (let index = 0; index < task.armOrder.length; index += 1) {
        const arm = task.armOrder[index];
        const capsule = arm === "direct-search" ? directCapsule : vemCapsule;
        const runId = `${task.taskId}-${index + 1}-${arm}`;
        const run = await executeR1Arm({
          capsule,
          prompt,
          runId,
          task,
          arm,
          runRoot: join(resultsRoot, "runs", runId),
          instrumentationHash: plan.instrumentationHash,
          preregistrationHash,
          preregistrationRoot: preregRoot,
          baseContextHash: difference.baseContextHash,
          treatmentHash: arm === "vem-assisted" ? difference.vemContextHash : null,
        });
        runs.push(run);
        if (run.outcome !== "success"
          || run.ledgerComplete !== true
          || run.evidenceHashesValid !== true) {
          batchStopped = true;
          writeJson(join(resultsRoot, "batch-stopped.json"), {
            schemaVersion: "R1-T4-batch-stopped-v1",
            failedRunId: run.runId,
            completedRunCount: runs.length,
            remainingRunCount: manifest.tasks.length * 2 - runs.length,
            outcome: run.outcome,
            failureCodes: run.failureCodes,
            failureEvidenceSealed: run.evidenceHashesValid,
          });
          break;
        }
      }
    } finally {
      cleanupParticipantCapsule(directCapsule);
      if (vemCapsule !== undefined) cleanupParticipantCapsule(vemCapsule);
    }
  }

  const totalSetupDurationNs = (
    BigInt(prepareSetup.totalPrepareSetupDurationNs) + capsuleSetupDurationNs
  ).toString();
  const verdict = evaluateR1Recovery({
    runs,
    totalSetupDurationNs,
    expectedInstrumentationHash: plan.instrumentationHash,
  });
  writeJson(join(resultsRoot, "verdict.json"), verdict);
  writeJson(join(resultsRoot, "run-index.json"), {
    schemaVersion: "R1-T4-run-index-v1",
    decisionKey: "R1-RECOVERY",
    decisionAttempt: 1,
    preregistrationHash,
    instrumentationHash: plan.instrumentationHash,
    authorizationHash: authorizationEvidence.authorizationHash,
    batchStopped,
    runIds: runs.map((run) => run.runId),
    threadIds: runs.map((run) => run.threadId),
    ledgerContentHashes: runs.map((run) => run.ledgerContentHash),
    verdictHash: sha256(readFileSync(join(resultsRoot, "verdict.json"))),
  });
  writeJson(join(resultsRoot, "setup-cost.json"), {
    schemaVersion: "R1-T4-setup-cost-v1",
    preregistrationPrepareNs: prepareSetup.totalPrepareSetupDurationNs,
    capsuleSetupNs: capsuleSetupDurationNs.toString(),
    totalSetupDurationNs,
    perArmReceiptDurationsExcluded: true,
  });
  writeText(join(outputRoot, "RESULTS.sha256"), `${collectFiles(resultsRoot).map((path) => (
    `${sha256(readFileSync(path))}  ${relative(outputRoot, path).replaceAll("\\", "/")}`
  )).join("\n")}\n`);
  if (verifyR1Preregistration(preregRoot) !== preregistrationHash) {
    throw new Error("R1_T4_PREREGISTRATION_CHANGED");
  }
  return Object.freeze({
    ok: true,
    verdict: verdict.verdict,
    preregistrationHash,
    instrumentationHash: plan.instrumentationHash,
    resultRoot: outputRoot,
    batchStopped,
  });
}

async function executeR1Arm({
  capsule,
  prompt,
  runId,
  task,
  arm,
  runRoot,
  instrumentationHash,
  preregistrationHash,
  preregistrationRoot,
  baseContextHash,
  treatmentHash,
}) {
  const invocation = buildCodexCapsuleInvocation({
    capsule,
    prompt,
    model: R1_MODEL,
    authFile: join(homedir(), ".codex/auth.json"),
  });
  const recorded = await executeRecordedProcess({
    invocation,
    outputRoot: runRoot,
    runId,
    instrumentationHash,
    validateResponse: validateR1ResponseText,
    metadata: {
      taskId: task.taskId,
      arm,
      model: R1_MODEL,
      preregistrationHash,
      baseContextHash,
      treatmentHash,
    },
  });
  const stdout = readFileSync(join(runRoot, "stdout.jsonl"), "utf8");
  const stderr = readFileSync(join(runRoot, "stderr.txt"), "utf8");
  const audit = auditCodexJsonlV2({ jsonl: stdout, stderr });
  const ledger = readJson(join(runRoot, "receipt-ledger.json"));
  const response = recorded.selectedResponse;
  const responseMatchesGroundTruth = response !== null
    && response.relativeFile === task.expectedRelativeFile
    && response.line === task.expectedLine
    && (response.sourceAnchorId === null
      || response.sourceAnchorId === task.expectedSourceAnchorId);
  const selectedResponseCount = ledger.entries.filter(
    (entry) => entry.kind === "structured-response-selected",
  ).length;
  const evaluation = {
    schemaVersion: "R1-T4-run-evaluation-v1",
    runId,
    taskId: task.taskId,
    arm,
    model: R1_MODEL,
    outcome: recorded.outcome,
    failureCodes: recorded.failureCodes,
    exitCode: recorded.process.exitCode,
    signal: recorded.process.signal,
    threadId: extractThreadId(stdout),
    receiptDurationNs: (
      BigInt(ledger.lastReceivedAtNs) - BigInt(ledger.firstReceivedAtNs)
    ).toString(),
    responseMatchesGroundTruth,
    vemDirectPrimaryMatch: arm !== "vem-assisted"
      ? null
      : responseMatchesGroundTruth
        && response.sourceAnchorId === task.expectedSourceAnchorId,
    wrongAttribution: response !== null && !responseMatchesGroundTruth,
    capsuleAudit: audit.valid ? "passed" : "failed",
    ledgerComplete: recorded.outcome === "success"
      && ledger.entries.at(-1)?.kind === "run-finalized"
      && selectedResponseCount === 1,
    selectedResponseCount,
    evidenceHashesValid: verifyRunHashes(runRoot),
    instrumentationHash,
    ledgerContentHash: recorded.ledgerContentHash,
    baseContextHash,
    treatmentHash,
    preregistrationHashChanged: (
      verifyR1Preregistration(preregistrationRoot) !== preregistrationHash
    ),
    groundTruthVisible: false,
    holdoutConsumed: false,
    priorTaskOrPromptReused: false,
  };
  writeJson(join(runRoot, "evaluation.json"), evaluation);
  return Object.freeze(evaluation);
}

export function verifyR1Preregistration(root) {
  const expected = readFileSync(join(root, "PREREGISTRATION.sha256"), "utf8").trim();
  if (!/^[a-f0-9]{64}$/u.test(expected)) {
    throw new Error("R1_T4_PREREGISTRATION_HASH_INVALID");
  }
  const actual = sha256(canonicalJson(collectFiles(root)
    .filter((path) => relative(root, path).replaceAll("\\", "/") !== "PREREGISTRATION.sha256")
    .map((path) => ({
      path: relative(root, path).replaceAll("\\", "/"),
      sha256: sha256(readFileSync(path)),
    }))));
  if (actual !== expected) throw new Error("R1_T4_PREREGISTRATION_CHANGED");
  return actual;
}

function verifyBoundSources(sourceBindings) {
  if (typeof sourceBindings !== "object" || sourceBindings === null) {
    throw new Error("R1_T4_SOURCE_BINDINGS_INVALID");
  }
  for (const [path, expectedHash] of Object.entries(sourceBindings)) {
    if (!/^[A-Za-z0-9._~/-]{1,512}$/u.test(path)
      || !/^[a-f0-9]{64}$/u.test(expectedHash)
      || sha256(readFileSync(join(REPO_ROOT, path))) !== expectedHash) {
      throw new Error("R1_T4_BOUND_SOURCE_CHANGED");
    }
  }
}

function verifyRunHashes(runRoot) {
  const lines = readFileSync(join(runRoot, "SHA256SUMS"), "utf8")
    .trim().split("\n").filter(Boolean);
  return lines.length >= 4 && lines.every((line) => {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._-]+)$/u.exec(line);
    return match !== null
      && sha256(readFileSync(join(runRoot, match[2]))) === match[1];
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
    } catch {
      return null;
    }
  }
  return null;
}

function requireChildDirectory(path, parent, code) {
  const resolved = resolve(path);
  if (dirname(resolved) !== parent
    || !existsSync(resolved)
    || !lstatSync(resolved).isDirectory()
    || lstatSync(resolved).isSymbolicLink()) {
    throw new Error(code);
  }
  return resolved;
}

function requireNewChildPath(path, parent, code) {
  const resolved = resolve(path);
  if (dirname(resolved) !== parent || existsSync(resolved)
    || !existsSync(parent)
    || !lstatSync(parent).isDirectory()
    || lstatSync(parent).isSymbolicLink()) {
    throw new Error(code);
  }
  return resolved;
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R1_T4_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R1_T4_NON_REGULAR_FILE_REJECTED");
    }
  };
  visit(root);
  return files.sort();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 6 || process.argv[2] !== "run") {
    throw new Error(
      "USAGE: node scripts/pilot/r1-t4.mjs run <preregistration-root> <result-root> <authorization-json>",
    );
  }
  const result = await runR1RecoveryPilot({
    preregistrationRoot: process.argv[3],
    resultRoot: process.argv[4],
    authorizationPath: process.argv[5],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
