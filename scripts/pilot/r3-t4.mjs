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
} from "./capsule.mjs";
import {
  buildR3CodexCapsuleInvocation,
  buildR3PermissionProfileProbeInvocation,
  R3_PERMISSION_PROFILE_CONTAINER_PATH,
  R3_PERMISSION_PROFILE_NAME,
  runR3PermissionProfileProbe,
} from "./r3-capsule.mjs";
import {
  evaluateR3Recovery,
  R3_MODEL,
  R3_VERDICT_RULE,
  validateR3ResponseText,
} from "./r3-recovery-plan.mjs";
import { executeR2RecordedProcess } from "./r2-run-recorder.mjs";
import {
  finalizeR3RecordedRun,
  sealR3BatchOutcome,
  verifyOuterManifest,
  verifyRecorderHashManifest,
} from "./r3-run-finalizer.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const PREREGISTRATION_PARENT = join(REPO_ROOT, "docs/test-evidence/R3-T3");
const RESULT_PARENT = join(REPO_ROOT, "docs/test-evidence/R3-T4");
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._~/-]{1,512}$/u;
const MAX_CONTROL_BYTES = 1024 * 1024;
const MAX_PREREGISTRATION_FILE_BYTES = 16 * 1024 * 1024;
const MAX_PREREGISTRATION_BYTES = 64 * 1024 * 1024;
const MAX_PREREGISTRATION_FILES = 512;
const EXPECTED_RUN_COUNT = 10;
const R2_INSTRUMENTATION_HASH =
  "09e237ddec722207ee3b2e22c714ca5631700ff7393877a66fdd75d04c46b8a0";
const EXPECTED_TERMINAL_BINDINGS = Object.freeze({
  p0: {
    phase: "P0",
    status: "failed",
    attempt: "P0-T17D",
    verdict: "stop",
    verdictHash:
      "38d1dd20b591baadaed2ba4b2ebd93723706387133e366370e62c7f431ee336a",
  },
  r0: {
    phase: "R0",
    status: "failed",
    attempt: "R0-T4",
    verdict: "stop",
    verdictHash:
      "5815559a6d2b8d9c71246067a4befefe97f375edb476ffd479ee56c07978e38b",
  },
  r1: {
    phase: "R1",
    status: "failed",
    attempt: "R1-T4",
    verdict: "stop",
    verdictHash:
      "a0a9556a63d68fcbe769da96f140e54d1d966421d0c3bad1cbffca1f24ab9baa",
  },
  r2: {
    phase: "R2",
    status: "failed",
    attempt: "R2-T4",
    verdict: "stop",
    verdictHash:
      "ada1fb7e4c4ae202060a5e98e00dafedecfd4862803c61bab1970d7e30d681e1",
  },
});

