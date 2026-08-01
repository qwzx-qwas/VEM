import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import { transformIntrinsicJsx } from "../../packages/vite-plugin/dist/index.js";
import {
  assertIntendedCapsuleDifference,
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
  buildR6T13Prompt,
  R6_T13_DESTINATION,
  R6_T13_FIXTURE_FILES,
  R6_T13_MODEL,
  R6_T13_RESPONSE_SCHEMA,
  R6_T13_TASKS,
  R6_T13_TERMINATION_POLICY,
  R6_T13_VERDICT_RULE,
} from "./r6-attempt-four-plan.mjs";
import {
  R6_T12_SELECTED_FAILURE_CLASS,
  validateR6AttemptFourFailureCandidate,
} from "./r6-attempt-four-policy.mjs";
import { R6_T13_RUNTIME_SOURCE_PATHS } from "./r6-t13.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T12");
const FIXTURE_FILE = "packages/demo-fixture/src/App.tsx";
const REGISTRY_REVISION = "r6-attempt-four-network-terminal-registry-v1";
const R6_T9_ROOT =
  "docs/test-evidence/R6-T9/20260730T194005-0800";
const R6_T9_HASH =
  "b3f281d44bbc08ae74b534a9903c935bff17192a9d03df4c01aad637e91d4e52";
const R6_T10_ROOT =
  "docs/test-evidence/R6-T10/20260730T195616-0800";
const R6_T10_RESULT_MANIFEST_HASH =
  "a45f1970978996cdbe8df8b99e7b09fd3fbcf4865f76d8eeb504dcde2bead13b";
const R6_T10_VERDICT_HASH =
  "d1550d8b18c8ab5dd45e25c5a462de044f5605aa5a9eac7a7bfe82e2f1e1db4d";
const R6_T11_PROOF_PATH =
  "docs/test-evidence/R6-T11/20260801T123150-0800/proof.json";
const R6_T11_PROOF_HASH =
  "0c6b2357c745fe66ce8a88e2d49db8f5f8ae51112470ae058dbcbb5432a30dcf";
const R6_T11_CONTRACT_HASH =
  "fa512a787a4d72d75704ebebbd06ab78cd796387483f0e625985fb6d9fbce1d2";
const PARTICIPANT_DATA_PATHS = Object.freeze([
  "prompt.txt",
  "packages/demo-fixture/src/App.tsx",
  "packages/demo-fixture/src/fixtures.ts",
  ".pilot/response-schema.json",
  ".pilot/vem-context.json (vem-assisted only)",
]);

