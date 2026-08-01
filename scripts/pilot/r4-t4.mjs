import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import { auditCodexJsonlV3 } from "./capsule-audit-v3.mjs";
import {
  assertIntendedCapsuleDifference,
  cleanupParticipantCapsule,
  createParticipantCapsule,
  runCodexBinaryIsolationProbe,
} from "./capsule.mjs";
import { buildR3CodexCapsuleInvocation } from "./r3-capsule.mjs";
import { executeR2RecordedProcess } from "./r2-run-recorder.mjs";
import {
  finalizeR3RecordedRun,
  verifyOuterManifest,
  verifyRecorderHashManifest,
} from "./r3-run-finalizer.mjs";
import {
  evaluateR4Recovery,
  R4_MODEL,
  R4_RETRY_POLICY,
  R4_VERDICT_RULE,
  validateR4ResponseText,
} from "./r4-recovery-plan.mjs";
import {
  buildR4LocalTransportPreflight,
  classifyR4Attempt,
  planR4Retry,
  R4_DESTINATION,
  sealR4AttemptEvidence,
} from "./r4-transport.mjs";
import {
  buildR3PermissionProfileProbeInvocation,
  runR3PermissionProfileProbe,
} from "./r3-capsule.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const PREREGISTRATION_PARENT = join(REPO_ROOT, "docs/test-evidence/R4-T3");
const RESULT_PARENT = join(REPO_ROOT, "docs/test-evidence/R4-T4");
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,160}$/u;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 512;

