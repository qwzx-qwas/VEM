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
import { transformIntrinsicJsx } from "../../packages/vite-plugin/dist/index.js";
import {
  cleanupParticipantCapsule,
  createParticipantCapsule,
  runCodexBinaryIsolationProbe,
  runFilesystemIsolationProbe,
} from "./capsule.mjs";
import {
  buildR3PermissionProfileProbeInvocation,
  R3_OUTER_PROCESS_ENV,
  runR3PermissionProfileProbe,
} from "./r3-capsule.mjs";
import {
  cleanupR7Attempt,
  containR7UnspawnedAttempt,
  createR7AttemptFactory,
} from "./r7-attempt-factory.mjs";
import {
  buildR7T4Prompt,
  R7_T2_PUBLISHED_COMMIT,
  R7_T4_DESTINATION,
  R7_T4_FIXTURE_FILES,
  R7_T4_MODEL,
  R7_T4_RESPONSE_SCHEMA,
  R7_T4_RUNTIME_SOURCE_PATHS,
  R7_T4_TASKS,
  R7_T4_TERMINATION_POLICY,
  R7_T4_VERDICT_RULE,
} from "./r7-plan.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R7-T3");
const FIXTURE_FILE = "packages/demo-fixture/src/App.tsx";
const REGISTRY_REVISION = "r7-retry-isolation-registry-v1";
const R6_T12_ROOT = "docs/test-evidence/R6-T12/20260801T131600-0800";
const R6_T12_PREREGISTRATION_HASH =
  "531e9ea500d198c60dfb834c0b210bee9fb2eaf52772fc1ae85876bcd0c5e62d";
const R6_T13_ROOT = "docs/test-evidence/R6-T13/20260801T141247-0800";
const R6_T13_RESULTS_FILE_HASH =
  "4e81c4742b02bc3ccae63c733c8816208e742d60dc1608c49d386d56981f4f43";
const R6_T13_VERDICT_FILE_HASH =
  "ff51df7ccfbb910776a96c85acb7fa5a8f705b915d6082d53865a807c23771af";
const R7_T2_PROOF_PATH =
  "docs/test-evidence/R7-T2/20260801T160404-0800/proof.json";
const R7_T2_PROOF_FILE_HASH =
  "6dd52fdec6f3ae1bb3077b9b0bd545a1bba3a3a67a87626dcf6cce99d4ec3838";
const R7_T2_PROOF_HASH =
  "165c6634eca37c297e304eea19eef0f2e30597430e8ea79e5a834b7b5ee36e57";
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,160}$/u;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 1_024;
const PARTICIPANT_DATA_PATHS = Object.freeze([
  "prompt.txt",
  "packages/demo-fixture/src/App.tsx",
  "packages/demo-fixture/src/fixtures.ts",
  ".pilot/response-schema.json",
  ".pilot/vem-context.json (vem-assisted only)",
]);