export const R3_RUNTIME_SOURCE_PATHS = Object.freeze([
  "scripts/pilot/r3-t4.mjs",
  "scripts/pilot/r2-run-recorder.mjs",
  "scripts/pilot/r3-capsule.mjs",
  "scripts/pilot/r2-capsule.mjs",
  "scripts/pilot/r3-run-finalizer.mjs",
  "scripts/pilot/r3-recovery-plan.mjs",
  "scripts/pilot/capsule.mjs",
  "scripts/pilot/capsule-audit-v3.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);

export function verifyR3OwnerAuthorization({
  authorization,
  preregistrationHash,
}) {
  if (!HASH.test(preregistrationHash)
    || !isRecord(authorization)
    || authorization.schemaVersion !== "R3-T4-owner-authorization-v1"
    || authorization.taskId !== "R3-T4"
    || authorization.decisionKey !== "R3-RECOVERY"
    || authorization.authorized !== true
    || authorization.preregistrationHash !== preregistrationHash
    || authorization.runCount !== EXPECTED_RUN_COUNT
    || typeof authorization.statement !== "string"
    || Buffer.byteLength(authorization.statement, "utf8") < 8
    || Buffer.byteLength(authorization.statement, "utf8") > 1_024
    || typeof authorization.authorizedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
      .test(authorization.authorizedAt)) {
    throw new Error("R3_T4_OWNER_AUTHORIZATION_INVALID");
  }
  return Object.freeze({
    valid: true,
    runCount: EXPECTED_RUN_COUNT,
    authorizationHash: canonicalSha256(authorization),
  });
}

export function verifyR3BoundSources(
  sourceBindings,
  { repoRoot = REPO_ROOT } = {},
) {
  if (!isRecord(sourceBindings)) {
    throw new Error("R3_T4_SOURCE_BINDINGS_INVALID");
  }
  const expectedPaths = [...R3_RUNTIME_SOURCE_PATHS].sort();
  const actualPaths = Object.keys(sourceBindings).sort();
  if (canonicalJson(actualPaths) !== canonicalJson(expectedPaths)) {
    throw new Error("R3_T4_SOURCE_BINDINGS_INVALID");
  }
  const root = requireOwnedDirectory(repoRoot, "R3_T4_REPO_ROOT_INVALID");
  for (const path of expectedPaths) {
    const expectedHash = sourceBindings[path];
    if (!HASH.test(expectedHash)
      || sha256(readBoundedRegularFile(
        resolveWithin(root, path, "R3_T4_BOUND_SOURCE_INVALID"),
        MAX_PREREGISTRATION_FILE_BYTES,
        "R3_T4_BOUND_SOURCE_INVALID",
      )) !== expectedHash) {
      throw new Error("R3_T4_BOUND_SOURCE_CHANGED");
    }
  }
  return Object.freeze({
    valid: true,
    sourceCount: expectedPaths.length,
    instrumentationHash: canonicalSha256(sourceBindings),
  });
}

export function verifyR3Preregistration(
  rootPath,
  { repoRoot = REPO_ROOT, requirePermissionProbes = true } = {},
) {
  const root = requireOwnedDirectory(
    rootPath,
    "R3_T4_PREREGISTRATION_ROOT_INVALID",
  );
  const expected = readBoundedRegularFile(
    join(root, "PREREGISTRATION.sha256"),
    128,
    "R3_T4_PREREGISTRATION_HASH_INVALID",
  ).toString("utf8").trim();
  if (!HASH.test(expected)) {
    throw new Error("R3_T4_PREREGISTRATION_HASH_INVALID");
  }
  const files = collectBoundedFiles(root);
  const actual = sha256(canonicalJson(files
    .filter((file) => file.relativePath !== "PREREGISTRATION.sha256")
    .map((file) => ({
      path: file.relativePath,
      sha256: sha256(readFileSync(file.absolutePath)),
    }))));
  if (actual !== expected) throw new Error("R3_T4_PREREGISTRATION_CHANGED");

  const plan = readBoundedJson(root, "PREREGISTRATION.json");
  const manifest = readBoundedJson(root, "inputs/task-manifest.json");
  const bindings = verifyR3BoundSources(plan.sourceBindings, { repoRoot });
  const verdictRule = readBoundedJson(root, "private/verdict-rule.json");
  if (plan.schemaVersion !== "R3-T3-preregistered-recovery-plan-v1"
    || plan.decisionKey !== "R3-RECOVERY"
    || plan.decisionAttempt !== 1
    || plan.preregistrationHashAlgorithm !== "sha256-canonical-file-manifest"
    || plan.taskCount !== 5
    || plan.runCount !== EXPECTED_RUN_COUNT
    || plan.model !== R3_MODEL
    || plan.instrumentationHash !== bindings.instrumentationHash
    || plan.priorInstrumentationHash !== R2_INSTRUMENTATION_HASH
    || plan.instrumentationHash === R2_INSTRUMENTATION_HASH
    || canonicalJson(plan.thresholdPolicy) !== canonicalJson(R3_VERDICT_RULE)
    || canonicalSha256(verdictRule) !== plan.verdictRuleHash
    || canonicalSha256(R3_VERDICT_RULE) !== plan.verdictRuleHash
    || plan.preparationSourceHash !== sha256(readBoundedRegularFile(
      resolveWithin(
        requireOwnedDirectory(repoRoot, "R3_T4_REPO_ROOT_INVALID"),
        "scripts/pilot/r3-t3.mjs",
        "R3_T4_PREPARATION_SOURCE_INVALID",
      ),
      MAX_PREREGISTRATION_FILE_BYTES,
      "R3_T4_PREPARATION_SOURCE_INVALID",
    ))
    || plan.externalExecutionAuthorized !== false
    || plan.productUnlockCount !== 0
    || plan.groundTruthParticipantVisible !== false
    || plan.auditContentNeedlesParticipantVisible !== false
    || plan.productHoldoutConsumed !== false
    || manifest.schemaVersion !== "R3-T3-task-manifest-v1"
    || manifest.decisionKey !== "R3-RECOVERY"
    || manifest.decisionAttempt !== 1
    || manifest.model !== R3_MODEL
    || canonicalSha256(manifest) !== plan.taskManifestHash) {
    throw new Error("R3_T4_PREREGISTRATION_INVALID");
  }
  verifyTerminalBindings(plan);
  verifyR3Manifest(root, plan, manifest, requirePermissionProbes);
  readAuditNeedles(root);
  verifyR3RunnerContracts(root, plan);
  return actual;
}

export function verifyR3InvocationBoundary(invocation) {
  if (!isRecord(invocation)
    || invocation.executable !== "/usr/bin/bwrap"
    || !Array.isArray(invocation.args)
    || !isRecord(invocation.evidence)
    || invocation.evidence.innerCodexSandbox
      !== `permission-profile:${R3_PERMISSION_PROFILE_NAME}`
    || invocation.evidence.generatedCommandApproval !== "never"
    || invocation.evidence.generatedCommandAuthAccess !== "deny"
    || invocation.evidence.generatedCommandWorkspaceAccess !== "read"
    || invocation.evidence.generatedCommandRuntimeAccess !== "/opt/codex:read"
    || invocation.evidence.generatedCommandNetwork !== "disabled"
    || invocation.evidence.generatedCommandEnvironment !== "clean-fixed-non-secret"
    || invocation.evidence.authoritativeResponseMount
      !== "/run/vem/final-response.json:rw-single-file"
    || invocation.args.includes("-s")
    || invocation.args.includes("--sandbox")
    || invocation.args.includes("--ignore-user-config")
    || invocation.args.includes("read-only")
    || countPair(invocation.args, "--profile", R3_PERMISSION_PROFILE_NAME) !== 1
    || invocation.args.filter((value) => value === "--strict-config").length !== 1
    || countPair(
      invocation.args,
      "--output-last-message",
      "/run/vem/final-response.json",
    ) !== 1
    || countMount(
      invocation.args,
      R3_PERMISSION_PROFILE_CONTAINER_PATH,
    ) !== 1
    || countMount(invocation.args, "/codex-home/auth.json") !== 1) {
    throw new Error("R3_T4_PERMISSION_BOUNDARY_UNSUPPORTED");
  }
  return Object.freeze({
    valid: true,
    permissionProfileBindingPassed: true,
    authBoundaryPassed: true,
  });
}

export function runR3CurrentPermissionPreflight({
  preregistrationRoot,
  taskId,
  permissionProbeRunner = runR3PermissionProfileProbe,
}) {
  const root = requireOwnedDirectory(
    preregistrationRoot,
    "R3_T4_PREREGISTRATION_ROOT_INVALID",
  );
  if (!ID.test(taskId) || typeof permissionProbeRunner !== "function") {
    throw new Error("R3_T4_PERMISSION_PREFLIGHT_INVALID");
  }
  const capsule = createParticipantCapsule({
    sourceRoot: join(root, "fixture"),
    taskId: `${taskId}-current-profile-probe`,
    arm: "direct-search",
    responseSchemaPath: join(root, "inputs/response-schema.json"),
  });
  try {
    const invocation = buildR3PermissionProfileProbeInvocation({ capsule });
    const result = permissionProbeRunner(invocation);
    if (!currentPermissionProbePassed(result)) {
      throw new Error("R3_T4_PERMISSION_PREFLIGHT_FAILED");
    }
    return deepFreeze({
      ...result,
      scope: "current-codex-binary-and-r3-profile-before-external-batch",
    });
  } finally {
    cleanupParticipantCapsule(capsule);
  }
}

export function finalizeR3FrozenRun({
  runRoot,
  groundTruth,
  forbiddenContentNeedles,
  expectedInstrumentationHash,
  preregistrationCheck,
  audit = auditCodexJsonlV3,
  evaluationProbe = () => {},
}) {
  return finalizeR3RecordedRun({
    runRoot,
    groundTruth,
    forbiddenContentNeedles,
    audit,
    verifyRecorderEvidence(root) {
      if (!verifyRecorderHashManifest(root)) return false;
      const recorded = readJsonFile(join(root, "run.json"));
      if (recorded.instrumentationHash !== expectedInstrumentationHash) {
        throw new Error("R3_T4_INSTRUMENTATION_HASH_CHANGED");
      }
      if (typeof preregistrationCheck !== "function"
        || preregistrationCheck() !== true) {
        throw new Error("R3_T4_PREREGISTRATION_CHANGED");
      }
      return true;
    },
    evaluationProbe,
  });
}

export function sealR3FrozenBatch({
  batchRoot,
  finalizedRuns,
  evaluationRuns,
  totalSetupDurationNs,
  expectedInstrumentationHash,
  preregistrationCheck,
  aggregateFailureCode = null,
  evaluate = evaluateR3Recovery,
}) {
  if (!Array.isArray(evaluationRuns)
    || aggregateFailureCode !== null
      && !/^[A-Z][A-Z0-9_]{1,63}$/u.test(aggregateFailureCode)) {
    throw new Error("R3_T4_AGGREGATE_INPUT_INVALID");
  }
  let verdict = null;
  const batch = sealR3BatchOutcome({
    resultRoot: batchRoot,
    runs: finalizedRuns,
    expectedRunCount: EXPECTED_RUN_COUNT,
    aggregateProbe() {
      if (aggregateFailureCode !== null) throw new Error(aggregateFailureCode);
      if (typeof preregistrationCheck !== "function"
        || preregistrationCheck() !== true) {
        throw new Error("R3_T4_PREREGISTRATION_CHANGED");
      }
      verdict = evaluate({
        runs: evaluationRuns,
        totalSetupDurationNs,
        expectedInstrumentationHash,
        aggregateIntegrityPassed: true,
      });
      if (!isRecord(verdict)
        || verdict.schemaVersion !== "R3-T4-verdict-v1"
        || verdict.decisionKey !== "R3-RECOVERY"
        || verdict.decisionAttempt !== 1
        || !["continue", "adjust", "stop"].includes(verdict.verdict)) {
        throw new Error("R3_T4_AGGREGATE_VERDICT_INVALID");
      }
    },
  });
  if (verdict === null) {
    verdict = evaluateR3Recovery({
      runs: evaluationRuns,
      totalSetupDurationNs,
      expectedInstrumentationHash,
      aggregateIntegrityPassed: false,
    });
  }
  return deepFreeze({
    batch,
    verdict,
    evaluatorCompleted: !verdict.stopReasons.includes(
      "aggregate-integrity-failed",
    ),
  });
}

export async function runR3RecoveryPilot({
  preregistrationRoot,
  resultRoot,
  authorizationPath,
}) {
  const preregRoot = requireExactChildDirectory(
    preregistrationRoot,
    PREREGISTRATION_PARENT,
    "R3_T4_PREREGISTRATION_ROOT_INVALID",
  );
  const outputRoot = requireNewExactChildPath(
    resultRoot,
    RESULT_PARENT,
    "R3_T4_RESULT_ROOT_INVALID",
  );
  const preregistrationHash = verifyR3Preregistration(preregRoot);
  const plan = readBoundedJson(preregRoot, "PREREGISTRATION.json");
  const manifest = readBoundedJson(preregRoot, "inputs/task-manifest.json");
  const authorization = JSON.parse(readBoundedRegularFile(
    resolve(authorizationPath),
    MAX_CONTROL_BYTES,
    "R3_T4_AUTHORIZATION_FILE_INVALID",
  ).toString("utf8"));
  const authorizationEvidence = verifyR3OwnerAuthorization({
    authorization,
    preregistrationHash,
  });
  const forbiddenContentNeedles = readAuditNeedles(preregRoot);
  const prepareSetup = readBoundedJson(
    preregRoot,
    "inputs/prepare-setup-cost.json",
  );
  mkdirPrivate(outputRoot, "R3_T4_RESULT_ROOT_CREATE_FAILED");
  const batchRoot = join(outputRoot, "batch");
  const runsRoot = join(batchRoot, "runs");
  mkdirPrivate(batchRoot, "R3_T4_BATCH_ROOT_CREATE_FAILED");
  mkdirPrivate(runsRoot, "R3_T4_RUNS_ROOT_CREATE_FAILED");

  const finalizedRuns = [];
  const evaluationRuns = [];
  let capsuleSetupDurationNs = 0n;
  let aggregateFailureCode = null;
  let currentPermissionPreflightPassed = false;
  try {
    const currentPermissionPreflight = runR3CurrentPermissionPreflight({
      preregistrationRoot: preregRoot,
      taskId: manifest.tasks[0]?.taskId,
    });
    currentPermissionPreflightPassed = true;
    writeJson(
      join(outputRoot, "results/current-permission-preflight.json"),
      {
        schemaVersion: "R3-T4-current-permission-preflight-v1",
        status: "passed",
        ...currentPermissionPreflight,
      },
    );
  } catch (error) {
    aggregateFailureCode = safeErrorCode(
      error,
      "R3_T4_PERMISSION_PREFLIGHT_FAILED",
    );
    writeJson(
      join(outputRoot, "results/current-permission-preflight.json"),
      {
        schemaVersion: "R3-T4-current-permission-preflight-v1",
        status: "failed",
        failureCode: aggregateFailureCode,
        rawMessagePersisted: false,
      },
    );
  }
  for (const task of manifest.tasks) {
    if (aggregateFailureCode !== null
      || finalizedRuns.some((run) => run.outcome !== "success")) break;
    const prompt = readBoundedRegularFile(
      join(preregRoot, `participant/tasks/${task.taskId}/prompt.txt`),
      MAX_CONTROL_BYTES,
      "R3_T4_PROMPT_INVALID",
    ).toString("utf8").trimEnd();
    const privateGroundTruth = readBoundedJson(
      preregRoot,
      `private/ground-truth/${task.taskId}.json`,
    );
    const capsuleProof = readBoundedJson(
      preregRoot,
      `capsules/${task.taskId}.json`,
    );
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
      verifyCapsuleBinding(plan, task.taskId, difference);
      capsuleSetupDurationNs += process.hrtime.bigint() - capsuleStartedAt;
      for (let index = 0; index < task.armOrder.length; index += 1) {
        const arm = task.armOrder[index];
        const capsule = arm === "direct-search" ? directCapsule : vemCapsule;
        const runId = `${task.taskId}-${index + 1}-${arm}`;
        const runRoot = join(runsRoot, runId);
        let boundary;
        let invocation;
        try {
          invocation = buildR3CodexCapsuleInvocation({
            capsule,
            prompt,
            model: R3_MODEL,
            authFile: join(homedir(), ".codex/auth.json"),
          });
          boundary = verifyR3InvocationBoundary(invocation);
        } catch (error) {
          aggregateFailureCode = safeErrorCode(
            error,
            "R3_T4_PERMISSION_BOUNDARY_UNSUPPORTED",
          );
          break;
        }
        let final;
        try {
          await executeR2RecordedProcess({
            invocation,
            outputRoot: runRoot,
            runId,
            instrumentationHash: plan.instrumentationHash,
            validateResponse: validateR3ResponseText,
            metadata: {
              taskId: task.taskId,
              arm,
              model: R3_MODEL,
              preregistrationHash,
              baseContextHash: difference.baseContextHash,
              treatmentHash: arm === "vem-assisted"
                ? difference.vemContextHash
                : null,
            },
          });
          final = finalizeR3FrozenRun({
            runRoot,
            groundTruth: buildR3ResponseGroundTruth(privateGroundTruth, arm),
            forbiddenContentNeedles,
            expectedInstrumentationHash: plan.instrumentationHash,
            preregistrationCheck: () => unchangedPreregistration(
              preregRoot,
              preregistrationHash,
            ),
            evaluationProbe: verifyFinalizerObservation,
          });
          finalizedRuns.push(final);
          const frozenPermissionProbePassed = currentPermissionProbePassed(
            capsuleProof.probes?.[
              arm === "direct-search"
                ? "directPermissionProfile"
                : "vemPermissionProfile"
            ],
          );
          const evaluation = buildEvaluationRun({
            runRoot,
            taskId: task.taskId,
            arm,
            final,
            boundary,
            instrumentationHash: plan.instrumentationHash,
            capsuleBindingPassed: true,
            permissionProfileProbePassed:
              currentPermissionPreflightPassed
              && frozenPermissionProbePassed,
          });
          evaluationRuns.push(evaluation);
        } catch (error) {
          if (final === undefined) {
            try {
              if (!existsSync(runRoot)) {
                mkdirPrivate(runRoot, "R3_T4_RUN_ROOT_CREATE_FAILED");
              }
              final = finalizeR3FrozenRun({
                runRoot,
                groundTruth: buildR3ResponseGroundTruth(
                  privateGroundTruth,
                  arm,
                ),
                forbiddenContentNeedles,
                expectedInstrumentationHash: plan.instrumentationHash,
                preregistrationCheck: () => unchangedPreregistration(
                  preregRoot,
                  preregistrationHash,
                ),
              });
              finalizedRuns.push(final);
            } catch {
              // The batch sealer below still fingerprints and seals partial data.
            }
          }
          aggregateFailureCode = safeErrorCode(
            error,
            "R3_T4_POST_EXECUTION_CONTAINED",
          );
          break;
        }
        if (final.outcome !== "success") break;
      }
    } finally {
      cleanupParticipantCapsule(directCapsule);
      if (vemCapsule !== undefined) cleanupParticipantCapsule(vemCapsule);
    }
  }

  const totalSetupDurationNs = (
    BigInt(prepareSetup.totalPrepareSetupDurationNs) + capsuleSetupDurationNs
  ).toString();
  const sealed = sealR3FrozenBatch({
    batchRoot,
    finalizedRuns,
    evaluationRuns,
    totalSetupDurationNs,
    expectedInstrumentationHash: plan.instrumentationHash,
    preregistrationCheck: () => unchangedPreregistration(
      preregRoot,
      preregistrationHash,
    ),
    aggregateFailureCode,
  });
  writeJson(join(outputRoot, "results/verdict.json"), sealed.verdict);
  writeJson(join(outputRoot, "results/run-index.json"), {
    schemaVersion: "R3-T4-run-index-v1",
    decisionKey: "R3-RECOVERY",
    decisionAttempt: 1,
    preregistrationHash,
    instrumentationHash: plan.instrumentationHash,
    authorizationHash: authorizationEvidence.authorizationHash,
    authorizedRunCount: authorizationEvidence.runCount,
    batchStopped: sealed.batch.batchStopped,
    evaluatorCompleted: sealed.evaluatorCompleted,
    runIds: evaluationRuns.map((run) => run.runId),
    threadIds: evaluationRuns.map((run) => run.threadId),
    ledgerContentHashes: evaluationRuns.map((run) => run.ledgerContentHash),
    verdictHash: canonicalSha256(sealed.verdict),
  });
  writeJson(join(outputRoot, "results/setup-cost.json"), {
    schemaVersion: "R3-T4-setup-cost-v1",
    preregistrationPrepareNs: prepareSetup.totalPrepareSetupDurationNs,
    capsuleSetupNs: capsuleSetupDurationNs.toString(),
    totalSetupDurationNs,
    perArmReceiptDurationsExcluded: true,
  });
  writeResultManifest(outputRoot);
  return deepFreeze({
    ok: sealed.verdict.verdict === "continue" && !sealed.batch.batchStopped,
    verdict: sealed.verdict.verdict,
    preregistrationHash,
    instrumentationHash: plan.instrumentationHash,
    resultRoot: outputRoot,
    batchStopped: sealed.batch.batchStopped,
    completedRunCount: evaluationRuns.length,
    remainingRunCount: EXPECTED_RUN_COUNT - evaluationRuns.length,
    evidenceSealed: true,
  });
}

function verifyTerminalBindings(plan) {
  if (plan.doesNotSupersede !== "R2-RECOVERY"
    || canonicalJson(plan.alsoDoesNotSupersede)
      !== canonicalJson(["R1-RECOVERY", "R0-RECOVERY", "P0-VALUE"])
    || canonicalJson(plan.terminalInputs)
      !== canonicalJson(EXPECTED_TERMINAL_BINDINGS)) {
    throw new Error("R3_T4_TERMINAL_BINDINGS_INVALID");
  }
}

function verifyR3Manifest(root, plan, manifest, requirePermissionProbes) {
  if (!Array.isArray(manifest.tasks)
    || manifest.tasks.length !== 5
    || !Array.isArray(plan.taskIds)
    || canonicalJson(plan.taskIds)
      !== canonicalJson(manifest.tasks.map((task) => task.taskId))
    || new Set(plan.taskIds).size !== 5) {
    throw new Error("R3_T4_TASK_MANIFEST_INVALID");
  }
  let runCount = 0;
  for (const task of manifest.tasks) {
    if (!isRecord(task)
      || !ID.test(task.taskId)
      || canonicalJson([...task.armOrder].sort())
        !== canonicalJson(["direct-search", "vem-assisted"])
      || !HASH.test(task.promptHash)
      || !HASH.test(task.groundTruthHash)
      || !HASH.test(task.vemContextHash)) {
      throw new Error("R3_T4_TASK_MANIFEST_INVALID");
    }
    runCount += task.armOrder.length;
    const prompt = readBoundedRegularFile(
      join(root, `participant/tasks/${task.taskId}/prompt.txt`),
      MAX_CONTROL_BYTES,
      "R3_T4_TASK_INPUT_INVALID",
    );
    const groundTruth = readBoundedJson(
      root,
      `private/ground-truth/${task.taskId}.json`,
    );
    const vemContext = readBoundedJson(
      root,
      `participant/vem-context/${task.taskId}.json`,
    );
    const proof = readBoundedJson(root, `capsules/${task.taskId}.json`);
    if (sha256(prompt) !== task.promptHash
      || canonicalSha256(groundTruth) !== task.groundTruthHash
      || canonicalSha256(vemContext) !== task.vemContextHash
      || proof.taskId !== task.taskId
      || proof.onlyDifference !== "vem-context.json"
      || proof.directManifest?.workspaceFiles?.some(
        (file) => file.path.startsWith("private/"),
      )
      || proof.vemManifest?.workspaceFiles?.some(
        (file) => file.path.startsWith("private/"),
      )
      || requirePermissionProbes && !permissionProofPassed(proof.probes)) {
      throw new Error("R3_T4_TASK_INPUT_INVALID");
    }
  }
  if (runCount !== EXPECTED_RUN_COUNT) {
    throw new Error("R3_T4_RUN_COUNT_INVALID");
  }
}

function verifyR3RunnerContracts(root, plan) {
  const audit = readBoundedJson(root, "inputs/audit-contract.json");
  const runner = readBoundedJson(root, "inputs/runner-contract.json");
  const permission = readBoundedJson(root, "inputs/permission-contract.json");
  const failure = readBoundedJson(root, "inputs/failure-evidence-contract.json");
  if (canonicalSha256(audit) !== plan.auditContractHash
    || canonicalSha256(permission) !== plan.permissionContractHash
    || canonicalSha256(failure) !== plan.failureEvidenceContractHash
    || canonicalSha256(runner) !== plan.runnerContractHash
    || runner.runner !== "scripts/pilot/r3-t4.mjs"
    || runner.recorder !== "scripts/pilot/r2-run-recorder.mjs"
    || runner.finalizer !== "scripts/pilot/r3-run-finalizer.mjs"
    || runner.capsule !== "scripts/pilot/r3-capsule.mjs"
    || runner.auditor !== "scripts/pilot/capsule-audit-v3.mjs"
    || runner.permissionProfile !== R3_PERMISSION_PROFILE_NAME
    || runner.generatedCommandAuthAccess !== "deny"
    || runner.generatedCommandEnvironment !== "clean-fixed-non-secret"
    || runner.participantWorkspaceWritable !== false
    || permission.unsupportedOrProbeMismatch !== "block-before-external-run"
    || permission.commandNetwork !== "disabled"
    || permission.interactiveEscalation !== "disabled"
    || failure.sealedBeforeReturn !== true
    || failure.batchPolicy !== "stop-after-first-non-success-or-unsealed-run") {
    throw new Error("R3_T4_RUNNER_CONTRACT_INVALID");
  }
}

function readAuditNeedles(root) {
  const value = readBoundedJson(root, "private/audit-content-needles.json");
  if (value.schemaVersion !== "R3-T3-audit-content-needles-v1"
    || value.participantVisible !== false
    || !Array.isArray(value.needles)
    || value.needles.length < 1
    || value.needles.length > 64) {
    throw new Error("R3_T4_AUDIT_NEEDLES_INVALID");
  }
  const ids = new Set();
  for (const needle of value.needles) {
    if (!isRecord(needle)
      || !ID.test(needle.id)
      || ids.has(needle.id)
      || typeof needle.text !== "string"
      || Buffer.byteLength(needle.text, "utf8") < 16
      || Buffer.byteLength(needle.text, "utf8") > 4_096) {
      throw new Error("R3_T4_AUDIT_NEEDLES_INVALID");
    }
    ids.add(needle.id);
  }
  return Object.freeze(value.needles.map((needle) => Object.freeze({
    id: needle.id,
    text: needle.text,
  })));
}

function permissionProofPassed(probes) {
  return ["directPermissionProfile", "vemPermissionProfile"].every((name) => {
    return currentPermissionProbePassed(probes?.[name]);
  });
}

function currentPermissionProbePassed(probe) {
  return probe?.ok === true
    && probe.modelCall === false
    && probe.workspaceReadable === true
    && probe.workspaceWritable === false
    && probe.authReadable === false
    && probe.procEnvironmentReadable === true
    && probe.procEnvironmentSensitiveValuesAbsent === true
    && probe.networkPolicyConfiguredDisabled === true
    && probe.networkRuntimeProbed === false;
}

function verifyCapsuleBinding(plan, taskId, difference) {
  const binding = plan.capsuleBaseHashes?.find(
    (candidate) => candidate.taskId === taskId,
  );
  if (binding?.baseContextHash !== difference.baseContextHash
    || binding?.vemContextHash !== difference.vemContextHash
    || difference.onlyDifference !== "vem-context.json") {
    throw new Error("R3_T4_CAPSULE_BINDING_CHANGED");
  }
}

export function buildR3ResponseGroundTruth(value, arm) {
  if (value?.schemaVersion !== "R3-T3-ground-truth-v1"
    || typeof value.expectedRelativeFile !== "string"
    || !Number.isSafeInteger(value.expectedLine)
    || typeof value.expectedSourceAnchorId !== "string"
    || !["direct-search", "vem-assisted"].includes(arm)) {
    throw new Error("R3_T4_GROUND_TRUTH_INVALID");
  }
  return Object.freeze({
    relativeFile: value.expectedRelativeFile,
    line: value.expectedLine,
    sourceAnchorId: arm === "vem-assisted"
      ? value.expectedSourceAnchorId
      : null,
  });
}

function buildEvaluationRun({
  runRoot,
  taskId,
  arm,
  final,
  boundary,
  instrumentationHash,
  capsuleBindingPassed,
  permissionProfileProbePassed,
}) {
  const recorded = readJsonFile(join(runRoot, "run.json"));
  const ledger = readJsonFile(join(runRoot, "receipt-ledger.json"));
  const terminal = readJsonFile(join(runRoot, "r3-terminal/terminal.json"));
  const evaluation = readJsonFile(join(runRoot, "r3-terminal/evaluation.json"));
  const groundTruthObservation = readJsonFile(
    join(runRoot, "r3-terminal/ground-truth-observation.json"),
  );
  const containedErrors = existsSync(join(runRoot, "r3-terminal/errors.json"))
    ? readJsonFile(join(runRoot, "r3-terminal/errors.json"))
    : { errors: [] };
  const stdout = readBoundedRegularFile(
    join(runRoot, "stdout.jsonl"),
    MAX_PREREGISTRATION_FILE_BYTES,
    "R3_T4_RUN_EVIDENCE_INVALID",
  ).toString("utf8");
  const protocolFailure = evaluation.protocolFailure === true;
  const attribution = protocolFailure ? null : evaluation.attribution;
  const outerManifestValid = verifyOuterManifest(runRoot, "R3-SHA256SUMS");
  return deepFreeze({
    runId: final.runId,
    taskId,
    arm,
    exitCode: recorded.process?.exitCode ?? null,
    threadId: extractSingleThreadId(stdout),
    receiptDurationNs: receiptDuration(ledger),
    instrumentationHash,
    ledgerContentHash: recorded.ledgerContentHash ?? null,
    preregistrationHashChanged: final.failureCodes.includes(
      "R3_T4_PREREGISTRATION_CHANGED",
    ),
    groundTruthVisible: false,
    holdoutConsumed: false,
    priorTaskOrPromptReused: false,
    capsuleIntegrityPassed: capsuleBindingPassed === true
      && terminal.unsafeBaseNodeCount === 0,
    capsuleAudit: final.capsuleAudit,
    permissionProfileProbePassed,
    permissionProfileBindingPassed: boundary.permissionProfileBindingPassed,
    authBoundaryPassed: boundary.authBoundaryPassed,
    protocolFailure,
    successfulResponseComplete: protocolFailure
      ? false
      : recorded.successfulResponseComplete === true,
    recorderEvidenceValid: evaluation.recorderEvidenceValid === true,
    evidenceSealed: final.evidenceSealed === true && outerManifestValid,
    evidenceHashesValid: evaluation.recorderEvidenceValid === true
      && outerManifestValid,
    failureEvidenceSealedBeforeReturn:
      evaluation.failureEvidenceSealedBeforeReturn === true,
    exceptionEvidenceSealedBeforeReturn:
      terminal.evidenceSealedBeforeReturn === true
      && outerManifestValid,
    evaluationIntegrityPassed:
      groundTruthObservation.status === "observed"
      && !containedErrors.errors?.some((error) => (
        error.stage === "ground-truth-observation"
          || error.stage === "evaluator"
      )),
    attribution,
    wrongAttribution: attribution === "wrong",
    responseMatchesGroundTruth: protocolFailure
      ? null
      : evaluation.responseMatchesGroundTruth,
    vemDirectPrimaryMatch: arm === "vem-assisted" && !protocolFailure
      ? evaluation.responseMatchesGroundTruth === true
      : null,
  });
}

function verifyFinalizerObservation(value) {
  if (!isRecord(value)
    || !ID.test(value.runId)
    || typeof value.recorderEvidenceValid !== "boolean"
    || typeof value.auditValid !== "boolean"
    || ![true, false, null].includes(value.responseMatchesGroundTruth)) {
    throw new Error("R3_T4_EVALUATOR_OBSERVATION_INVALID");
  }
}

function extractSingleThreadId(stdout) {
  const ids = [];
  for (const line of stdout.split(/\r?\n/u).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (event.type === "thread.started" && ID.test(event.thread_id ?? "")) {
        ids.push(event.thread_id);
      }
    } catch {
      return null;
    }
  }
  return ids.length === 1 ? ids[0] : null;
}