export const R4_RUNTIME_SOURCE_PATHS = Object.freeze([
  "scripts/pilot/r4-t4.mjs",
  "scripts/pilot/r4-transport.mjs",
  "scripts/pilot/r4-recovery-plan.mjs",
  "scripts/pilot/r2-run-recorder.mjs",
  "scripts/pilot/r3-capsule.mjs",
  "scripts/pilot/r3-run-finalizer.mjs",
  "scripts/pilot/capsule.mjs",
  "scripts/pilot/capsule-audit-v3.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);

export function verifyR4OwnerAuthorization({
  authorization,
  preregistrationHash,
  dataScopeHash,
}) {
  if (!HASH.test(preregistrationHash)
    || !HASH.test(dataScopeHash)
    || !isRecord(authorization)
    || authorization.schemaVersion !== "R4-T4-owner-authorization-v1"
    || authorization.taskId !== "R4-T4"
    || authorization.decisionKey !== "R4-RECOVERY"
    || authorization.authorized !== true
    || authorization.preregistrationHash !== preregistrationHash
    || authorization.destination !== R4_DESTINATION
    || authorization.model !== R4_MODEL
    || authorization.dataScopeHash !== dataScopeHash
    || authorization.successfulArmCount !== 10
    || authorization.maxProcessAttempts
      !== R4_RETRY_POLICY.maxProcessAttempts
    || typeof authorization.statement !== "string"
    || Buffer.byteLength(authorization.statement, "utf8") < 32
    || Buffer.byteLength(authorization.statement, "utf8") > 2_048
    || typeof authorization.authorizedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
      .test(authorization.authorizedAt)) {
    throw new Error("R4_T4_OWNER_AUTHORIZATION_INVALID");
  }
  return Object.freeze({
    valid: true,
    maxProcessAttempts: R4_RETRY_POLICY.maxProcessAttempts,
    authorizationHash: canonicalSha256(authorization),
  });
}

export function verifyR4BoundSources(
  sourceBindings,
  { repoRoot = REPO_ROOT } = {},
) {
  const paths = Object.keys(sourceBindings ?? {}).sort();
  const expected = [...R4_RUNTIME_SOURCE_PATHS].sort();
  if (canonicalJson(paths) !== canonicalJson(expected)) {
    throw new Error("R4_T4_SOURCE_BINDINGS_INVALID");
  }
  for (const path of expected) {
    const hash = sourceBindings[path];
    if (!HASH.test(hash)
      || sha256(readRegular(resolve(repoRoot, path))) !== hash) {
      throw new Error("R4_T4_BOUND_SOURCE_CHANGED");
    }
  }
  return Object.freeze({
    valid: true,
    sourceCount: expected.length,
    instrumentationHash: canonicalSha256(sourceBindings),
  });
}

export function verifyR4Preregistration(
  rootPath,
  { repoRoot = REPO_ROOT, requireProbes = true } = {},
) {
  const root = requireDirectory(rootPath, "R4_T4_PREREGISTRATION_INVALID");
  const expected = readRegular(join(root, "PREREGISTRATION.sha256"))
    .toString("utf8").trim();
  const files = collectFiles(root);
  const actual = sha256(canonicalJson(files
    .filter((file) => file.relativePath !== "PREREGISTRATION.sha256")
    .map((file) => ({
      path: file.relativePath,
      sha256: sha256(readFileSync(file.absolutePath)),
    }))));
  if (!HASH.test(expected) || actual !== expected) {
    throw new Error("R4_T4_PREREGISTRATION_CHANGED");
  }
  const plan = readJson(join(root, "PREREGISTRATION.json"));
  const manifest = readJson(join(root, "inputs/task-manifest.json"));
  const retryPolicy = readJson(join(root, "inputs/retry-policy.json"));
  const bindings = verifyR4BoundSources(plan.sourceBindings, { repoRoot });
  if (plan.schemaVersion !== "R4-T3-preregistered-recovery-plan-v1"
    || plan.decisionKey !== "R4-RECOVERY"
    || plan.decisionAttempt !== 1
    || plan.taskCount !== 5
    || plan.successfulArmCount !== 10
    || plan.maxProcessAttempts !== 20
    || plan.maxRetriesPerArm !== 1
    || plan.model !== R4_MODEL
    || plan.destination !== R4_DESTINATION
    || plan.instrumentationHash !== bindings.instrumentationHash
    || plan.externalExecutionAuthorized !== false
    || plan.productUnlockCount !== 0
    || plan.groundTruthParticipantVisible !== false
    || plan.productHoldoutConsumed !== false
    || canonicalJson(retryPolicy) !== canonicalJson(R4_RETRY_POLICY)
    || canonicalSha256(retryPolicy) !== plan.retryPolicyHash
    || canonicalSha256(R4_VERDICT_RULE) !== plan.verdictRuleHash
    || manifest.schemaVersion !== "R4-T3-task-manifest-v1"
    || manifest.tasks?.length !== 5
    || canonicalSha256(manifest) !== plan.taskManifestHash
    || canonicalSha256({
      destination: plan.destination,
      model: plan.model,
      participantFiles: plan.participantDataPaths,
    }) !== plan.dataScopeHash) {
    throw new Error("R4_T4_PREREGISTRATION_INVALID");
  }
  verifyManifestInputs(root, manifest, requireProbes);
  return Object.freeze({
    preregistrationHash: actual,
    plan,
    manifest,
  });
}

export async function runR4RecoveryPilot({
  preregistrationRoot,
  resultRoot,
  authorizationPath,
  executeAttempt = executeDefaultAttempt,
}) {
  const preregRoot = requireExactChild(
    preregistrationRoot,
    PREREGISTRATION_PARENT,
    false,
  );
  const outputRoot = requireExactChild(resultRoot, RESULT_PARENT, true);
  const verified = verifyR4Preregistration(preregRoot);
  const authorization = readJson(resolve(authorizationPath));
  const authorizationEvidence = verifyR4OwnerAuthorization({
    authorization,
    preregistrationHash: verified.preregistrationHash,
    dataScopeHash: verified.plan.dataScopeHash,
  });
  if (typeof executeAttempt !== "function") {
    throw new Error("R4_T4_EXECUTOR_INVALID");
  }
  mkdirPrivate(outputRoot);
  const runsRoot = join(outputRoot, "runs");
  mkdirPrivate(runsRoot);
  const preflight = runCurrentPreflight(preregRoot, verified.manifest);
  writeJson(join(outputRoot, "results/local-preflight.json"), preflight);

  const arms = [];
  const processAttempts = [];
  let batchStopped = false;
  const setupStarted = process.hrtime.bigint();
  for (const task of verified.manifest.tasks) {
    if (batchStopped) break;
    const prompt = readRegular(
      join(preregRoot, `participant/tasks/${task.taskId}/prompt.txt`),
    ).toString("utf8").trimEnd();
    const groundTruth = readJson(
      join(preregRoot, `private/ground-truth/${task.taskId}.json`),
    );
    const direct = createParticipantCapsule({
      sourceRoot: join(preregRoot, "fixture"),
      taskId: task.taskId,
      arm: "direct-search",
      responseSchemaPath: join(preregRoot, "inputs/response-schema.json"),
    });
    let vem;
    try {
      vem = createParticipantCapsule({
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
        direct.manifest,
        vem.manifest,
      );
      for (const arm of task.armOrder) {
        const capsule = arm === "direct-search" ? direct : vem;
        const armKey = `${task.taskId}:${arm}`;
        const sealedAttempts = [];
        let armDuration = 0n;
        let success = false;
        let retryExhausted = false;
        for (let attemptNumber = 1; attemptNumber <= 2; attemptNumber += 1) {
          if (processAttempts.length >= 20) {
            batchStopped = true;
            break;
          }
          const runId = `${task.taskId}-${arm}-attempt-${attemptNumber}`;
          const attempt = await executeAttempt({
            preregRoot,
            runsRoot,
            runId,
            task,
            arm,
            capsule,
            prompt,
            groundTruth,
            difference,
            plan: verified.plan,
            preregistrationHash: verified.preregistrationHash,
          });
          armDuration += BigInt(attempt.durationNs);
          const sealed = sealR4AttemptEvidence({
            runId,
            armKey,
            attemptNumber,
            classification: attempt.classification,
            evidenceHashes: attempt.evidenceHashes,
          });
          sealedAttempts.push(sealed);
          const retryPlan = planR4Retry({
            armKey,
            attempts: sealedAttempts,
            batchProcessAttemptCount: processAttempts.length + 1,
          });
          processAttempts.push({
            ...attempt.aggregate,
            runId,
            armKey,
            attemptNumber,
            classification: attempt.classification.kind,
            retried: retryPlan.action === "retry",
            evidenceSealed: true,
            evidenceRetained: true,
            attemptEvidenceHash: sealed.attemptEvidenceHash,
          });
          if (attempt.classification.kind === "success") {
            success = true;
            break;
          }
          if (retryPlan.action !== "retry") {
            retryExhausted = retryPlan.reason === "retry-exhausted";
            batchStopped = true;
            break;
          }
        }
        arms.push({
          taskId: task.taskId,
          arm,
          success,
          retryExhausted,
          totalArmDurationNs: armDuration.toString(),
          instrumentationHash: verified.plan.instrumentationHash,
          groundTruthVisible: false,
          holdoutConsumed: false,
          priorTaskOrPromptReused: false,
          attemptBudgetDrift: false,
          wrongAttribution: processAttempts.some((attempt) => (
            attempt.armKey === armKey && attempt.wrongAttribution === true
          )),
        });
        if (!success) batchStopped = true;
        if (batchStopped) break;
      }
    } finally {
      cleanupParticipantCapsule(direct);
      if (vem !== undefined) cleanupParticipantCapsule(vem);
    }
  }
  const totalSetupDurationNs = (
    process.hrtime.bigint() - setupStarted
  ).toString();
  const verdict = evaluateR4Recovery({
    arms,
    processAttempts,
    totalSetupDurationNs,
    expectedInstrumentationHash: verified.plan.instrumentationHash,
    aggregateIntegrityPassed: true,
  });
  writeJson(join(outputRoot, "results/verdict.json"), verdict);
  writeJson(join(outputRoot, "results/run-index.json"), {
    schemaVersion: "R4-T4-run-index-v1",
    preregistrationHash: verified.preregistrationHash,
    instrumentationHash: verified.plan.instrumentationHash,
    authorizationHash: authorizationEvidence.authorizationHash,
    dataScopeHash: verified.plan.dataScopeHash,
    batchStopped,
    successfulArmCount: arms.filter((arm) => arm.success).length,
    processAttemptCount: processAttempts.length,
    runIds: processAttempts.map((attempt) => attempt.runId),
    verdictHash: canonicalSha256(verdict),
  });
  writeManifest(outputRoot, "RESULTS.sha256");
  return Object.freeze({
    ok: verdict.verdict === "continue",
    verdict: verdict.verdict,
    batchStopped,
    successfulArmCount: arms.filter((arm) => arm.success).length,
    processAttemptCount: processAttempts.length,
    remainingProcessAttemptBudget: 20 - processAttempts.length,
    resultRoot: outputRoot,
    evidenceSealed: true,
  });
}

async function executeDefaultAttempt({
  preregRoot,
  runsRoot,
  runId,
  task,
  arm,
  capsule,
  prompt,
  groundTruth,
  difference,
  plan,
  preregistrationHash,
}) {
  const runRoot = join(runsRoot, runId);
  const invocation = buildR3CodexCapsuleInvocation({
    capsule,
    prompt,
    model: R4_MODEL,
    authFile: join(homedir(), ".codex/auth.json"),
  });
  await executeR2RecordedProcess({
    invocation,
    outputRoot: runRoot,
    runId,
    instrumentationHash: plan.instrumentationHash,
    validateResponse: validateR4ResponseText,
    metadata: {
      taskId: task.taskId,
      arm,
      model: R4_MODEL,
      preregistrationHash,
      baseContextHash: difference.baseContextHash,
      treatmentHash: arm === "vem-assisted" ? difference.vemContextHash : null,
    },
  });
  const final = finalizeR3RecordedRun({
    runRoot,
    groundTruth: {
      relativeFile: groundTruth.expectedRelativeFile,
      line: groundTruth.expectedLine,
      sourceAnchorId: arm === "vem-assisted"
        ? groundTruth.expectedSourceAnchorId
        : null,
    },
    forbiddenContentNeedles: readJson(
      join(preregRoot, "private/audit-content-needles.json"),
    ).needles,
    audit: auditCodexJsonlV3,
  });
  const recorded = readJson(join(runRoot, "run.json"));
  const terminal = readJson(join(runRoot, "r3-terminal/terminal.json"));
  const evaluation = readJson(join(runRoot, "r3-terminal/evaluation.json"));
  const capsuleAudit = readJson(
    join(runRoot, "r3-terminal/capsule-audit.json"),
  );
  const events = readJsonl(join(runRoot, "stdout.jsonl"));
  const finalResponse = readJson(
    join(runRoot, "final-response-observation.json"),
  );
  const classification = final.outcome === "success"
    ? Object.freeze({
        schemaVersion: "R4-T2-transport-classification-v1",
        kind: "success",
        retryable: false,
        evidence: Object.freeze({ successfulResponseComplete: true }),
      })
    : classifyR4Attempt({
        process: recorded.process,
        finalResponse,
        events,
        capsuleAudit,
        permissionBoundaryPassed: true,
        evidenceSealed: terminal.evidenceSealedBeforeReturn === true
          && verifyRecorderHashManifest(runRoot)
          && verifyOuterManifest(runRoot, "R3-SHA256SUMS"),
      });
  const ledger = readJson(join(runRoot, "receipt-ledger.json"));
  const durationNs = (
    BigInt(ledger.lastReceivedAtNs) - BigInt(ledger.firstReceivedAtNs)
  ).toString();
  const evidenceHashes = Object.fromEntries(collectFiles(runRoot).map(
    (file) => [file.relativePath, sha256(readFileSync(file.absolutePath))],
  ));
  return Object.freeze({
    classification,
    durationNs,
    evidenceHashes,
    aggregate: {
      wrongAttribution: evaluation.attribution === "wrong",
      responseMatchesGroundTruth: evaluation.responseMatchesGroundTruth,
      threadId: extractThread(events),
    },
  });
}

function runCurrentPreflight(preregRoot, manifest) {
  const taskId = manifest.tasks[0].taskId;
  const capsule = createParticipantCapsule({
    sourceRoot: join(preregRoot, "fixture"),
    taskId,
    arm: "direct-search",
    responseSchemaPath: join(preregRoot, "inputs/response-schema.json"),
  });
  try {
    const binary = runCodexBinaryIsolationProbe(capsule);
    const permission = runR3PermissionProfileProbe(
      buildR3PermissionProfileProbeInvocation({ capsule }),
    );
    return buildR4LocalTransportPreflight({
      codexVersion: binary.version,
      permissionProbe: permission,
    });
  } finally {
    cleanupParticipantCapsule(capsule);
  }
}

function verifyManifestInputs(root, manifest, requireProbes) {
  let armCount = 0;
  for (const task of manifest.tasks) {
    if (!ID.test(task.taskId)
      || canonicalJson([...task.armOrder].sort())
        !== canonicalJson(["direct-search", "vem-assisted"])) {
      throw new Error("R4_T4_TASK_MANIFEST_INVALID");
    }
    armCount += task.armOrder.length;
    const prompt = readRegular(
      join(root, `participant/tasks/${task.taskId}/prompt.txt`),
    );
    const groundTruth = readJson(
      join(root, `private/ground-truth/${task.taskId}.json`),
    );
    const context = readJson(
      join(root, `participant/vem-context/${task.taskId}.json`),
    );
    const proof = readJson(join(root, `capsules/${task.taskId}.json`));
    if (sha256(prompt) !== task.promptHash
      || canonicalSha256(groundTruth) !== task.groundTruthHash
      || canonicalSha256(context) !== task.vemContextHash
      || proof.onlyDifference !== "vem-context.json"
      || requireProbes && !["direct", "vem"].every((prefix) => (
        proof.probes?.[`${prefix}Filesystem`]?.ok === true
          && proof.probes?.[`${prefix}CodexBinary`]?.ok === true
          && proof.probes?.[`${prefix}PermissionProfile`]?.ok === true
          && proof.probes?.[`${prefix}PermissionProfile`]?.modelCall === false
      ))) {
      throw new Error("R4_T4_TASK_INPUT_INVALID");
    }
  }
  if (armCount !== 10) throw new Error("R4_T4_ARM_COUNT_INVALID");
}

function collectFiles(root) {
  const files = [];
  let bytes = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) throw new Error("R4_T4_UNSAFE_NODE");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        const size = statSync(absolutePath).size;
        if (size > MAX_FILE_BYTES) throw new Error("R4_T4_FILE_LIMIT");
        bytes += size;
        files.push({ absolutePath, relativePath });
      } else throw new Error("R4_T4_UNSAFE_NODE");
      if (files.length > MAX_FILES || bytes > MAX_TOTAL_BYTES) {
        throw new Error("R4_T4_EVIDENCE_LIMIT");
      }
    }
  };
  visit(root);
  return files;
}