export function prepareR7Preregistration({
  outputRoot,
  runProbes = true,
  enforceEvidenceParent = true,
  permissionProbeRunner = runR3PermissionProfileProbe,
  authFile = join(homedir(), ".codex/auth.json"),
  codexInstallRoot,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)
    || typeof permissionProbeRunner !== "function") {
    throw new Error("R7_T3_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R7_T3_OUTPUT_PARENT_INVALID",
  );
  const prior = verifyR6PreregistrationInputs();
  const r6Stop = verifyR6TerminalStop();
  const r7T2 = verifyR7T2Proof();
  const startedAt = process.hrtime.bigint();
  mkdirSync(output, { mode: 0o700 });

  for (const [path, body] of Object.entries(R7_T4_FIXTURE_FILES)) {
    writeText(join(output, "fixture", path), body);
  }
  writeJson(join(output, "inputs/response-schema.json"), R7_T4_RESPONSE_SCHEMA);
  writeJson(join(output, "inputs/termination-policy.json"), R7_T4_TERMINATION_POLICY);
  writeJson(join(output, "private/verdict-rule.json"), R7_T4_VERDICT_RULE);
  writeJson(join(output, "private/r6-terminal-stop-binding.json"), r6Stop);
  writeJson(join(output, "private/r7-t2-binding.json"), r7T2);
  writeJson(join(output, "private/prior-task-exclusion.json"), {
    schemaVersion: "R7-T3-prior-task-exclusion-v1",
    sourcePreregistration: "R6-T12",
    sourcePreregistrationHash: R6_T12_PREREGISTRATION_HASH,
    taskIds: prior.taskIds,
    promptHashes: prior.promptHashes,
    consumedAsParticipantTasks: false,
  });
  writeJson(join(output, "private/product-holdout-exclusion.json"), {
    schemaVersion: "R7-T3-product-holdout-exclusion-v1",
    sourceHash: prior.productHoldout.sourceHash,
    taskIds: prior.productHoldout.taskIds,
    consumed: false,
    remediationTasksAreProductHoldouts: false,
  });
  writeJson(join(output, "private/audit-content-needles.json"), {
    schemaVersion: "R7-T3-audit-content-needles-v1",
    participantVisible: false,
    inheritedSemantics: "R3-v3-auditor-via-R6-T12",
    sourceHash: canonicalSha256(prior.auditNeedles),
    needles: prior.auditNeedles.needles,
  });
  writeJson(join(output, "inputs/failure-policy-validation.json"), prior.failurePolicy);
  writeJson(join(output, "inputs/attempt-classification-contract.json"), {
    schemaVersion: "R7-T3-attempt-classification-contract-v1",
    inheritedValidatedPolicyHash: canonicalSha256(prior.failurePolicy),
    retryable: R7_T4_TERMINATION_POLICY.retryableClassifications,
    nonRetryable: [
      "runner-wall-clock-terminated-before-response",
      "integrity-failure",
      "partial-or-completed-response",
      "protocol-or-unknown-failure-without-selected-evidence-conjunction",
    ],
    providerTurnFailedMustBeObserved: true,
    providerTerminalMayBeSynthesized: false,
    failureSemanticsChangedFromR6T12: false,
  });
  writeJson(join(output, "inputs/attempt-isolation-contract.json"), {
    schemaVersion: "R7-T3-attempt-isolation-contract-v1",
    freshCapsuleBeforeEveryProcessAttempt: true,
    distinctControlRoot: true,
    distinctPermissionProfile: true,
    distinctAuthoritativeFinalFile: true,
    priorWritableOutputReused: false,
    priorAttemptStateParticipantVisible: false,
    cleanupOnlyAfterTerminalEvidenceSealed: true,
    cleanupFailureFailClosed: true,
    retryAuthorizedDistinctFromRetryProcessStarted: true,
    unspawnedRetryConsumesProcessBudget: false,
  });
  writeJson(join(output, "inputs/batch-sealing-contract.json"), {
    schemaVersion: "R7-T3-batch-sealing-contract-v1",
    exceptionStages: [
      "retry-planning",
      "capsule-preparation",
      "spawn",
      "classification",
      "aggregate-evaluation",
      "terminal-manifest",
      "cleanup",
    ],
    terminalFiles: [
      "results/batch-stop.json",
      "results/exceptions.json",
      "results/retry-decisions.json",
      "results/run-index.json",
      "results/verdict.json",
      "RESULTS.sha256",
    ],
    sealedAttemptsRetained: true,
    partialOnlyResultForbidden: true,
    sameAuthorizationAlternateRootRerunForbidden: true,
  });
  writeJson(join(output, "inputs/invocation-environment-contract.json"), {
    schemaVersion: "R7-T3-invocation-environment-contract-v1",
    outerEnvironment: R3_OUTER_PROCESS_ENV,
    outerEnvironmentHash: canonicalSha256(R3_OUTER_PROCESS_ENV),
    inheritedFromHost: false,
    generatedCommandAuthAccess: "deny",
    generatedCommandNetwork: "disabled",
    participantWorkspaceWritable: false,
  });

  const source = R7_T4_FIXTURE_FILES[FIXTURE_FILE];
  const transformed = transformIntrinsicJsx({
    code: source,
    filename: join(output, "fixture", FIXTURE_FILE),
    relativeFile: FIXTURE_FILE,
    sourceRegistryRevision: REGISTRY_REVISION,
  });
  writeJson(join(output, "inputs/source-registry.json"), {
    schemaVersion: "R7-T3-source-registry-v1",
    sourceRegistryRevision: REGISTRY_REVISION,
    records: transformed.records,
  });

  const tasks = [];
  const capsuleBindings = [];
  let localProbeCount = 0;
  let attemptIsolationProbeCount = 0;
  for (const task of R7_T4_TASKS) {
    const line = source.split("\n").findIndex((value) => value.includes(task.marker)) + 1;
    const record = transformed.records.find((value) => (
      value.relativeFile === FIXTURE_FILE
        && value.intrinsicTag === task.tagName
        && value.line === line
    ));
    if (record === undefined) throw new Error("R7_T3_SOURCE_RECORD_MISSING");
    const prompt = `${buildR7T4Prompt(task.description)}\n`;
    const promptHash = sha256(prompt);
    if (prior.taskIds.includes(task.taskId)
      || prior.promptHashes.includes(promptHash)
      || prior.productHoldout.taskIds.includes(task.taskId)) {
      throw new Error("R7_T3_TASK_BANK_NOT_FRESH");
    }
    writeText(join(output, `participant/tasks/${task.taskId}/prompt.txt`), prompt);
    const groundTruth = {
      schemaVersion: "R7-T3-ground-truth-v1",
      taskId: task.taskId,
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
    };
    writeJson(join(output, `private/ground-truth/${task.taskId}.json`), groundTruth);
    const vemContext = {
      schemaVersion: "R7-T3-vem-context-v1",
      taskId: task.taskId,
      selection: {
        kind: "element",
        intrinsicTag: task.tagName,
        privacy: "minimum-summary-no-live-value",
      },
      sourceResolution: {
        kind: "direct",
        directPrimary: {
          relativeFile: record.relativeFile,
          line: record.line,
          sourceAnchorId: record.sourceAnchorId,
        },
      },
      limitations: [
        "R7_RETRY_ISOLATION_RESEARCH_ONLY",
        "NO_PRODUCT_HOLDOUT_STATUS",
      ],
    };
    const contextPath = join(output, `participant/vem-context/${task.taskId}.json`);
    writeJson(contextPath, vemContext);

    const isolation = proveAttemptIsolation({
      output,
      task,
      prompt: prompt.trimEnd(),
      contextPath,
      authFile,
      codexInstallRoot,
    });
    attemptIsolationProbeCount += isolation.preparedAttemptCount;
    const probes = proveLocalCapsuleBoundary({
      output,
      task,
      contextPath,
      runProbes,
      permissionProbeRunner,
    });
    if (runProbes) localProbeCount += 6;
    writeJson(join(output, `capsules/${task.taskId}.json`), {
      schemaVersion: "R7-T3-capsule-proof-v1",
      taskId: task.taskId,
      onlyDifference: isolation.onlyDifference,
      baseContextHash: isolation.baseContextHash,
      vemContextHash: isolation.vemContextHash,
      retryIsolation: isolation,
      probes,
    });
    capsuleBindings.push({
      taskId: task.taskId,
      baseContextHash: isolation.baseContextHash,
      vemContextHash: isolation.vemContextHash,
      preparedAttemptCount: isolation.preparedAttemptCount,
      distinctControlRootCount: isolation.distinctControlRootCount,
      distinctFinalFileCount: isolation.distinctFinalFileCount,
    });
    tasks.push({
      taskId: task.taskId,
      taskClass: "r7-retry-isolation-research-only-not-product-holdout",
      armOrder: task.armOrder,
      promptHash,
      fixtureHash: canonicalSha256(R7_T4_FIXTURE_FILES),
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
      groundTruthHash: canonicalSha256(groundTruth),
      vemContextHash: canonicalSha256(vemContext),
    });
  }

  const manifest = {
    schemaVersion: "R7-T3-task-manifest-v1",
    decisionKey: "R7-RECOVERY",
    decisionAttempt: 1,
    supersedesAttempt: null,
    model: R7_T4_MODEL,
    destination: R7_T4_DESTINATION,
    taskBank: "r7-retry-isolation-research-only-not-product-holdout",
    contextPolicy: "fresh-capsule-and-process-group-per-attempt",
    promptPolicy: "identical-within-task-pair-and-retry",
    terminationPolicy: R7_T4_TERMINATION_POLICY,
    tasks,
  };
  writeJson(join(output, "inputs/task-manifest.json"), manifest);
  writeJson(join(output, "inputs/runner-contract.json"), {
    schemaVersion: "R7-T3-runner-contract-v1",
    runner: "scripts/pilot/r7-t4.mjs",
    attemptFactory: "scripts/pilot/r7-attempt-factory.mjs",
    batchSealer: "scripts/pilot/r7-batch-sealer.mjs",
    terminalizer: "scripts/pilot/r5-process-terminalizer.mjs",
    classifier: "scripts/pilot/r6-attempt-four-policy.mjs",
    processStartAccounting: "positive-process-spawn-receipt-only",
    authoritativeResponse: "unique-codex-output-last-message-file-per-attempt",
    resultRootAuthorizationLedger: "single-claim-no-alternate-root-rerun",
    terminationPolicy: R7_T4_TERMINATION_POLICY,
  });

  const sourceBindings = Object.fromEntries(R7_T4_RUNTIME_SOURCE_PATHS.map((path) => [
    path,
    sha256(readFileSync(join(REPO_ROOT, path))),
  ]));
  const instrumentationHash = canonicalSha256(sourceBindings);
  const failurePolicyHash = canonicalSha256(prior.failurePolicy);
  const attemptIsolationPolicy = readJson(join(output, "inputs/attempt-isolation-contract.json"));
  const batchSealingPolicy = readJson(join(output, "inputs/batch-sealing-contract.json"));
  const retryIsolationHash = canonicalSha256({
    attemptIsolationPolicy,
    batchSealingPolicy,
  });
  const participantDataPaths = [...PARTICIPANT_DATA_PATHS];
  const dataScopeHash = canonicalSha256({
    destination: R7_T4_DESTINATION,
    model: R7_T4_MODEL,
    participantFiles: participantDataPaths,
    failurePolicyHash,
    retryIsolationHash,
    terminationPolicy: R7_T4_TERMINATION_POLICY,
    outerEnvironment: R3_OUTER_PROCESS_ENV,
  });
  writeJson(join(output, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "R7-T3-prepare-setup-cost-v1",
    totalPrepareSetupDurationNs: (process.hrtime.bigint() - startedAt).toString(),
    excludedFromPerArmDuration: true,
  });
  const plan = {
    schemaVersion: "R7-T3-preregistered-recovery-plan-v1",
    decisionKey: "R7-RECOVERY",
    decisionAttempt: 1,
    supersedesAttempt: null,
    doesNotSupersede: "R6-RECOVERY",
    alsoDoesNotSupersede: [
      "R5-RECOVERY",
      "R4-RECOVERY",
      "R3-RECOVERY",
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
      "P0-VALUE",
    ],
    prerequisitePublishedCommit: R7_T2_PUBLISHED_COMMIT,
    taskCount: 5,
    successfulArmCount: 10,
    maxRetriesPerArm: R7_T4_TERMINATION_POLICY.maxRetriesPerArm,
    maxProcessAttempts: R7_T4_TERMINATION_POLICY.maxProcessAttempts,
    model: R7_T4_MODEL,
    destination: R7_T4_DESTINATION,
    participantDataPaths,
    dataScopeHash,
    terminationPolicy: R7_T4_TERMINATION_POLICY,
    terminationPolicyHash: canonicalSha256(R7_T4_TERMINATION_POLICY),
    failurePolicyHash,
    retryIsolationHash,
    outerEnvironment: R3_OUTER_PROCESS_ENV,
    outerEnvironmentHash: canonicalSha256(R3_OUTER_PROCESS_ENV),
    instrumentationHash,
    sourceBindings,
    preparationSourceHash: sha256(readFileSync(SCRIPT_PATH)),
    taskManifestHash: canonicalSha256(manifest),
    verdictRuleHash: canonicalSha256(R7_T4_VERDICT_RULE),
    capsuleBaseHashes: capsuleBindings,
    immutableR6Stop: r6Stop,
    r7T2Binding: r7T2,
    priorPreregistration: {
      taskId: "R6-T12",
      preregistrationHash: R6_T12_PREREGISTRATION_HASH,
      transitivePriorDecisionChainBound: true,
    },
    groundTruthParticipantVisible: false,
    productHoldoutConsumed: false,
    externalExecutionAuthorized: false,
    productUnlockCount: 0,
    preregistrationHashAlgorithm: "sha256-canonical-file-manifest",
    nextAuthorization:
      "owner-must-bind-published-r7-t3-commit-preregistration-instrumentation-data-scope-failure-retry-isolation-termination-outer-environment-destination-model-ten-arms-and-twenty-process-cap",
    limitations: [
      "R7_RETRY_ISOLATION_RESEARCH_SMOKE_ONLY",
      "R6_TERMINAL_STOP_AND_ALL_PRIOR_DECISIONS_REMAIN_IMMUTABLE",
      "FAILURE_CLASSIFICATION_AND_TERMINATION_POLICY_UNCHANGED_FROM_R6_T12",
      "EVERY_PROCESS_ATTEMPT_REQUIRES_A_FRESH_CAPSULE_AND_FINAL_FILE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_EXTERNAL_MODEL_CALL_IN_R7_T3",
      "NO_PRODUCT_UNLOCK",
    ],
  };
  writeJson(join(output, "PREREGISTRATION.json"), plan);
  const digest = preregistrationDigest(output);
  writeText(join(output, "PREREGISTRATION.sha256"), `${digest}\n`);
  return Object.freeze({
    ok: true,
    taskId: "R7-T3",
    decisionAttempt: 1,
    taskCount: 5,
    successfulArmCount: 10,
    maxProcessAttempts: R7_T4_TERMINATION_POLICY.maxProcessAttempts,
    localProbeCount,
    attemptIsolationProbeCount,
    preregistrationHash: digest,
    instrumentationHash,
    dataScopeHash,
    failurePolicyHash,
    retryIsolationHash,
    terminationPolicyHash: plan.terminationPolicyHash,
    outerEnvironmentHash: plan.outerEnvironmentHash,
    externalExecutionAuthorized: false,
    externalModelCallCount: 0,
    outputRoot: output,
  });
}