export function prepareR6AttemptFourPreregistration({
  outputRoot,
  runProbes = true,
  enforceEvidenceParent = true,
  permissionProbeRunner = runR3PermissionProfileProbe,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)
    || typeof permissionProbeRunner !== "function") {
    throw new Error("R6_T12_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R6_T12_OUTPUT_PARENT_INVALID",
  );
  const prior = verifyPriorPreregistration();
  const attemptThree = verifyAttemptThree();
  const r6T11Proof = verifyR6T11Proof();
  const startedAt = process.hrtime.bigint();
  mkdirSync(output, { mode: 0o700 });

  for (const [path, body] of Object.entries(R6_T13_FIXTURE_FILES)) {
    writeText(join(output, "fixture", path), body);
  }
  writeJson(
    join(output, "inputs/response-schema.json"),
    R6_T13_RESPONSE_SCHEMA,
  );
  writeJson(
    join(output, "inputs/termination-policy.json"),
    R6_T13_TERMINATION_POLICY,
  );
  writeJson(
    join(output, "inputs/failure-compatibility-contract.json"),
    r6T11Proof.compatibilityContract,
  );
  writeJson(
    join(output, "private/verdict-rule.json"),
    R6_T13_VERDICT_RULE,
  );

  const priorAudit = readJson(join(
    REPO_ROOT,
    R6_T9_ROOT,
    "private/audit-content-needles.json",
  ));
  writeJson(join(output, "private/audit-content-needles.json"), {
    schemaVersion: "R6-T12-audit-content-needles-v1",
    participantVisible: false,
    inheritedSemantics: "R3-v3-auditor-via-R6-attempt-two",
    sourceHash: canonicalSha256(priorAudit),
    needles: priorAudit.needles,
  });
  writeJson(join(output, "private/prior-task-exclusion.json"), {
    schemaVersion: "R6-T12-prior-task-exclusion-v1",
    sourcePreregistration: "R6-T9",
    sourcePreregistrationHash: R6_T9_HASH,
    taskIds: prior.taskIds,
    promptHashes: prior.promptHashes,
    consumedAsParticipantTasks: false,
  });
  writeJson(join(output, "private/product-holdout-exclusion.json"), {
    schemaVersion: "R6-T12-product-holdout-exclusion-v1",
    sourceHash: prior.productHoldoutSourceHash,
    taskIds: prior.productHoldoutTaskIds,
    consumed: false,
    remediationTasksAreProductHoldouts: false,
  });
  writeJson(join(output, "private/attempt-three-binding.json"), attemptThree);

  const source = R6_T13_FIXTURE_FILES[FIXTURE_FILE];
  const transformed = transformIntrinsicJsx({
    code: source,
    filename: join(output, "fixture", FIXTURE_FILE),
    relativeFile: FIXTURE_FILE,
    sourceRegistryRevision: REGISTRY_REVISION,
  });
  writeJson(join(output, "inputs/source-registry.json"), {
    schemaVersion: "R6-T12-source-registry-v1",
    sourceRegistryRevision: REGISTRY_REVISION,
    records: transformed.records,
  });

  const tasks = [];
  const capsuleBindings = [];
  for (const task of R6_T13_TASKS) {
    const line = source.split("\n").findIndex((value) => (
      value.includes(task.marker)
    )) + 1;
    const record = transformed.records.find((value) => (
      value.relativeFile === FIXTURE_FILE
        && value.intrinsicTag === task.tagName
        && value.line === line
    ));
    if (record === undefined) throw new Error("R6_T12_SOURCE_RECORD_MISSING");
    const prompt = `${buildR6T13Prompt(task.description)}\n`;
    const promptHash = sha256(prompt);
    if (prior.taskIds.includes(task.taskId)
      || prior.promptHashes.includes(promptHash)
      || prior.productHoldoutTaskIds.includes(task.taskId)) {
      throw new Error("R6_T12_TASK_BANK_NOT_FRESH");
    }
    writeText(
      join(output, `participant/tasks/${task.taskId}/prompt.txt`),
      prompt,
    );
    const groundTruth = {
      schemaVersion: "R6-T12-ground-truth-v1",
      taskId: task.taskId,
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
    };
    writeJson(
      join(output, `private/ground-truth/${task.taskId}.json`),
      groundTruth,
    );
    const vemContext = {
      schemaVersion: "R6-T12-vem-context-v1",
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
        "ATTEMPT_THREE_TERMINAL_REMEDIATION_ONLY",
        "NO_PRODUCT_HOLDOUT_STATUS",
      ],
    };
    writeJson(
      join(output, `participant/vem-context/${task.taskId}.json`),
      vemContext,
    );

    const direct = createParticipantCapsule({
      sourceRoot: join(output, "fixture"),
      taskId: task.taskId,
      arm: "direct-search",
      responseSchemaPath: join(output, "inputs/response-schema.json"),
    });
    let vem;
    try {
      vem = createParticipantCapsule({
        sourceRoot: join(output, "fixture"),
        taskId: task.taskId,
        arm: "vem-assisted",
        responseSchemaPath: join(output, "inputs/response-schema.json"),
        vemContextPath: join(
          output,
          `participant/vem-context/${task.taskId}.json`,
        ),
      });
      const difference = assertIntendedCapsuleDifference(
        direct.manifest,
        vem.manifest,
      );
      const probes = runProbes ? {
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
      } : null;
      writeJson(join(output, `capsules/${task.taskId}.json`), {
        schemaVersion: "R6-T12-capsule-proof-v1",
        taskId: task.taskId,
        onlyDifference: difference.onlyDifference,
        baseContextHash: difference.baseContextHash,
        vemContextHash: difference.vemContextHash,
        directManifest: direct.manifest,
        vemManifest: vem.manifest,
        probes,
      });
      capsuleBindings.push({
        taskId: task.taskId,
        baseContextHash: difference.baseContextHash,
        vemContextHash: difference.vemContextHash,
      });
    } finally {
      cleanupParticipantCapsule(direct);
      if (vem !== undefined) cleanupParticipantCapsule(vem);
    }
    tasks.push({
      taskId: task.taskId,
      taskClass: "r6-attempt-four-network-terminal-only-not-product-holdout",
      armOrder: task.armOrder,
      promptHash,
      fixtureHash: canonicalSha256(R6_T13_FIXTURE_FILES),
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
      groundTruthHash: canonicalSha256(groundTruth),
      vemContextHash: canonicalSha256(vemContext),
    });
  }

  const manifest = {
    schemaVersion: "R6-T12-task-manifest-v1",
    decisionKey: "R6-RECOVERY",
    decisionAttempt: 4,
    supersedesAttempt: "R6-T10",
    model: R6_T13_MODEL,
    destination: R6_T13_DESTINATION,
    taskBank: "r6-attempt-four-network-terminal-only-not-product-holdout",
    contextPolicy: "fresh-process-group-per-attempt",
    promptPolicy: "identical-within-task-pair-and-provider-timeout-retry",
    terminationPolicy: R6_T13_TERMINATION_POLICY,
    tasks,
  };
  writeJson(join(output, "inputs/task-manifest.json"), manifest);
  writeJson(join(output, "inputs/attempt-classification-contract.json"), {
    schemaVersion: "R6-T12-attempt-classification-contract-v1",
    retryable: [
      "external-transport-timeout-before-response",
      R6_T12_SELECTED_FAILURE_CLASS,
    ],
    nonRetryable: [
      "runner-wall-clock-terminated-before-response",
      "integrity-failure",
      "partial-or-completed-response",
      "protocol-or-unknown-failure-without-selected-evidence-conjunction",
    ],
    providerTurnFailedMustBeObserved: true,
    providerTerminalMayBeSynthesized: false,
  });
  writeJson(join(output, "inputs/failure-evidence-contract.json"), {
    schemaVersion: "R6-T12-failure-evidence-contract-v1",
    perAttemptRawFinalBoundaryTerminationLedgerErrorAndHashes: true,
    processTreeMustBeEmptyBeforeRetryOrNextArm: true,
    laterSuccessMayNotOverwriteFailure: true,
    priorAttemptEvidenceMayNotBeOverwritten: true,
    batchPolicy: R6_T13_VERDICT_RULE.batchPolicy,
  });
  writeJson(join(output, "inputs/runner-contract.json"), {
    schemaVersion: "R6-T12-runner-contract-v1",
    runner: "scripts/pilot/r6-t13.mjs",
    terminalizer: "scripts/pilot/r5-process-terminalizer.mjs",
    classifier: "scripts/pilot/r6-attempt-four-policy.mjs",
    authoritativeResponse: "codex-output-last-message-runner-owned-file",
    participantWorkspaceWritable: false,
    generatedCommandAuthAccess: "deny",
    generatedCommandNetwork: "disabled",
    deadlineStartsAt: "participant-process-spawn",
    processBoundary: "detached-process-group-tree",
    terminationPolicy: R6_T13_TERMINATION_POLICY,
  });

  const sourceBindings = Object.fromEntries(
    R6_T13_RUNTIME_SOURCE_PATHS.map((path) => [
      path,
      sha256(readFileSync(join(REPO_ROOT, path))),
    ]),
  );
  const instrumentationHash = canonicalSha256(sourceBindings);
  const failureCandidate = {
    schemaVersion: "R6-T12-failure-policy-candidate-v1",
    compatibilityContractHash: R6_T11_CONTRACT_HASH,
    selectedClass: R6_T12_SELECTED_FAILURE_CLASS,
    selectedClassIsTimeout: false,
    rootCauseClaimed: false,
    requiredEvidence:
      r6T11Proof.compatibilityContract.futureEligibilityRequiredEvidence,
    retryableClassifications:
      R6_T13_TERMINATION_POLICY.retryableClassifications,
    unknownOrDifferentNonTimeoutTerminalRetryable: false,
    maxRetriesPerArm: R6_T13_TERMINATION_POLICY.maxRetriesPerArm,
    maxProcessAttempts: R6_T13_TERMINATION_POLICY.maxProcessAttempts,
    everyAttemptConsumesBudget: true,
    everyAttemptEvidenceRetained: true,
    attemptThreeClassificationChanged: false,
    externalExecutionAuthorized: false,
  };
  const failureValidation = validateR6AttemptFourFailureCandidate({
    requirements: r6T11Proof.compatibilityContract,
    candidate: failureCandidate,
  });
  writeJson(join(output, "inputs/failure-policy-candidate.json"), failureCandidate);
  writeJson(
    join(output, "inputs/failure-policy-validation.json"),
    failureValidation,
  );
  writeJson(join(output, "inputs/invocation-environment-contract.json"), {
    schemaVersion: "R6-T12-invocation-environment-contract-v1",
    outerEnvironment: R3_OUTER_PROCESS_ENV,
    outerEnvironmentHash: canonicalSha256(R3_OUTER_PROCESS_ENV),
    inheritedFromHost: false,
    priorCompatibilityPreflight:
      prior.invocationEnvironmentContract.priorCompatibilityPreflight,
  });

  const participantDataPaths = [...PARTICIPANT_DATA_PATHS];
  const dataScopeHash = canonicalSha256({
    destination: R6_T13_DESTINATION,
    model: R6_T13_MODEL,
    participantFiles: participantDataPaths,
    failureCandidate,
    terminationPolicy: R6_T13_TERMINATION_POLICY,
    outerEnvironment: R3_OUTER_PROCESS_ENV,
  });
  writeJson(join(output, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "R6-T12-prepare-setup-cost-v1",
    totalPrepareSetupDurationNs:
      (process.hrtime.bigint() - startedAt).toString(),
    excludedFromPerArmDuration: true,
  });
  const plan = {
    schemaVersion: "R6-T12-preregistered-recovery-plan-v1",
    decisionKey: "R6-RECOVERY",
    decisionAttempt: 4,
    supersedesAttempt: "R6-T10",
    doesNotSupersede: "R5-RECOVERY",
    alsoDoesNotSupersede: [
      "R4-RECOVERY",
      "R3-RECOVERY",
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
      "P0-VALUE",
    ],
    taskCount: 5,
    successfulArmCount: 10,
    maxRetriesPerArm: R6_T13_TERMINATION_POLICY.maxRetriesPerArm,
    maxProcessAttempts: R6_T13_TERMINATION_POLICY.maxProcessAttempts,
    model: R6_T13_MODEL,
    destination: R6_T13_DESTINATION,
    participantDataPaths,
    dataScopeHash,
    terminationPolicy: R6_T13_TERMINATION_POLICY,
    terminationPolicyHash: canonicalSha256(R6_T13_TERMINATION_POLICY),
    failureContractHash: R6_T11_CONTRACT_HASH,
    failureCandidateHash: failureValidation.candidateHash,
    failurePolicy: failureValidation,
    outerEnvironment: R3_OUTER_PROCESS_ENV,
    outerEnvironmentHash: canonicalSha256(R3_OUTER_PROCESS_ENV),
    instrumentationHash,
    sourceBindings,
    preparationSourceHash: sha256(readFileSync(SCRIPT_PATH)),
    taskManifestHash: canonicalSha256(manifest),
    verdictRuleHash: canonicalSha256(R6_T13_VERDICT_RULE),
    capsuleBaseHashes: capsuleBindings,
    attemptThree,
    immutableDecisionAttempts: r6T11Proof.immutableDecisionAttempts,
    r6T11ProofHash: R6_T11_PROOF_HASH,
    priorPreregistration: {
      taskId: "R6-T9",
      preregistrationHash: R6_T9_HASH,
      transitivePriorDecisionChainBound: true,
    },
    groundTruthParticipantVisible: false,
    productHoldoutConsumed: false,
    externalExecutionAuthorized: false,
    productUnlockCount: 0,
    preregistrationHashAlgorithm: "sha256-canonical-file-manifest",
    nextAuthorization:
      "owner-must-bind-attempt-four-full-hash-published-commit-destination-model-data-scope-failure-contract-candidate-outer-environment-signals-and-max-twenty-process-attempts",
    limitations: [
      "ATTEMPT_FOUR_NETWORK_TERMINAL_RECOVERY_ENGINEERING_SMOKE",
      "SELECTED_CLASS_REQUIRES_THE_COMPLETE_EVIDENCE_CONJUNCTION",
      "SELECTED_CLASS_DOES_NOT_CLAIM_PROVIDER_ROOT_CAUSE",
      "RUNNER_DEADLINE_TERMINATION_IS_NOT_PROVIDER_TURN_FAILED",
      "RUNNER_DEADLINE_TERMINATION_IS_NOT_RETRYABLE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_ATTEMPT_ONE_TWO_OR_THREE_OR_PRIOR_DECISION_OVERWRITE",
      "NO_EXTERNAL_MODEL_CALL_IN_R6_T12",
    ],
  };
  writeJson(join(output, "PREREGISTRATION.json"), plan);
  const digest = preregistrationDigest(output);
  writeText(join(output, "PREREGISTRATION.sha256"), `${digest}\n`);
  return Object.freeze({
    ok: true,
    taskId: "R6-T12",
    decisionAttempt: 4,
    taskCount: 5,
    successfulArmCount: 10,
    maxProcessAttempts: R6_T13_TERMINATION_POLICY.maxProcessAttempts,
    localProbeCount: runProbes ? 30 : 0,
    preregistrationHash: digest,
    instrumentationHash,
    dataScopeHash,
    terminationPolicyHash: plan.terminationPolicyHash,
    failureContractHash: R6_T11_CONTRACT_HASH,
    failureCandidateHash: failureValidation.candidateHash,
    outerEnvironmentHash: plan.outerEnvironmentHash,
    externalExecutionAuthorized: false,
    externalModelCallCount: 0,
    outputRoot: output,
  });
}