function receiptDuration(ledger) {
  try {
    const first = BigInt(ledger.firstReceivedAtNs);
    const last = BigInt(ledger.lastReceivedAtNs);
    return last >= first ? (last - first).toString() : null;
  } catch {
    return null;
  }
}

function countPair(args, option, value) {
  return args.filter((entry, index) => (
    entry === option && args[index + 1] === value
  )).length;
}

function countMount(args, target) {
  return args.filter((entry, index) => (
    entry === "--ro-bind" && args[index + 2] === target
  )).length;
}

function readBoundedJson(root, path) {
  return JSON.parse(readBoundedRegularFile(
    resolveWithin(root, path, "R3_T4_JSON_PATH_INVALID"),
    MAX_CONTROL_BYTES,
    "R3_T4_JSON_INVALID",
  ).toString("utf8"));
}

function readJsonFile(path) {
  return JSON.parse(readBoundedRegularFile(
    path,
    MAX_CONTROL_BYTES,
    "R3_T4_RUN_EVIDENCE_INVALID",
  ).toString("utf8"));
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

function collectBoundedFiles(root) {
  const files = [];
  let totalBytes = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
      if (!SAFE_PATH.test(relativePath) || entry.isSymbolicLink()) {
        throw new Error("R3_T4_PREREGISTRATION_UNSAFE_NODE");
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        const size = statSync(absolutePath).size;
        if (size > MAX_PREREGISTRATION_FILE_BYTES) {
          throw new Error("R3_T4_PREREGISTRATION_FILE_LIMIT");
        }
        totalBytes += size;
        files.push({ absolutePath, relativePath });
      } else {
        throw new Error("R3_T4_PREREGISTRATION_UNSAFE_NODE");
      }
      if (files.length > MAX_PREREGISTRATION_FILES
        || totalBytes > MAX_PREREGISTRATION_BYTES) {
        throw new Error("R3_T4_PREREGISTRATION_LIMIT");
      }
    }
  };
  visit(root);
  return files.sort((left, right) => (
    left.relativePath < right.relativePath
      ? -1
      : left.relativePath > right.relativePath ? 1 : 0
  ));
}