export function verifyR7Preregistration(
  rootPath,
  { repoRoot = REPO_ROOT, requireProbes = true } = {},
) {
  const root = requireDirectory(rootPath, "R7_T3_PREREGISTRATION_INVALID");
  const expected = readRegular(join(root, "PREREGISTRATION.sha256"))
    .toString("utf8").trim();
  const actual = preregistrationDigest(root);
  if (!HASH.test(expected) || expected !== actual) {
    throw new Error("R7_T3_PREREGISTRATION_CHANGED");
  }
  verifyImmutableR7Inputs(repoRoot);
  const plan = readJson(join(root, "PREREGISTRATION.json"));
  const manifest = readJson(join(root, "inputs/task-manifest.json"));
  const bindings = verifyR7BoundSources(plan.sourceBindings, { repoRoot });
  const failurePolicy = readJson(join(root, "inputs/failure-policy-validation.json"));
  const attemptIsolation = readJson(join(root, "inputs/attempt-isolation-contract.json"));
  const batchSealing = readJson(join(root, "inputs/batch-sealing-contract.json"));
  const retryIsolationHash = canonicalSha256({
    attemptIsolationPolicy: attemptIsolation,
    batchSealingPolicy: batchSealing,
  });
  if (plan.schemaVersion !== "R7-T3-preregistered-recovery-plan-v1"
    || plan.decisionKey !== "R7-RECOVERY"
    || plan.decisionAttempt !== 1
    || plan.supersedesAttempt !== null
    || plan.doesNotSupersede !== "R6-RECOVERY"
    || canonicalJson(plan.alsoDoesNotSupersede) !== canonicalJson([
      "R5-RECOVERY", "R4-RECOVERY", "R3-RECOVERY", "R2-RECOVERY",
      "R1-RECOVERY", "R0-RECOVERY", "P0-VALUE",
    ])
    || plan.prerequisitePublishedCommit !== R7_T2_PUBLISHED_COMMIT
    || plan.taskCount !== 5
    || plan.successfulArmCount !== 10
    || plan.maxRetriesPerArm !== 1
    || plan.maxProcessAttempts !== 20
    || plan.model !== R7_T4_MODEL
    || plan.destination !== R7_T4_DESTINATION
    || plan.instrumentationHash !== bindings.instrumentationHash
    || plan.failurePolicyHash !== canonicalSha256(failurePolicy)
    || plan.retryIsolationHash !== retryIsolationHash
    || plan.terminationPolicyHash !== canonicalSha256(R7_T4_TERMINATION_POLICY)
    || plan.outerEnvironmentHash !== canonicalSha256(R3_OUTER_PROCESS_ENV)
    || plan.externalExecutionAuthorized !== false
    || plan.productUnlockCount !== 0
    || plan.groundTruthParticipantVisible !== false
    || plan.productHoldoutConsumed !== false
    || plan.immutableR6Stop?.decision !== "stop"
    || plan.immutableR6Stop?.overwritten !== false
    || plan.r7T2Binding?.proofHash !== R7_T2_PROOF_HASH
    || plan.r7T2Binding?.overwritten !== false
    || canonicalJson(manifest.terminationPolicy)
      !== canonicalJson(R7_T4_TERMINATION_POLICY)) {
    throw new Error("R7_T3_PLAN_INVALID");
  }
  verifyTaskInputs(root, manifest, requireProbes);
  return Object.freeze({
    valid: true,
    preregistrationHash: actual,
    plan,
    manifest,
  });
}

