import { spawn } from "node:child_process";
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
  TrustedReceiptLedger,
} from "../../packages/pilot-harness/dist/index.js";
import { auditCodexJsonlV2 } from "./capsule-audit-v2.mjs";
import {
  assertIntendedCapsuleDifference,
  buildCodexCapsuleInvocation,
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import {
  evaluateR0Recovery,
  R0_MODEL,
} from "./r0-recovery-plan.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const PREREGISTRATION_PARENT = join(REPO_ROOT, "docs/test-evidence/R0-T3");
const RESULT_PARENT = join(REPO_ROOT, "docs/test-evidence/R0-T4");
const MAX_STREAM_BYTES = 16 * 1024 * 1024;

export function verifyR0OwnerAuthorization({
  authorization,
  preregistrationHash,
}) {
  if (typeof authorization !== "object"
    || authorization === null
    || Array.isArray(authorization)
    || authorization.schemaVersion !== "R0-T4-owner-authorization-v1"
    || authorization.taskId !== "R0-T4"
    || authorization.authorized !== true
    || authorization.preregistrationHash !== preregistrationHash
    || typeof authorization.statement !== "string"
    || authorization.statement.length < 8
    || authorization.statement.length > 1_024
    || typeof authorization.authorizedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T/u.test(authorization.authorizedAt)) {
    throw new Error("R0_T4_OWNER_AUTHORIZATION_INVALID");
  }
  return Object.freeze({
    valid: true,
    authorizationHash: canonicalSha256(authorization),
  });
}

export async function runR0RecoveryPilot({
  preregistrationRoot,
  resultRoot,
  authorizationPath,
}) {
  const preregRoot = requireChildDirectory(
    preregistrationRoot,
    PREREGISTRATION_PARENT,
    "R0_T4_PREREGISTRATION_ROOT_INVALID",
  );
  const outputRoot = requireNewChildPath(
    resultRoot,
    RESULT_PARENT,
    "R0_T4_RESULT_ROOT_INVALID",
  );
  const preregistrationHash = verifyPreregistration(preregRoot);
  const plan = readJson(join(preregRoot, "PREREGISTRATION.json"));
  verifyBoundSources(plan.sourceBindings);
  if (plan.preregistrationHashAlgorithm !== "sha256-canonical-file-manifest"
    || plan.decisionKey !== "R0-RECOVERY"
    || plan.decisionAttempt !== 1) {
    throw new Error("R0_T4_PREREGISTRATION_INVALID");
  }
  const authorization = readJson(resolve(authorizationPath));
  const authorizationEvidence = verifyR0OwnerAuthorization({
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
  for (const task of manifest.tasks) {
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
        const runRoot = join(resultsRoot, "runs", runId);
        mkdirSync(runRoot, { recursive: true, mode: 0o700 });
        const run = await executeArm({
          capsule,
          prompt,
          runId,
          task,
          arm,
          runRoot,
          instrumentationHash: plan.instrumentationHash,
          preregistrationHash,
          preregistrationRoot: preregRoot,
          baseContextHash: difference.baseContextHash,
          treatmentHash: arm === "vem-assisted" ? difference.vemContextHash : null,
        });
        runs.push(run);
      }
    } finally {
      cleanupParticipantCapsule(directCapsule);
      if (vemCapsule !== undefined) cleanupParticipantCapsule(vemCapsule);
    }
  }

  const totalSetupDurationNs = (
    BigInt(prepareSetup.totalPrepareSetupDurationNs) + capsuleSetupDurationNs
  ).toString();
  const verdict = evaluateR0Recovery({
    runs,
    totalSetupDurationNs,
    expectedInstrumentationHash: plan.instrumentationHash,
  });
  writeJson(join(resultsRoot, "verdict.json"), verdict);
  writeJson(join(resultsRoot, "run-index.json"), {
    schemaVersion: "R0-T4-run-index-v1",
    decisionKey: "R0-RECOVERY",
    decisionAttempt: 1,
    preregistrationHash,
    instrumentationHash: plan.instrumentationHash,
    authorizationHash: authorizationEvidence.authorizationHash,
    runIds: runs.map((run) => run.runId),
    threadIds: runs.map((run) => run.threadId),
    ledgerContentHashes: runs.map((run) => run.ledgerContentHash),
    verdictHash: sha256(readFileSync(join(resultsRoot, "verdict.json"))),
  });
  writeJson(join(resultsRoot, "setup-cost.json"), {
    schemaVersion: "R0-T4-setup-cost-v1",
    preregistrationPrepareNs: prepareSetup.totalPrepareSetupDurationNs,
    capsuleSetupNs: capsuleSetupDurationNs.toString(),
    totalSetupDurationNs,
    perArmReceiptDurationsExcluded: true,
  });
  const hashes = collectFiles(resultsRoot).map((path) => (
    `${sha256(readFileSync(path))}  ${relative(outputRoot, path).replaceAll("\\", "/")}`
  ));
  writeText(join(outputRoot, "RESULTS.sha256"), `${hashes.join("\n")}\n`);
  if (verifyPreregistration(preregRoot) !== preregistrationHash) {
    throw new Error("R0_T4_PREREGISTRATION_CHANGED");
  }
  return Object.freeze({
    ok: true,
    verdict: verdict.verdict,
    preregistrationHash,
    instrumentationHash: plan.instrumentationHash,
    resultRoot: outputRoot,
  });
}

async function executeArm({
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
    model: R0_MODEL,
    authFile: join(homedir(), ".codex/auth.json"),
  });
  const ledger = new TrustedReceiptLedger({
    runId,
    instrumentationHash,
  });
  const child = spawn(invocation.executable, invocation.args, {
    cwd: invocation.cwd,
    env: { PATH: process.env.PATH ?? "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  ledger.recordProcessSpawned(canonicalSha256({
    executable: invocation.executable,
    args: invocation.args.map((argument) => (
      argument === prompt ? "<preregistered-prompt>" : argument
    )),
    cwd: invocation.cwd,
  }));

  const stdoutChunks = [];
  const stderrChunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutBuffer = "";
  let captureError;
  let finalResponseText;
  let threadId = null;
  const recordLine = (line) => {
    try {
      ledger.recordStdoutEvent(line);
      const event = JSON.parse(line);
      if (event.type === "thread.started" && typeof event.thread_id === "string") {
        threadId = event.thread_id;
      }
      if (event.type === "item.completed"
        && event.item?.type === "agent_message"
        && typeof event.item.text === "string") {
        ledger.recordStructuredResponse(event.item.text);
        finalResponseText = event.item.text;
      }
    } catch (error) {
      captureError ??= error;
      child.kill("SIGTERM");
    }
  };
  child.stdout.on("data", (chunk) => {
    stdoutBytes += chunk.byteLength;
    if (stdoutBytes > MAX_STREAM_BYTES) {
      captureError ??= new Error("R0_T4_STDOUT_LIMIT_EXCEEDED");
      child.kill("SIGTERM");
      return;
    }
    stdoutChunks.push(chunk);
    stdoutBuffer += chunk.toString("utf8");
    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      recordLine(stdoutBuffer.slice(0, newlineIndex));
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  });
  child.stderr.on("data", (chunk) => {
    try {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_STREAM_BYTES) {
        throw new Error("R0_T4_STDERR_LIMIT_EXCEEDED");
      }
      stderrChunks.push(chunk);
      ledger.recordStderrChunk(new Uint8Array(chunk));
    } catch (error) {
      captureError ??= error;
      child.kill("SIGTERM");
    }
  });
  const stdoutClosed = new Promise((resolvePromise) => {
    child.stdout.once("close", () => {
      if (stdoutBuffer.length > 0) recordLine(stdoutBuffer);
      stdoutBuffer = "";
      resolvePromise();
    });
  });
  const stderrClosed = new Promise((resolvePromise) => {
    child.stderr.once("close", resolvePromise);
  });
  const terminalPromise = new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", (exitCode, signal) => resolvePromise({ exitCode, signal }));
  });
  const [terminal] = await Promise.all([
    terminalPromise,
    stdoutClosed,
    stderrClosed,
  ]);
  if (captureError !== undefined) throw captureError;
  ledger.recordProcessExited(terminal);
  const built = ledger.build();
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  const audit = auditCodexJsonlV2({ jsonl: stdout, stderr });
  const response = parseJsonValue(finalResponseText);
  const responseMatchesGroundTruth = response !== null
    && response.relativeFile === task.expectedRelativeFile
    && response.line === task.expectedLine
    && (response.sourceAnchorId === null
      || response.sourceAnchorId === task.expectedSourceAnchorId);
  const vemDirectPrimaryMatch = arm !== "vem-assisted"
    ? null
    : responseMatchesGroundTruth
      && response.sourceAnchorId === task.expectedSourceAnchorId;
  const currentPreregistrationHash = verifyPreregistration(preregistrationRoot);
  const run = {
    schemaVersion: "R0-T4-codex-run-v1",
    runId,
    taskId: task.taskId,
    arm,
    model: R0_MODEL,
    exitCode: terminal.exitCode,
    signal: terminal.signal,
    threadId,
    receiptDurationNs: (
      BigInt(built.ledger.lastReceivedAtNs) - BigInt(built.ledger.firstReceivedAtNs)
    ).toString(),
    responseMatchesGroundTruth,
    vemDirectPrimaryMatch,
    wrongAttribution: response !== null && !responseMatchesGroundTruth,
    capsuleAudit: audit.valid ? "passed" : "failed",
    ledgerComplete: built.ledger.entries.at(-1)?.kind === "process-exited",
    instrumentationHash,
    ledgerContentHash: built.contentHash,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    baseContextHash,
    treatmentHash,
    preregistrationHashChanged: currentPreregistrationHash !== preregistrationHash,
    groundTruthVisible: false,
    holdoutConsumed: false,
    p0TaskOrPromptReused: false,
  };
  writeText(join(runRoot, "stdout.jsonl"), stdout);
  writeText(join(runRoot, "stderr.txt"), stderr);
  writeText(join(runRoot, "receipt-ledger.json"), `${built.canonicalJson}\n`);
  writeJson(join(runRoot, "run.json"), run);
  return Object.freeze(run);
}