function writeManifest(root, name) {
  const files = collectFiles(root).filter((file) => file.relativePath !== name);
  writeText(join(root, name), `${files.map((file) => (
    `${sha256(readFileSync(file.absolutePath))}  ${file.relativePath}`
  )).join("\n")}\n`);
}

function requireExactChild(path, parent, mustBeNew) {
  const expectedParent = requireDirectory(parent, "R4_T4_PARENT_INVALID");
  const output = resolve(path);
  if (dirname(output) !== expectedParent
    || !ID.test(relative(expectedParent, output))
    || mustBeNew && existsSync(output)) {
    throw new Error("R4_T4_CHILD_PATH_INVALID");
  }
  if (!mustBeNew) requireDirectory(output, "R4_T4_CHILD_PATH_INVALID");
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
    throw new Error("R4_T4_FILE_INVALID");
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

function mkdirPrivate(path) {
  mkdirSync(path, { mode: 0o700 });
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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 6 || process.argv[2] !== "run") {
    throw new Error(
      "USAGE: node scripts/pilot/r4-t4.mjs run "
      + "<preregistration-root> <result-root> <authorization-json>",
    );
  }
  const result = await runR4RecoveryPilot({
    preregistrationRoot: process.argv[3],
    resultRoot: process.argv[4],
    authorizationPath: process.argv[5],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