export function verifyR7BoundSources(
  sourceBindings,
  { repoRoot = REPO_ROOT } = {},
) {
  const paths = Object.keys(sourceBindings ?? {}).sort();
  const expected = [...R7_T4_RUNTIME_SOURCE_PATHS].sort();
  if (canonicalJson(paths) !== canonicalJson(expected)) {
    throw new Error("R7_T3_SOURCE_BINDINGS_INVALID");
  }
  for (const path of expected) {
    const hash = sourceBindings[path];
    if (!HASH.test(hash ?? "")
      || sha256(readRegular(resolve(repoRoot, path))) !== hash) {
      throw new Error("R7_T3_BOUND_SOURCE_CHANGED");
    }
  }
  return Object.freeze({
    valid: true,
    sourceCount: expected.length,
    instrumentationHash: canonicalSha256(sourceBindings),
  });
}

export function preregistrationDigest(rootPath) {
  const root = requireDirectory(rootPath, "R7_T3_PREREGISTRATION_INVALID");
  const files = collectFiles(root).filter((file) => (
    file.relativePath !== "PREREGISTRATION.sha256"
  ));
  return sha256(canonicalJson(files.map((file) => ({
    path: file.relativePath,
    sha256: sha256(readFileSync(file.absolutePath)),
  }))));
}