export function preregistrationDigest(root) {
  const files = collectFiles(root).filter((file) => (
    file.relativePath !== "PREREGISTRATION.sha256"
  ));
  return sha256(canonicalJson(files.map((file) => ({
    path: file.relativePath,
    sha256: sha256(readFileSync(file.absolutePath)),
  }))));
}

function verifyPriorPreregistration() {
  const root = join(REPO_ROOT, R6_T9_ROOT);
  if (readFileSync(join(root, "PREREGISTRATION.sha256"), "utf8").trim()
      !== R6_T9_HASH) {
    throw new Error("R6_T12_PRIOR_PREREG_CHANGED");
  }
  const priorPlan = readJson(join(root, "PREREGISTRATION.json"));
  const manifest = readJson(join(root, "inputs/task-manifest.json"));
  const exclusion = readJson(join(
    root,
    "private/prior-task-exclusion.json",
  ));
  const holdout = readJson(join(
    root,
    "private/product-holdout-exclusion.json",
  ));
  const invocationEnvironmentContract = readJson(join(
    root,
    "inputs/invocation-environment-contract.json",
  ));
  if (priorPlan.externalExecutionAuthorized !== false
    || manifest.tasks?.length !== 5
    || exclusion.consumedAsParticipantTasks !== false
    || holdout.consumed !== false
    || invocationEnvironmentContract.inheritedFromHost !== false
    || invocationEnvironmentContract.priorCompatibilityPreflight
      ?.predicatePassed !== true
    || invocationEnvironmentContract.priorCompatibilityPreflight
      ?.modelCall !== false
    || invocationEnvironmentContract.priorCompatibilityPreflight
      ?.providerNetworkProbed !== false) {
    throw new Error("R6_T12_PRIOR_PREREG_INVALID");
  }
  return {
    priorPlan,
    invocationEnvironmentContract,
    taskIds: [...new Set([
      ...exclusion.taskIds,
      ...manifest.tasks.map((task) => task.taskId),
    ])].sort(),
    promptHashes: [...new Set([
      ...exclusion.promptHashes,
      ...manifest.tasks.map((task) => task.promptHash),
    ])].sort(),
    productHoldoutSourceHash: holdout.sourceHash,
    productHoldoutTaskIds: holdout.taskIds,
  };
}