function verifyPreregistration(root) {
  const expected = readFileSync(join(root, "PREREGISTRATION.sha256"), "utf8").trim();
  if (!/^[a-f0-9]{64}$/u.test(expected)) {
    throw new Error("R0_T4_PREREGISTRATION_HASH_INVALID");
  }
  const actual = sha256(canonicalJson(collectFiles(root)
    .filter((path) => relative(root, path).replaceAll("\\", "/") !== "PREREGISTRATION.sha256")
    .map((path) => ({
      path: relative(root, path).replaceAll("\\", "/"),
      sha256: sha256(readFileSync(path)),
    }))));
  if (actual !== expected) throw new Error("R0_T4_PREREGISTRATION_CHANGED");
  return actual;
}

function verifyBoundSources(sourceBindings) {
  if (typeof sourceBindings !== "object" || sourceBindings === null) {
    throw new Error("R0_T4_SOURCE_BINDINGS_INVALID");
  }
  for (const [path, expectedHash] of Object.entries(sourceBindings)) {
    if (!/^[A-Za-z0-9._~/-]{1,512}$/u.test(path)
      || !/^[a-f0-9]{64}$/u.test(expectedHash)
      || sha256(readFileSync(join(REPO_ROOT, path))) !== expectedHash) {
      throw new Error("R0_T4_BOUND_SOURCE_CHANGED");
    }
  }
}

function parseJsonValue(value) {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
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
  if (dirname(resolved) !== parent || existsSync(resolved)) throw new Error(code);
  if (!existsSync(parent)
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
      if (entry.isSymbolicLink()) throw new Error("R0_T4_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R0_T4_NON_REGULAR_FILE_REJECTED");
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
      "USAGE: node scripts/pilot/r0-t4.mjs run <preregistration-root> <result-root> <authorization-json>",
    );
  }
  const result = await runR0RecoveryPilot({
    preregistrationRoot: process.argv[3],
    resultRoot: process.argv[4],
    authorizationPath: process.argv[5],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