function proveAttemptIsolation({
  output,
  task,
  prompt,
  contextPath,
  authFile,
  codexInstallRoot,
}) {
  const factory = createR7AttemptFactory({
    sourceRoot: join(output, "fixture"),
    responseSchemaPath: join(output, "inputs/response-schema.json"),
    model: R7_T4_MODEL,
    authFile,
    ...(codexInstallRoot === undefined ? {} : { codexInstallRoot }),
  });
  const handles = [];
  try {
    for (const attemptNumber of [1, 2]) {
      handles.push(factory.prepare({
        taskId: task.taskId,
        arm: "direct-search",
        attemptNumber,
        prompt,
      }));
      handles.push(factory.prepare({
        taskId: task.taskId,
        arm: "vem-assisted",
        attemptNumber,
        prompt,
        vemContextPath: contextPath,
      }));
    }
    const firstPair = factory.comparePair(handles[0], handles[1]);
    const retryPair = factory.comparePair(handles[2], handles[3]);
    const record = {
      schemaVersion: "R7-T3-attempt-isolation-proof-v1",
      preparedAttemptCount: handles.length,
      distinctCapsuleRootCount: new Set(handles.map(
        (handle) => handle.resources.capsuleRoot,
      )).size,
      distinctControlRootCount: new Set(handles.map(
        (handle) => handle.resources.controlRoot,
      )).size,
      distinctPermissionProfileCount: new Set(handles.map(
        (handle) => handle.resources.permissionProfilePath,
      )).size,
      distinctFinalFileCount: new Set(handles.map(
        (handle) => handle.resources.authoritativeResponsePath,
      )).size,
      baseContextHash: firstPair.baseContextHash,
      vemContextHash: firstPair.treatmentHash,
      retryBaseContextStable: firstPair.baseContextHash === retryPair.baseContextHash,
      retryPromptStable: firstPair.promptHash === retryPair.promptHash,
      retryTreatmentStable: firstPair.treatmentHash === retryPair.treatmentHash,
      onlyDifference: firstPair.onlyDifference,
      processStarted: false,
      modelCall: false,
      priorWritableOutputReused: false,
      priorAttemptStateParticipantVisible: false,
    };
    if (record.distinctCapsuleRootCount !== 4
      || record.distinctControlRootCount !== 4
      || record.distinctPermissionProfileCount !== 4
      || record.distinctFinalFileCount !== 4
      || record.retryBaseContextStable !== true
      || record.retryPromptStable !== true
      || record.retryTreatmentStable !== true
      || record.onlyDifference !== "vem-context.json") {
      throw new Error("R7_T3_ATTEMPT_ISOLATION_FAILED");
    }
    return record;
  } finally {
    for (const handle of handles) {
      containR7UnspawnedAttempt(handle, "R7_T3_LOCAL_PROBE_NOT_SPAWNED");
      cleanupR7Attempt(handle);
    }
  }
}

