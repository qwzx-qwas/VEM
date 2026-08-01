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
import {
  buildR3CodexCapsuleInvocation,
  R3_OUTER_PROCESS_ENV,
} from "./r3-capsule.mjs";
import {
  classifyR6Attempt,
  planR6Retry,
  sealR6AttemptEvidence,
} from "./r6-attempt-policy.mjs";
import {
  evaluateR6T7Recovery,
  R6_T7_DESTINATION,
  R6_T7_MODEL,
  R6_T7_TERMINATION_POLICY,
  R6_T7_VERDICT_RULE,
  validateR6T7ResponseText,
} from "./r6-attempt-two-plan.mjs";
import {
  validateR6AttemptTwoDeadlineCandidate,
} from "./r6-deadline-horizon.mjs";
import {
  executeR5BoundedProcess as executeR6T7BoundedProcess,
  installR5SignalForwarding as installR6T7SignalForwarding,
  verifyR5EvidenceManifest as verifyR6T7EvidenceManifest,
} from "./r5-process-terminalizer.mjs";
import {
  verifyR6InvocationCompatibility,
} from "./r6-invocation-preflight.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const PREREGISTRATION_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T6");
const RESULT_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T7");
const R6_T4_RESULT_MANIFEST =
  "docs/test-evidence/R6-T4/20260730T171100-0800/RESULTS.sha256";
const R6_T4_RESULT_MANIFEST_HASH =
  "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8";
const R6_T5_PROOF =
  "docs/test-evidence/R6-T5/20260730T174418-0800/proof.json";
const R6_T5_PROOF_HASH =
  "82585caca431e25e6bc0f8a7737cdab4a437ecd5cf8ebbb88eb6158c5c719fcb";
const R6_T5_CONTRACT_HASH =
  "6145537843ed5c35297196ec0dee74f618f0dd17bc9d89dcfa7bab87a07db4c2";
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,160}$/u;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 1_024;

