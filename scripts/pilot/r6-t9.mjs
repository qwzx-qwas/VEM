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
  buildR6T10Prompt,
  R6_T9_DEADLINE_SELECTION,
  R6_T10_DESTINATION,
  R6_T10_FIXTURE_FILES,
  R6_T10_MODEL,
  R6_T10_RESPONSE_SCHEMA,
  R6_T10_TASKS,
  R6_T10_TERMINATION_POLICY,
  R6_T10_VERDICT_RULE,
} from "./r6-attempt-three-plan.mjs";
import {
  validateR6AttemptThreeDeadlineCandidate,
} from "./r6-dual-transport-horizon.mjs";
import { R6_T10_RUNTIME_SOURCE_PATHS } from "./r6-t10.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T9");
const FIXTURE_FILE = "packages/demo-fixture/src/App.tsx";
const REGISTRY_REVISION = "r6-attempt-three-deadline-registry-v1";
const R6_T6_ROOT =
  "docs/test-evidence/R6-T6/20260730T180734-0800";
const R6_T6_HASH =
  "41ce5ab1a65437defdfcd86c0b4ec4db3e922af8a6c5e5642d44384ea910627e";
const R6_T7_ROOT =
  "docs/test-evidence/R6-T7/20260730T183547-0800";
const R6_T7_RESULT_MANIFEST_HASH =
  "2ba2b0537b4fb312e2e82cdd69a7c87b41d05b7117572c5b58978bd300e8fdd7";
const R6_T7_VERDICT_HASH =
  "1283979be6a67ed5298877f8ab30c0eca087f8a1fcf88d3032364a353d0acf96";
const R6_T8_PROOF_PATH =
  "docs/test-evidence/R6-T8/20260730T191632-0800/proof.json";
const R6_T8_PROOF_HASH =
  "21cb7550bc5380f0f460efbf59672ebf9bbaa28a78bbf8ce2e2053ddf73296be";
const R6_T8_CONTRACT_HASH =
  "35a851a8e80785ca92e57f6e8468b183a217eb31e7ad8d7ec212b3f8f850685e";
const PARTICIPANT_DATA_PATHS = Object.freeze([
  "prompt.txt",
  "packages/demo-fixture/src/App.tsx",
  "packages/demo-fixture/src/fixtures.ts",
  ".pilot/response-schema.json",
  ".pilot/vem-context.json (vem-assisted only)",
]);