function verifyAttemptThree() {
  const manifestPath = join(REPO_ROOT, R6_T10_ROOT, "RESULTS.sha256");
  const verdictPath = join(
    REPO_ROOT,
    R6_T10_ROOT,
    "results/verdict.json",
  );
  const manifestHash = sha256(readFileSync(manifestPath));
  const verdictHash = sha256(readFileSync(verdictPath));
  const verdict = readJson(verdictPath);
  if (manifestHash !== R6_T10_RESULT_MANIFEST_HASH
    || verdictHash !== R6_T10_VERDICT_HASH
    || verdict.schemaVersion !== "R6-T10-verdict-v1"
    || verdict.decisionKey !== "R6-RECOVERY"
    || verdict.decisionAttempt !== 3
    || verdict.supersedesAttempt !== "R6-T7"
    || verdict.verdict !== "adjust") {
    throw new Error("R6_T12_ATTEMPT_THREE_CHANGED");
  }
  return Object.freeze({
    taskId: "R6-T10",
    decisionAttempt: 3,
    supersedesAttempt: "R6-T7",
    decision: "adjust",
    resultManifestHash: manifestHash,
    verdictHash,
    overwritten: false,
  });
}

function verifyR6T11Proof() {
  const path = join(REPO_ROOT, R6_T11_PROOF_PATH);
  const raw = readFileSync(path);
  const proof = JSON.parse(raw.toString("utf8"));
  if (sha256(raw) !== R6_T11_PROOF_HASH
    || proof.taskId !== "R6-T11"
    || proof.outcome !== "passed"
    || !Array.isArray(proof.immutableDecisionAttempts)
    || proof.immutableDecisionAttempts.length !== 3
    || canonicalJson(proof.immutableDecisionAttempts.map((attempt) => ({
      taskId: attempt.taskId,
      decisionAttempt: attempt.decisionAttempt,
      verdict: attempt.verdict,
      evidenceImmutable: attempt.evidenceImmutable,
    }))) !== canonicalJson([
      { taskId: "R6-T4", decisionAttempt: 1, verdict: "adjust", evidenceImmutable: true },
      { taskId: "R6-T7", decisionAttempt: 2, verdict: "adjust", evidenceImmutable: true },
      { taskId: "R6-T10", decisionAttempt: 3, verdict: "adjust", evidenceImmutable: true },
    ])
    || proof.immutableDecisionAttempts[2].manifestHash
      !== R6_T10_RESULT_MANIFEST_HASH
    || proof.compatibilityContract?.contractHash !== R6_T11_CONTRACT_HASH
    || proof.compatibilityContract?.boundedRemediationAvailable !== true
    || proof.compatibilityContract?.disposition
      !== "continue-to-preregistration-only"
    || proof.compatibilityContract?.exactAttemptFourPolicySelected !== false
    || proof.compatibilityContract?.externalExecutionAuthorized !== false
    || proof.executionBoundary?.externalModelCall !== false
    || proof.nextStage?.taskId !== "R6-T12"
    || proof.nextStage?.externalExecutionAuthorized !== false) {
    throw new Error("R6_T12_R6_T11_PROOF_CHANGED");
  }
  return proof;
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R6_T12_UNSAFE_NODE");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(root, absolutePath).replaceAll("\\", "/"),
        });
      } else throw new Error("R6_T12_UNSAFE_NODE");
    }
  };
  visit(root);
  return files;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireDirectory(path, code) {
  const output = resolve(path);
  if (!existsSync(output)
    || !lstatSync(output).isDirectory()
    || lstatSync(output).isSymbolicLink()) throw new Error(code);
  return output;
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
    throw new Error("USAGE: node scripts/pilot/r6-t9.mjs <output-root>");
  }
  process.stdout.write(`${canonicalJson(
    prepareR6AttemptFourPreregistration({ outputRoot: process.argv[2] }),
  )}\n`);
}