export const R6_T7_RUNTIME_SOURCE_PATHS = Object.freeze([
  "scripts/pilot/r6-t7.mjs",
  "scripts/pilot/r6-attempt-two-plan.mjs",
  "scripts/pilot/r6-deadline-horizon.mjs",
  "scripts/pilot/r5-process-terminalizer.mjs",
  "scripts/pilot/r6-attempt-policy.mjs",
  "scripts/pilot/r6-recovery-plan.mjs",
  "scripts/pilot/r6-invocation-preflight.mjs",
  "scripts/pilot/r3-capsule.mjs",
  "scripts/pilot/r2-capsule.mjs",
  "scripts/pilot/capsule.mjs",
  "scripts/pilot/capsule-audit-v3.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);

export function verifyR6T7OwnerAuthorization({
  authorization,
  preregistrationHash,
  dataScopeHash,
  terminationPolicy,
  outerEnvironmentHash,
  deadlineContractHash,
  deadlineCandidateHash,
}) {
  if (![
    preregistrationHash,
    dataScopeHash,
    outerEnvironmentHash,
    deadlineContractHash,
    deadlineCandidateHash,
  ].every((value) => HASH.test(value ?? ""))
    || !isRecord(authorization)
    || authorization.schemaVersion !== "R6-T7-owner-authorization-v1"
    || authorization.taskId !== "R6-T7"
    || authorization.decisionKey !== "R6-RECOVERY"
    || authorization.decisionAttempt !== 2
    || authorization.supersedesAttempt !== "R6-T4"
    || authorization.authorized !== true
    || authorization.preregistrationHash !== preregistrationHash
    || authorization.destination !== R6_T7_DESTINATION
    || authorization.model !== R6_T7_MODEL
    || authorization.dataScopeHash !== dataScopeHash
    || authorization.outerEnvironmentHash !== outerEnvironmentHash
    || authorization.deadlineContractHash !== deadlineContractHash
    || authorization.deadlineCandidateHash !== deadlineCandidateHash
    || authorization.successfulArmCount
      !== R6_T7_TERMINATION_POLICY.requiredSuccessfulArms
    || authorization.maxProcessAttempts
      !== R6_T7_TERMINATION_POLICY.maxProcessAttempts
    || canonicalJson(authorization.terminationPolicy)
      !== canonicalJson(terminationPolicy)
    || canonicalJson(terminationPolicy)
      !== canonicalJson(R6_T7_TERMINATION_POLICY)
    || typeof authorization.statement !== "string"
    || Buffer.byteLength(authorization.statement, "utf8") < 32
    || Buffer.byteLength(authorization.statement, "utf8") > 2_048
    || typeof authorization.authorizedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
      .test(authorization.authorizedAt)) {
    throw new Error("R6_T7_OWNER_AUTHORIZATION_INVALID");
  }
  return Object.freeze({
    valid: true,
    decisionAttempt: 2,
    supersedesAttempt: "R6-T4",
    maxProcessAttempts: R6_T7_TERMINATION_POLICY.maxProcessAttempts,
    deadlineMs: R6_T7_TERMINATION_POLICY.deadlineMs,
    graceMs: R6_T7_TERMINATION_POLICY.graceMs,
    gracefulSignal: R6_T7_TERMINATION_POLICY.gracefulSignal,
    forceSignal: R6_T7_TERMINATION_POLICY.forceSignal,
    authorizationHash: canonicalSha256(authorization),
  });
}

export function verifyR6T7BoundSources(
  sourceBindings,
  { repoRoot = REPO_ROOT } = {},
) {
  const paths = Object.keys(sourceBindings ?? {}).sort();
  const expected = [...R6_T7_RUNTIME_SOURCE_PATHS].sort();
  if (canonicalJson(paths) !== canonicalJson(expected)) {
    throw new Error("R6_T7_SOURCE_BINDINGS_INVALID");
  }
  for (const path of expected) {
    const hash = sourceBindings[path];
    if (!HASH.test(hash ?? "")
      || sha256(readRegular(resolve(repoRoot, path))) !== hash) {
      throw new Error("R6_T7_BOUND_SOURCE_CHANGED");
    }
  }
  return Object.freeze({
    valid: true,
    sourceCount: expected.length,
    instrumentationHash: canonicalSha256(sourceBindings),
  });
}

export function verifyR6T6Preregistration(
  rootPath,
  { repoRoot = REPO_ROOT, requireProbes = true } = {},
) {
  const root = requireDirectory(
    rootPath,
    "R6_T7_PREREGISTRATION_INVALID",
  );
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
    throw new Error("R6_T7_PREREGISTRATION_CHANGED");
  }
  verifyImmutableInputs(repoRoot);
  const plan = readJson(join(root, "PREREGISTRATION.json"));
  const manifest = readJson(join(root, "inputs/task-manifest.json"));
  const terminationPolicy = readJson(
    join(root, "inputs/termination-policy.json"),
  );
  const deadlineContract = readJson(
    join(root, "inputs/deadline-compatibility-contract.json"),
  );
  const deadlineCandidate = readJson(
    join(root, "inputs/deadline-candidate.json"),
  );
  const versionEvidence = readJson(
    join(root, "inputs/version-bound-horizon-evidence.json"),
  );
  const storedDeadlineValidation = readJson(
    join(root, "inputs/deadline-candidate-validation.json"),
  );
  const deadlineValidation = validateR6AttemptTwoDeadlineCandidate({
    requirements: deadlineContract,
    candidate: deadlineCandidate,
  });
  const bindings = verifyR6T7BoundSources(plan.sourceBindings, { repoRoot });
  if (plan.schemaVersion !== "R6-T6-preregistered-recovery-plan-v1"
    || plan.decisionKey !== "R6-RECOVERY"
    || plan.decisionAttempt !== 2
    || plan.supersedesAttempt !== "R6-T4"
    || plan.doesNotSupersede !== "R5-RECOVERY"
    || canonicalJson(plan.alsoDoesNotSupersede) !== canonicalJson([
      "R4-RECOVERY",
      "R3-RECOVERY",
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
      "P0-VALUE",
    ])
    || plan.taskCount !== 5
    || plan.successfulArmCount !== 10
    || plan.maxProcessAttempts !== 20
    || plan.maxRetriesPerArm !== 1
    || plan.model !== R6_T7_MODEL
    || plan.destination !== R6_T7_DESTINATION
    || plan.instrumentationHash !== bindings.instrumentationHash
    || plan.externalExecutionAuthorized !== false
    || plan.productUnlockCount !== 0
    || plan.groundTruthParticipantVisible !== false
    || plan.productHoldoutConsumed !== false
    || plan.attemptOne?.taskId !== "R6-T4"
    || plan.attemptOne?.decision !== "adjust"
    || plan.attemptOne?.resultManifestHash
      !== R6_T4_RESULT_MANIFEST_HASH
    || plan.r6T5ProofHash !== R6_T5_PROOF_HASH
    || plan.deadlineContractHash !== R6_T5_CONTRACT_HASH
    || deadlineContract.contractHash !== plan.deadlineContractHash
    || plan.deadlineCandidateHash !== deadlineValidation.candidateHash
    || canonicalJson(storedDeadlineValidation)
      !== canonicalJson(deadlineValidation)
    || plan.versionBoundInstrumentationEvidenceHash
      !== canonicalSha256(versionEvidence)
    || deadlineCandidate.retryHorizonProvenance?.evidenceHash
      !== plan.versionBoundInstrumentationEvidenceHash
    || versionEvidence.provenanceKind
      !== deadlineCandidate.retryHorizonProvenance?.kind
    || versionEvidence.codexVersion !== deadlineCandidate.codexVersion
    || versionEvidence.instrumentationHash !== bindings.instrumentationHash
    || versionEvidence.deadlineContractHash !== plan.deadlineContractHash
    || versionEvidence.r6T5ProofHash !== R6_T5_PROOF_HASH
    || versionEvidence.providerInternalScheduleClaimed !== false
    || versionEvidence.providerNetworkProbed !== false
    || versionEvidence.modelCall !== false
    || canonicalJson(plan.outerEnvironment)
      !== canonicalJson(R3_OUTER_PROCESS_ENV)
    || canonicalSha256(plan.outerEnvironment) !== plan.outerEnvironmentHash
    || canonicalJson(terminationPolicy)
      !== canonicalJson(R6_T7_TERMINATION_POLICY)
    || canonicalJson(plan.terminationPolicy)
      !== canonicalJson(R6_T7_TERMINATION_POLICY)
    || canonicalSha256(terminationPolicy)
      !== plan.terminationPolicyHash
    || deadlineCandidate.deadlineMs !== terminationPolicy.deadlineMs
    || deadlineCandidate.terminalObservationMarginMs
      !== deadlineContract.maximumTerminalObservationMarginMs
    || canonicalSha256(R6_T7_VERDICT_RULE) !== plan.verdictRuleHash
    || manifest.schemaVersion !== "R6-T6-task-manifest-v1"
    || manifest.decisionAttempt !== 2
    || manifest.supersedesAttempt !== "R6-T4"
    || manifest.tasks?.length !== 5
    || canonicalSha256(manifest) !== plan.taskManifestHash
    || canonicalSha256({
      destination: plan.destination,
      model: plan.model,
      participantFiles: plan.participantDataPaths,
      deadlineCandidate,
      terminationPolicy: plan.terminationPolicy,
      outerEnvironment: plan.outerEnvironment,
    }) !== plan.dataScopeHash) {
    throw new Error("R6_T7_PREREGISTRATION_INVALID");
  }
  verifyManifestInputs(root, manifest, requireProbes);
  return Object.freeze({
    preregistrationHash: actual,
    plan,
    manifest,
    deadlineContract,
    deadlineCandidate,
    deadlineValidation,
  });
}

export async function runR6AttemptTwoPilot({
  preregistrationRoot,
  resultRoot,
  authorizationPath,
  executeAttempt = executeDefaultAttempt,
  signalProcess = process,
}) {
  const preregRoot = requireExactChild(
    preregistrationRoot,
    PREREGISTRATION_PARENT,
    false,
  );
  const outputRoot = requireExactChild(resultRoot, RESULT_PARENT, true);
  const verified = verifyR6T6Preregistration(preregRoot);
  const authorization = readJson(resolve(authorizationPath));
  const authorizationEvidence = verifyR6T7OwnerAuthorization({
    authorization,
    preregistrationHash: verified.preregistrationHash,
    dataScopeHash: verified.plan.dataScopeHash,
    terminationPolicy: verified.plan.terminationPolicy,
    outerEnvironmentHash: verified.plan.outerEnvironmentHash,
    deadlineContractHash: verified.plan.deadlineContractHash,
    deadlineCandidateHash: verified.plan.deadlineCandidateHash,
  });
  if (typeof executeAttempt !== "function") {
    throw new Error("R6_T7_EXECUTOR_INVALID");
  }
  mkdirPrivate(outputRoot);
  const runsRoot = join(outputRoot, "runs");
  mkdirPrivate(runsRoot);
  const preflight = runCurrentPreflight(
    preregRoot,
    verified.manifest,
    verified.deadlineCandidate,
  );
  writeJson(join(outputRoot, "results/local-preflight.json"), preflight);

  const controller = new globalThis.AbortController();
  const removeSignalForwarding = installR6T7SignalForwarding({
    controller,
    processLike: signalProcess,
  });
  const arms = [];
  const processAttempts = [];
  let batchStopped = false;
  const setupStarted = process.hrtime.bigint();
  try {
    for (const task of verified.manifest.tasks) {
      if (batchStopped || controller.signal.aborted) break;
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
        responseSchemaPath: join(
          preregRoot,
          "inputs/response-schema.json",
        ),
      });
      let vem;
      try {
        vem = createParticipantCapsule({
          sourceRoot: join(preregRoot, "fixture"),
          taskId: task.taskId,
          arm: "vem-assisted",
          responseSchemaPath: join(
            preregRoot,
            "inputs/response-schema.json",
          ),
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
            if (processAttempts.length
                >= R6_T7_TERMINATION_POLICY.maxProcessAttempts
              || controller.signal.aborted) {
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
              preflight,
              signal: controller.signal,
            });
            armDuration += BigInt(attempt.durationNs);
            const sealed = sealR6AttemptEvidence({
              runId,
              armKey,
              attemptNumber,
              classification: attempt.classification,
              evidenceHashes: attempt.evidenceHashes,
            });
            sealedAttempts.push(sealed);
            const retryPlan = planR6Retry({
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
              processTreeTerminated:
                attempt.classification.evidence.processTreeTerminated,
              terminalContradiction:
                attempt.failureCodes.includes(
                  "R5_TERMINAL_OBSERVATION_CONTRADICTION",
                ),
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
  } finally {
    removeSignalForwarding();
  }

  const totalSetupDurationNs = (
    process.hrtime.bigint() - setupStarted
  ).toString();
  const verdict = evaluateR6T7Recovery({
    arms,
    processAttempts,
    totalSetupDurationNs,
    expectedInstrumentationHash: verified.plan.instrumentationHash,
    aggregateIntegrityPassed: processAttempts.every((attempt) => (
      attempt.evidenceSealed
        && attempt.processTreeTerminated
        && !attempt.terminalContradiction
    )),
  });
  writeJson(join(outputRoot, "results/verdict.json"), verdict);
  writeJson(join(outputRoot, "results/run-index.json"), {
    schemaVersion: "R6-T7-run-index-v1",
    decisionAttempt: 2,
    supersedesAttempt: "R6-T4",
    attemptOneResultManifestHash: R6_T4_RESULT_MANIFEST_HASH,
    r6T5ProofHash: R6_T5_PROOF_HASH,
    deadlineContractHash: verified.plan.deadlineContractHash,
    deadlineCandidateHash: verified.plan.deadlineCandidateHash,
    preregistrationHash: verified.preregistrationHash,
    instrumentationHash: verified.plan.instrumentationHash,
    authorizationHash: authorizationEvidence.authorizationHash,
    dataScopeHash: verified.plan.dataScopeHash,
    terminationPolicyHash: verified.plan.terminationPolicyHash,
    outerEnvironmentHash: verified.plan.outerEnvironmentHash,
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
    remainingProcessAttemptBudget:
      R6_T7_TERMINATION_POLICY.maxProcessAttempts - processAttempts.length,
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
  preflight,
  signal,
}) {
  const runRoot = join(runsRoot, runId);
  const invocation = buildR3CodexCapsuleInvocation({
    capsule,
    prompt,
    model: R6_T7_MODEL,
    authFile: join(homedir(), ".codex/auth.json"),
  });
  const expected = {
    relativeFile: groundTruth.expectedRelativeFile,
    line: groundTruth.expectedLine,
    sourceAnchorId: arm === "vem-assisted"
      ? groundTruth.expectedSourceAnchorId
      : null,
  };
  const recorded = await executeR6T7BoundedProcess({
    invocation,
    outputRoot: runRoot,
    runId,
    instrumentationHash: plan.instrumentationHash,
    finalResponsePath: invocation.authoritativeResponsePath,
    terminationPolicy: runnerTerminationPolicy(plan.terminationPolicy),
    permissionState: {
      status: "passed",
      permissionProfilePassed: true,
      authReadableToGeneratedCommands: false,
      workspaceWritable: false,
      evidenceHash: canonicalSha256(preflight),
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
      const parsed = validateR6T7ResponseText(finalResponse);
      if (parsed === null) {
        return {
          status: "failed",
          valid: false,
          responsePresent: true,
          responseMatchesGroundTruth: false,
          failureCodes: ["R6_T7_AUTHORITATIVE_RESPONSE_INVALID"],
        };
      }
      const matches = canonicalJson(parsed) === canonicalJson(expected);
      return {
        status: matches ? "passed" : "failed",
        valid: matches,
        responsePresent: true,
        responseMatchesGroundTruth: matches,
        failureCodes: matches ? [] : ["R6_T7_WRONG_ATTRIBUTION"],
      };
    },
    signal,
  });
  const events = readJsonl(join(runRoot, "stdout.jsonl"));
  const termination = readJson(join(runRoot, "termination.json"));
  const finalResponse = readJson(
    join(runRoot, "final-response-observation.json"),
  );
  const boundary = readJson(join(runRoot, "boundary-state.json"));
  const classification = classifyR6Attempt({
    run: recorded,
    termination,
    finalResponse,
    boundary,
    events,
    evidenceSealed: recorded.evidenceSealed
      && verifyR6T7EvidenceManifest(runRoot),
  });
  const ledger = readJson(join(runRoot, "receipt-ledger.json"));
  const firstNs = ledger.entries.at(0)?.receivedAtNs ?? "0";
  const lastNs = ledger.entries.at(-1)?.receivedAtNs ?? firstNs;
  const evidenceHashes = Object.fromEntries(collectFiles(runRoot).map(
    (file) => [file.relativePath, sha256(readFileSync(file.absolutePath))],
  ));
  return Object.freeze({
    classification,
    durationNs: (BigInt(lastNs) - BigInt(firstNs)).toString(),
    evidenceHashes,
    failureCodes: recorded.failureCodes,
    aggregate: {
      wrongAttribution:
        boundary.evaluator?.responseMatchesGroundTruth === false,
      responseMatchesGroundTruth:
        boundary.evaluator?.responseMatchesGroundTruth ?? null,
      threadId: extractThread(events),
      baseContextHash: difference.baseContextHash,
      treatmentHash: arm === "vem-assisted"
        ? difference.vemContextHash : null,
      taskId: task.taskId,
      preregistrationHash,
    },
  });
}

function runCurrentPreflight(preregRoot, manifest, deadlineCandidate) {
  const taskId = manifest.tasks[0].taskId;
  const decisionCapsule = createParticipantCapsule({
    sourceRoot: join(preregRoot, "fixture"),
    taskId: `${taskId}-preflight-decision`,
    arm: "direct-search",
    responseSchemaPath: join(preregRoot, "inputs/response-schema.json"),
  });
  const probeCapsule = createParticipantCapsule({
    sourceRoot: join(preregRoot, "fixture"),
    taskId: `${taskId}-preflight-probe`,
    arm: "direct-search",
    responseSchemaPath: join(preregRoot, "inputs/response-schema.json"),
  });
  try {
    const binary = runCodexBinaryIsolationProbe(decisionCapsule);
    const compatibility = verifyR6InvocationCompatibility({
      decisionCapsule,
      probeCapsule,
      authFile: join(homedir(), ".codex/auth.json"),
    });
    if (binary.version !== deadlineCandidate.codexVersion
      || compatibility.ok !== true
      || compatibility.modelCall !== false
      || compatibility.workspaceWritable !== false
      || compatibility.authReadableToGeneratedCommands !== false
      || compatibility.providerNetworkProbed !== false
      || compatibility.outerEnvironmentHash
        !== canonicalSha256(R3_OUTER_PROCESS_ENV)) {
      throw new Error("R6_T7_PREFLIGHT_FAILED");
    }
    return Object.freeze({
      schemaVersion: "R6-T7-local-preflight-v1",
      ok: true,
      modelCall: false,
      networkRuntimeProbed: false,
      providerReachabilityClaimed: false,
      destination: R6_T7_DESTINATION,
      model: R6_T7_MODEL,
      codexVersion: binary.version,
      deadlineCandidateHash: canonicalSha256(deadlineCandidate),
      permissionProfilePassed: true,
      authReadableToGeneratedCommands: false,
      workspaceWritable: false,
      terminalizerInvocationPredicatePassed: true,
      outerEnvironmentHash: compatibility.outerEnvironmentHash,
      outerEnvironmentInheritedFromHost: false,
      exactDecisionInvocationExecuted: false,
    });
  } finally {
    cleanupParticipantCapsule(decisionCapsule);
    cleanupParticipantCapsule(probeCapsule);
  }
}

function verifyManifestInputs(root, manifest, requireProbes) {
  let armCount = 0;
  for (const task of manifest.tasks) {
    if (!ID.test(task.taskId)
      || canonicalJson([...task.armOrder].sort())
        !== canonicalJson(["direct-search", "vem-assisted"])) {
      throw new Error("R6_T7_TASK_MANIFEST_INVALID");
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
      throw new Error("R6_T7_TASK_INPUT_INVALID");
    }
  }
  if (armCount !== 10) throw new Error("R6_T7_ARM_COUNT_INVALID");
}

function verifyImmutableInputs(repoRoot) {
  if (sha256(readRegular(resolve(repoRoot, R6_T4_RESULT_MANIFEST)))
      !== R6_T4_RESULT_MANIFEST_HASH
    || sha256(readRegular(resolve(repoRoot, R6_T5_PROOF)))
      !== R6_T5_PROOF_HASH) {
    throw new Error("R6_T7_IMMUTABLE_INPUT_CHANGED");
  }
}

function runnerTerminationPolicy(policy) {
  return Object.freeze({
    deadlineMs: policy.deadlineMs,
    graceMs: policy.graceMs,
    forceKillWaitMs: policy.forceKillWaitMs,
    gracefulSignal: policy.gracefulSignal,
    forceSignal: policy.forceSignal,
  });
}

function collectFiles(root) {
  const files = [];
  let bytes = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) throw new Error("R6_T7_UNSAFE_NODE");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        const size = statSync(absolutePath).size;
        if (size > MAX_FILE_BYTES) throw new Error("R6_T7_FILE_LIMIT");
        bytes += size;
        files.push({ absolutePath, relativePath });
      } else throw new Error("R6_T7_UNSAFE_NODE");
      if (files.length > MAX_FILES || bytes > MAX_TOTAL_BYTES) {
        throw new Error("R6_T7_EVIDENCE_LIMIT");
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
  const expectedParent = requireDirectory(parent, "R6_T7_PARENT_INVALID");
  const output = resolve(path);
  if (dirname(output) !== expectedParent
    || !ID.test(relative(expectedParent, output))
    || mustBeNew && existsSync(output)) {
    throw new Error("R6_T7_CHILD_PATH_INVALID");
  }
  if (!mustBeNew) requireDirectory(output, "R6_T7_CHILD_PATH_INVALID");
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
    throw new Error("R6_T7_FILE_INVALID");
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
      "USAGE: node scripts/pilot/r6-t7.mjs run "
      + "<preregistration-root> <result-root> <authorization-json>",
    );
  }
  const result = await runR6AttemptTwoPilot({
    preregistrationRoot: process.argv[3],
    resultRoot: process.argv[4],
    authorizationPath: process.argv[5],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