function proveLocalCapsuleBoundary({
  output,
  task,
  contextPath,
  runProbes,
  permissionProbeRunner,
}) {
  const direct = createParticipantCapsule({
    sourceRoot: join(output, "fixture"),
    taskId: `${task.taskId}-direct-probe`,
    arm: "direct-search",
    responseSchemaPath: join(output, "inputs/response-schema.json"),
  });
  let vem;
  try {
    vem = createParticipantCapsule({
      sourceRoot: join(output, "fixture"),
      taskId: `${task.taskId}-vem-probe`,
      arm: "vem-assisted",
      responseSchemaPath: join(output, "inputs/response-schema.json"),
      vemContextPath: contextPath,
    });
    if (!runProbes) return null;
    return {
      directFilesystem: runFilesystemIsolationProbe(direct),
      directCodexBinary: runCodexBinaryIsolationProbe(direct),
      directPermissionProfile: permissionProbeRunner(
        buildR3PermissionProfileProbeInvocation({ capsule: direct }),
      ),
      vemFilesystem: runFilesystemIsolationProbe(vem),
      vemCodexBinary: runCodexBinaryIsolationProbe(vem),
      vemPermissionProfile: permissionProbeRunner(
        buildR3PermissionProfileProbeInvocation({ capsule: vem }),
      ),
    };
  } finally {
    cleanupParticipantCapsule(direct);
    if (vem !== undefined) cleanupParticipantCapsule(vem);
  }
}