function resolveWithin(root, path, code) {
  if (!SAFE_PATH.test(path)) throw new Error(code);
  const resolved = resolve(root, path);
  if (relative(root, resolved).startsWith("..")) throw new Error(code);
  return resolved;
}

function requireOwnedDirectory(path, code) {
  const resolved = resolve(path);
  try {
    const stat = lstatSync(resolved);
    if (!stat.isDirectory() || stat.isSymbolicLink()
      || realpathSync(resolved) !== resolved) throw new Error(code);
  } catch {
    throw new Error(code);
  }
  return resolved;
}

function requireExactChildDirectory(path, parent, code) {
  const expectedParent = requireOwnedDirectory(parent, code);
  const resolved = requireOwnedDirectory(path, code);
  if (dirname(resolved) !== expectedParent) throw new Error(code);
  return resolved;
}

function requireNewExactChildPath(path, parent, code) {
  const expectedParent = requireOwnedDirectory(parent, code);
  const resolved = resolve(path);
  if (dirname(resolved) !== expectedParent
    || existsSync(resolved)
    || !ID.test(relative(expectedParent, resolved))) {
    throw new Error(code);
  }
  return resolved;
}

function mkdirPrivate(path, code) {
  mkdirSync(path, { mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || (stat.mode & 0o777) !== 0o700) throw new Error(code);
}

function writeResultManifest(root) {
  const files = collectBoundedFiles(root).filter(
    (file) => file.relativePath !== "RESULTS.sha256",
  );
  writeText(join(root, "RESULTS.sha256"), `${files.map((file) => (
    `${sha256(readFileSync(file.absolutePath))}  ${file.relativePath}`
  )).join("\n")}\n`);
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

function safeErrorCode(error, fallback) {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{1,63}$/u.test(error.message)
    ? error.message
    : fallback;
}

function unchangedPreregistration(root, expectedHash) {
  try {
    return verifyR3Preregistration(root) === expectedHash;
  } catch {
    return false;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 6 || process.argv[2] !== "run") {
    throw new Error(
      "USAGE: node scripts/pilot/r3-t4.mjs run "
      + "<preregistration-root> <result-root> <authorization-json>",
    );
  }
  const result = await runR3RecoveryPilot({
    preregistrationRoot: process.argv[3],
    resultRoot: process.argv[4],
    authorizationPath: process.argv[5],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