export function prepareR6AttemptThreePreregistration({
  outputRoot,
  runProbes = true,
  enforceEvidenceParent = true,
  permissionProbeRunner = runR3PermissionProfileProbe,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)
    || typeof permissionProbeRunner !== "function") {
    throw new Error("R6_T9_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R6_T9_OUTPUT_PARENT_INVALID",
  );
  const prior = verifyPriorPreregistration();
  const attemptTwo = verifyAttemptTwo();
  const r6T8Proof = verifyR6T8Proof();
  const startedAt = process.hrtime.bigint();
  mkdirSync(output, { mode: 0o700 });

  for (const [path, body] of Object.entries(R6_T10_FIXTURE_FILES)) {
    writeText(join(output, "fixture", path), body);
  }
  writeJson(
    join(output, "inputs/response-schema.json"),
    R6_T10_RESPONSE_SCHEMA,
  );
  writeJson(
    join(output, "inputs/termination-policy.json"),
    R6_T10_TERMINATION_POLICY,
  );
  writeJson(
    join(output, "inputs/deadline-compatibility-contract.json"),
    r6T8Proof.compatibilityContract,
  );
  writeJson(
    join(output, "private/verdict-rule.json"),
    R6_T10_VERDICT_RULE,
  );

  const priorAudit = readJson(join(
    REPO_ROOT,
    R6_T6_ROOT,
    "private/audit-content-needles.json",
  ));
  writeJson(join(output, "private/audit-content-needles.json"), {
    schemaVersion: "R6-T9-audit-content-needles-v1",
    participantVisible: false,
    inheritedSemantics: "R3-v3-auditor-via-R6-attempt-two",
    sourceHash: canonicalSha256(priorAudit),
    needles: priorAudit.needles,
  });
  writeJson(join(output, "private/prior-task-exclusion.json"), {
    schemaVersion: "R6-T9-prior-task-exclusion-v1",
    sourcePreregistration: "R6-T6",
    sourcePreregistrationHash: R6_T6_HASH,
    taskIds: prior.taskIds,
    promptHashes: prior.promptHashes,
    consumedAsParticipantTasks: false,
  });
  writeJson(join(output, "private/product-holdout-exclusion.json"), {
    schemaVersion: "R6-T9-product-holdout-exclusion-v1",
    sourceHash: prior.productHoldoutSourceHash,
    taskIds: prior.productHoldoutTaskIds,
    consumed: false,
    remediationTasksAreProductHoldouts: false,
  });
  writeJson(join(output, "private/attempt-two-binding.json"), attemptTwo);

  const source = R6_T10_FIXTURE_FILES[FIXTURE_FILE];
  const transformed = transformIntrinsicJsx({
    code: source,
    filename: join(output, "fixture", FIXTURE_FILE),
    relativeFile: FIXTURE_FILE,
    sourceRegistryRevision: REGISTRY_REVISION,
  });
  writeJson(join(output, "inputs/source-registry.json"), {
    schemaVersion: "R6-T9-source-registry-v1",
    sourceRegistryRevision: REGISTRY_REVISION,
    records: transformed.records,
  });

  const tasks = [];
  const capsuleBindings = [];
  for (const task of R6_T10_TASKS) {
    const line = source.split("\n").findIndex((value) => (
      value.includes(task.marker)
    )) + 1;
    const record = transformed.records.find((value) => (
      value.relativeFile === FIXTURE_FILE
        && value.intrinsicTag === task.tagName
        && value.line === line
    ));
    if (record === undefined) throw new Error("R6_T9_SOURCE_RECORD_MISSING");
    const prompt = `${buildR6T10Prompt(task.description)}\n`;
    const promptHash = sha256(prompt);
    if (prior.taskIds.includes(task.taskId)
      || prior.promptHashes.includes(promptHash)
      || prior.productHoldoutTaskIds.includes(task.taskId)) {
      throw new Error("R6_T9_TASK_BANK_NOT_FRESH");
    }
    writeText(
      join(output, `participant/tasks/${task.taskId}/prompt.txt`),
      prompt,
    );
    const groundTruth = {
      schemaVersion: "R6-T9-ground-truth-v1",
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
      schemaVersion: "R6-T9-vem-context-v1",
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
        schemaVersion: "R6-T9-capsule-proof-v1",
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
      taskClass: "r6-attempt-three-deadline-only-not-product-holdout",
      armOrder: task.armOrder,
      promptHash,
      fixtureHash: canonicalSha256(R6_T10_FIXTURE_FILES),
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
      groundTruthHash: canonicalSha256(groundTruth),
      vemContextHash: canonicalSha256(vemContext),
    });
  }

  const manifest = {
    schemaVersion: "R6-T9-task-manifest-v1",
    decisionKey: "R6-RECOVERY",
    decisionAttempt: 3,
    supersedesAttempt: "R6-T7",
    model: R6_T10_MODEL,
    destination: R6_T10_DESTINATION,
    taskBank: "r6-attempt-three-deadline-only-not-product-holdout",
    contextPolicy: "fresh-process-group-per-attempt",
    promptPolicy: "identical-within-task-pair-and-provider-timeout-retry",
    terminationPolicy: R6_T10_TERMINATION_POLICY,
    tasks,
  };
  writeJson(join(output, "inputs/task-manifest.json"), manifest);
  writeJson(join(output, "inputs/attempt-classification-contract.json"), {
    schemaVersion: "R6-T9-attempt-classification-contract-v1",
    retryable: ["external-transport-timeout-before-response"],
    nonRetryable: [
      "runner-wall-clock-terminated-before-response",
      "integrity-failure",
      "partial-or-completed-response",
      "protocol-or-unknown-failure",
    ],
    providerTurnFailedMustBeObserved: true,
    providerTerminalMayBeSynthesized: false,
  });
  writeJson(join(output, "inputs/failure-evidence-contract.json"), {
    schemaVersion: "R6-T9-failure-evidence-contract-v1",
    perAttemptRawFinalBoundaryTerminationLedgerErrorAndHashes: true,
    processTreeMustBeEmptyBeforeRetryOrNextArm: true,
    laterSuccessMayNotOverwriteFailure: true,
    priorAttemptEvidenceMayNotBeOverwritten: true,
    batchPolicy: R6_T10_VERDICT_RULE.batchPolicy,
  });
  writeJson(join(output, "inputs/runner-contract.json"), {
    schemaVersion: "R6-T9-runner-contract-v1",
    runner: "scripts/pilot/r6-t10.mjs",
    terminalizer: "scripts/pilot/r5-process-terminalizer.mjs",
    classifier: "scripts/pilot/r6-attempt-policy.mjs",
    authoritativeResponse: "codex-output-last-message-runner-owned-file",
    participantWorkspaceWritable: false,
    generatedCommandAuthAccess: "deny",
    generatedCommandNetwork: "disabled",
    deadlineStartsAt: "participant-process-spawn",
    processBoundary: "detached-process-group-tree",
    terminationPolicy: R6_T10_TERMINATION_POLICY,
  });

  const sourceBindings = Object.fromEntries(
    R6_T10_RUNTIME_SOURCE_PATHS.map((path) => [
      path,
      sha256(readFileSync(join(REPO_ROOT, path))),
    ]),
  );
  const instrumentationHash = canonicalSha256(sourceBindings);
  const versionEvidence = {
    schemaVersion: "R6-T9-version-bound-horizon-evidence-v1",
    provenanceKind: R6_T9_DEADLINE_SELECTION.provenanceKind,
    codexVersion: R6_T9_DEADLINE_SELECTION.codexVersion,
    deadlineSelection: R6_T9_DEADLINE_SELECTION,
    r6T8ProofHash: R6_T8_PROOF_HASH,
    deadlineContractHash: R6_T8_CONTRACT_HASH,
    sourceReplayHash: r6T8Proof.compatibilityContract.sourceReplayHash,
    instrumentationHash,
    providerInternalScheduleClaimed: false,
    providerNetworkProbed: false,
    modelCall: false,
  };
  const versionEvidenceHash = canonicalSha256(versionEvidence);
  const deadlineCandidate = {
    schemaVersion: "R6-T9-deadline-candidate-v1",
    codexVersion: R6_T9_DEADLINE_SELECTION.codexVersion,
    dualTransportContractHash: R6_T8_CONTRACT_HASH,
    terminalHorizonProvenance: {
      kind: R6_T9_DEADLINE_SELECTION.provenanceKind,
      evidenceHash: versionEvidenceHash,
      codexVersion: R6_T9_DEADLINE_SELECTION.codexVersion,
    },
    providerTerminalHorizonMs:
      R6_T9_DEADLINE_SELECTION.providerTerminalHorizonMs,
    terminalObservationMarginMs:
      R6_T9_DEADLINE_SELECTION.terminalObservationMarginMs,
    deadlineMs: R6_T9_DEADLINE_SELECTION.deadlineMs,
    clockDomain: r6T8Proof.compatibilityContract.clockDomain,
    deadlineOrigin: r6T8Proof.compatibilityContract.deadlineOrigin,
    terminationPolicy:
      r6T8Proof.compatibilityContract.terminationPolicyPreserved,
    externalExecutionAuthorized: false,
  };
  const deadlineValidation = validateR6AttemptThreeDeadlineCandidate({
    requirements: r6T8Proof.compatibilityContract,
    candidate: deadlineCandidate,
  });
  writeJson(
    join(output, "inputs/version-bound-horizon-evidence.json"),
    versionEvidence,
  );
  writeJson(join(output, "inputs/deadline-candidate.json"), deadlineCandidate);
  writeJson(
    join(output, "inputs/deadline-candidate-validation.json"),
    deadlineValidation,
  );
  writeJson(join(output, "inputs/invocation-environment-contract.json"), {
    schemaVersion: "R6-T9-invocation-environment-contract-v1",
    outerEnvironment: R3_OUTER_PROCESS_ENV,
    outerEnvironmentHash: canonicalSha256(R3_OUTER_PROCESS_ENV),
    inheritedFromHost: false,
    priorCompatibilityPreflight:
      prior.invocationEnvironmentContract.priorCompatibilityPreflight,
  });

  const participantDataPaths = [...PARTICIPANT_DATA_PATHS];
  const dataScopeHash = canonicalSha256({
    destination: R6_T10_DESTINATION,
    model: R6_T10_MODEL,
    participantFiles: participantDataPaths,
    deadlineCandidate,
    terminationPolicy: R6_T10_TERMINATION_POLICY,
    outerEnvironment: R3_OUTER_PROCESS_ENV,
  });
  writeJson(join(output, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "R6-T9-prepare-setup-cost-v1",
    totalPrepareSetupDurationNs:
      (process.hrtime.bigint() - startedAt).toString(),
    excludedFromPerArmDuration: true,
  });
  const plan = {
    schemaVersion: "R6-T9-preregistered-recovery-plan-v1",
    decisionKey: "R6-RECOVERY",
    decisionAttempt: 3,
    supersedesAttempt: "R6-T7",
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
    maxRetriesPerArm: R6_T10_TERMINATION_POLICY.maxRetriesPerArm,
    maxProcessAttempts: R6_T10_TERMINATION_POLICY.maxProcessAttempts,
    model: R6_T10_MODEL,
    destination: R6_T10_DESTINATION,
    participantDataPaths,
    dataScopeHash,
    terminationPolicy: R6_T10_TERMINATION_POLICY,
    terminationPolicyHash: canonicalSha256(R6_T10_TERMINATION_POLICY),
    deadlineContractHash: R6_T8_CONTRACT_HASH,
    deadlineCandidateHash: deadlineValidation.candidateHash,
    versionBoundInstrumentationEvidenceHash: versionEvidenceHash,
    outerEnvironment: R3_OUTER_PROCESS_ENV,
    outerEnvironmentHash: canonicalSha256(R3_OUTER_PROCESS_ENV),
    instrumentationHash,
    sourceBindings,
    preparationSourceHash: sha256(readFileSync(SCRIPT_PATH)),
    taskManifestHash: canonicalSha256(manifest),
    verdictRuleHash: canonicalSha256(R6_T10_VERDICT_RULE),
    capsuleBaseHashes: capsuleBindings,
    attemptTwo,
    r6T8ProofHash: R6_T8_PROOF_HASH,
    priorPreregistration: {
      taskId: "R6-T6",
      preregistrationHash: R6_T6_HASH,
      transitivePriorDecisionChainBound: true,
    },
    groundTruthParticipantVisible: false,
    productHoldoutConsumed: false,
    externalExecutionAuthorized: false,
    productUnlockCount: 0,
    preregistrationHashAlgorithm: "sha256-canonical-file-manifest",
    nextAuthorization:
      "owner-must-bind-attempt-three-full-hash-destination-data-scope-deadline-contract-candidate-outer-environment-signals-and-max-twenty-process-attempts",
    limitations: [
      "ATTEMPT_THREE_DEADLINE_RECOVERY_ENGINEERING_SMOKE",
      "VERSION_BOUND_HORIZON_IS_AN_OBSERVATION_POLICY_NOT_A_PROVIDER_INTERNAL_SCHEDULE_CLAIM",
      "RUNNER_DEADLINE_TERMINATION_IS_NOT_PROVIDER_TURN_FAILED",
      "RUNNER_DEADLINE_TERMINATION_IS_NOT_RETRYABLE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_ATTEMPT_ONE_OR_TWO_OR_PRIOR_DECISION_OVERWRITE",
      "NO_EXTERNAL_MODEL_CALL_IN_R6_T9",
    ],
  };
  writeJson(join(output, "PREREGISTRATION.json"), plan);
  const digest = preregistrationDigest(output);
  writeText(join(output, "PREREGISTRATION.sha256"), `${digest}\n`);
  return Object.freeze({
    ok: true,
    taskId: "R6-T9",
    decisionAttempt: 3,
    taskCount: 5,
    successfulArmCount: 10,
    maxProcessAttempts: R6_T10_TERMINATION_POLICY.maxProcessAttempts,
    localProbeCount: runProbes ? 30 : 0,
    preregistrationHash: digest,
    instrumentationHash,
    dataScopeHash,
    terminationPolicyHash: plan.terminationPolicyHash,
    deadlineContractHash: R6_T8_CONTRACT_HASH,
    deadlineCandidateHash: deadlineValidation.candidateHash,
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
  const root = join(REPO_ROOT, R6_T6_ROOT);
  if (readFileSync(join(root, "PREREGISTRATION.sha256"), "utf8").trim()
      !== R6_T6_HASH) {
    throw new Error("R6_T9_PRIOR_PREREG_CHANGED");
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
    throw new Error("R6_T9_PRIOR_PREREG_INVALID");
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

function verifyAttemptTwo() {
  const manifestPath = join(REPO_ROOT, R6_T7_ROOT, "RESULTS.sha256");
  const verdictPath = join(
    REPO_ROOT,
    R6_T7_ROOT,
    "results/verdict.json",
  );
  const manifestHash = sha256(readFileSync(manifestPath));
  const verdictHash = sha256(readFileSync(verdictPath));
  const verdict = readJson(verdictPath);
  if (manifestHash !== R6_T7_RESULT_MANIFEST_HASH
    || verdictHash !== R6_T7_VERDICT_HASH
    || verdict.schemaVersion !== "R6-T7-verdict-v1"
    || verdict.decisionKey !== "R6-RECOVERY"
    || verdict.decisionAttempt !== 2
    || verdict.supersedesAttempt !== "R6-T4"
    || verdict.verdict !== "adjust") {
    throw new Error("R6_T9_ATTEMPT_TWO_CHANGED");
  }
  return Object.freeze({
    taskId: "R6-T7",
    decisionAttempt: 2,
    supersedesAttempt: "R6-T4",
    decision: "adjust",
    resultManifestHash: manifestHash,
    verdictHash,
    overwritten: false,
  });
}

function verifyR6T8Proof() {
  const path = join(REPO_ROOT, R6_T8_PROOF_PATH);
  const raw = readFileSync(path);
  const proof = JSON.parse(raw.toString("utf8"));
  if (sha256(raw) !== R6_T8_PROOF_HASH
    || proof.taskId !== "R6-T8"
    || proof.outcome !== "passed"
    || proof.attemptOne?.evidenceImmutable !== true
    || proof.attemptTwo?.evidenceImmutable !== true
    || proof.attemptTwo?.taskId !== "R6-T7"
    || proof.attemptTwo?.resultManifestHash !== R6_T7_RESULT_MANIFEST_HASH
    || proof.attemptTwo?.verdictHash !== R6_T7_VERDICT_HASH
    || proof.compatibilityContract?.contractHash !== R6_T8_CONTRACT_HASH
    || proof.compatibilityContract?.boundedEnvelopeAvailable !== true
    || proof.compatibilityContract?.disposition
      !== "continue-to-preregistration-only"
    || proof.compatibilityContract?.exactAttemptThreeDeadlineSelected !== false
    || proof.compatibilityContract?.externalExecutionAuthorized !== false
    || proof.executionBoundary?.externalModelCall !== false
    || proof.preservedSafety?.productUnlockCount !== 0) {
    throw new Error("R6_T9_R6_T8_PROOF_CHANGED");
  }
  return proof;
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R6_T9_UNSAFE_NODE");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(root, absolutePath).replaceAll("\\", "/"),
        });
      } else throw new Error("R6_T9_UNSAFE_NODE");
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
    prepareR6AttemptThreePreregistration({ outputRoot: process.argv[2] }),
  )}\n`);
}