function verifyR6PreregistrationInputs() {
  const root = join(REPO_ROOT, R6_T12_ROOT);
  if (readFileSync(join(root, "PREREGISTRATION.sha256"), "utf8").trim()
      !== R6_T12_PREREGISTRATION_HASH) {
    throw new Error("R7_T3_R6_PREREGISTRATION_CHANGED");
  }
  const manifest = readJson(join(root, "inputs/task-manifest.json"));
  const exclusion = readJson(join(root, "private/prior-task-exclusion.json"));
  const productHoldout = readJson(join(root, "private/product-holdout-exclusion.json"));
  const failurePolicy = readJson(join(root, "inputs/failure-policy-validation.json"));
  const auditNeedles = readJson(join(root, "private/audit-content-needles.json"));
  if (manifest.tasks?.length !== 5
    || productHoldout.consumed !== false
    || failurePolicy.externalExecutionAuthorized !== false
    || auditNeedles.participantVisible !== false) {
    throw new Error("R7_T3_R6_PREREGISTRATION_INVALID");
  }
  return {
    taskIds: [...new Set([
      ...exclusion.taskIds,
      ...manifest.tasks.map((task) => task.taskId),
    ])].sort(),
    promptHashes: [...new Set([
      ...exclusion.promptHashes,
      ...manifest.tasks.map((task) => task.promptHash),
    ])].sort(),
    productHoldout,
    failurePolicy,
    auditNeedles,
  };
}

function verifyR6TerminalStop() {
  const resultsPath = join(REPO_ROOT, R6_T13_ROOT, "RESULTS.sha256");
  const verdictPath = join(REPO_ROOT, R6_T13_ROOT, "results/verdict.json");
  const verdict = readJson(verdictPath);
  if (sha256(readFileSync(resultsPath)) !== R6_T13_RESULTS_FILE_HASH
    || sha256(readFileSync(verdictPath)) !== R6_T13_VERDICT_FILE_HASH
    || verdict.decisionKey !== "R6-RECOVERY"
    || verdict.decisionAttempt !== 4
    || verdict.verdict !== "stop") {
    throw new Error("R7_T3_R6_STOP_CHANGED");
  }
  return Object.freeze({
    taskId: "R6-T13",
    decisionKey: "R6-RECOVERY",
    decisionAttempt: 4,
    decision: "stop",
    resultsFileHash: R6_T13_RESULTS_FILE_HASH,
    verdictFileHash: R6_T13_VERDICT_FILE_HASH,
    overwritten: false,
  });
}

function verifyR7T2Proof() {
  const path = join(REPO_ROOT, R7_T2_PROOF_PATH);
  const raw = readFileSync(path);
  const proof = JSON.parse(raw.toString("utf8"));
  if (sha256(raw) !== R7_T2_PROOF_FILE_HASH
    || canonicalSha256(proof) !== R7_T2_PROOF_HASH
    || proof.taskId !== "R7-T2"
    || proof.result !== "passed"
    || proof.externalExecutionAuthorized !== false
    || proof.modelCallCount !== 0
    || proof.productUnlockCount !== 0
    || proof.exceptionSealing?.topLevelManifestValid !== true
    || proof.rerunBoundary?.sameAuthorizationAlternateRootRejected !== true) {
    throw new Error("R7_T3_R7_T2_PROOF_CHANGED");
  }
  return Object.freeze({
    taskId: "R7-T2",
    publishedCommit: R7_T2_PUBLISHED_COMMIT,
    proofFileHash: R7_T2_PROOF_FILE_HASH,
    proofHash: R7_T2_PROOF_HASH,
    overwritten: false,
  });
}

function verifyTaskInputs(root, manifest, requireProbes) {
  if (manifest.schemaVersion !== "R7-T3-task-manifest-v1"
    || manifest.decisionKey !== "R7-RECOVERY"
    || manifest.decisionAttempt !== 1
    || manifest.supersedesAttempt !== null
    || manifest.tasks?.length !== 5) {
    throw new Error("R7_T3_TASK_MANIFEST_INVALID");
  }
  let armCount = 0;
  for (const task of manifest.tasks) {
    if (!ID.test(task.taskId)
      || canonicalJson([...task.armOrder].sort())
        !== canonicalJson(["direct-search", "vem-assisted"])) {
      throw new Error("R7_T3_TASK_MANIFEST_INVALID");
    }
    armCount += task.armOrder.length;
    const prompt = readRegular(join(root, `participant/tasks/${task.taskId}/prompt.txt`));
    const groundTruth = readJson(join(root, `private/ground-truth/${task.taskId}.json`));
    const context = readJson(join(root, `participant/vem-context/${task.taskId}.json`));
    const proof = readJson(join(root, `capsules/${task.taskId}.json`));
    if (sha256(prompt) !== task.promptHash
      || canonicalSha256(groundTruth) !== task.groundTruthHash
      || canonicalSha256(context) !== task.vemContextHash
      || proof.onlyDifference !== "vem-context.json"
      || proof.retryIsolation?.preparedAttemptCount !== 4
      || proof.retryIsolation?.distinctControlRootCount !== 4
      || proof.retryIsolation?.distinctFinalFileCount !== 4
      || proof.retryIsolation?.processStarted !== false
      || proof.retryIsolation?.modelCall !== false
      || requireProbes && !["direct", "vem"].every((prefix) => (
        proof.probes?.[`${prefix}Filesystem`]?.ok === true
          && proof.probes?.[`${prefix}CodexBinary`]?.ok === true
          && proof.probes?.[`${prefix}PermissionProfile`]?.ok === true
          && proof.probes?.[`${prefix}PermissionProfile`]?.modelCall === false
      ))) {
      throw new Error("R7_T3_TASK_INPUT_INVALID");
    }
  }
  if (armCount !== 10) throw new Error("R7_T3_ARM_COUNT_INVALID");
}

function verifyImmutableR7Inputs(repoRoot) {
  if (sha256(readRegular(resolve(repoRoot, R6_T13_ROOT, "RESULTS.sha256")))
      !== R6_T13_RESULTS_FILE_HASH
    || sha256(readRegular(resolve(repoRoot, R6_T13_ROOT, "results/verdict.json")))
      !== R6_T13_VERDICT_FILE_HASH
    || sha256(readRegular(resolve(repoRoot, R7_T2_PROOF_PATH)))
      !== R7_T2_PROOF_FILE_HASH) {
    throw new Error("R7_T3_IMMUTABLE_INPUT_CHANGED");
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
      if (entry.isSymbolicLink()) throw new Error("R7_T3_UNSAFE_NODE");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        const size = statSync(absolutePath).size;
        if (size > MAX_FILE_BYTES) throw new Error("R7_T3_FILE_LIMIT");
        totalBytes += size;
        files.push({ absolutePath, relativePath });
      } else throw new Error("R7_T3_UNSAFE_NODE");
      if (files.length > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("R7_T3_EVIDENCE_LIMIT");
      }
    }
  };
  visit(root);
  return files;
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
    throw new Error("R7_T3_FILE_INVALID");
  }
  return readFileSync(path);
}

function readJson(path) {
  return JSON.parse(readRegular(path).toString("utf8"));
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
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node scripts/pilot/r7-t3.mjs <output-root>");
  }
  process.stdout.write(`${canonicalJson(prepareR7Preregistration({
    outputRoot: process.argv[2],
  }))}\n`);
}
