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
  buildR6T7Prompt,
  R6_T6_DEADLINE_SELECTION,
  R6_T7_DESTINATION,
  R6_T7_FIXTURE_FILES,
  R6_T7_MODEL,
  R6_T7_RESPONSE_SCHEMA,
  R6_T7_TASKS,
  R6_T7_TERMINATION_POLICY,
  R6_T7_VERDICT_RULE,
} from "./r6-attempt-two-plan.mjs";
import {
  validateR6AttemptTwoDeadlineCandidate,
} from "./r6-deadline-horizon.mjs";
import { R6_T7_RUNTIME_SOURCE_PATHS } from "./r6-t7.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T6");
const FIXTURE_FILE = "packages/demo-fixture/src/App.tsx";
const REGISTRY_REVISION = "r6-attempt-two-deadline-registry-v1";
const R6_T3_ROOT =
  "docs/test-evidence/R6-T3/20260730T165800-0800";
const R6_T3_HASH =
  "935c7b8c8880d6439238096b99c3ada3338a7c4c94fec192a7d4c8806f9610c9";
const R6_T4_ROOT =
  "docs/test-evidence/R6-T4/20260730T171100-0800";
const R6_T4_RESULT_MANIFEST_HASH =
  "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8";
const R6_T4_VERDICT_HASH =
  "acf6fab787681e5ab7bb9213a9553ed950e4809ad167e1dad82f3ca6a7aa6902";
const R6_T5_PROOF_PATH =
  "docs/test-evidence/R6-T5/20260730T174418-0800/proof.json";
const R6_T5_PROOF_HASH =
  "82585caca431e25e6bc0f8a7737cdab4a437ecd5cf8ebbb88eb6158c5c719fcb";
const R6_T5_CONTRACT_HASH =
  "6145537843ed5c35297196ec0dee74f618f0dd17bc9d89dcfa7bab87a07db4c2";
const PARTICIPANT_DATA_PATHS = Object.freeze([
  "prompt.txt",
  "packages/demo-fixture/src/App.tsx",
  "packages/demo-fixture/src/fixtures.ts",
  ".pilot/response-schema.json",
  ".pilot/vem-context.json (vem-assisted only)",
]);

export function prepareR6AttemptTwoPreregistration({
  outputRoot,
  runProbes = true,
  enforceEvidenceParent = true,
  permissionProbeRunner = runR3PermissionProfileProbe,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)
    || typeof permissionProbeRunner !== "function") {
    throw new Error("R6_T6_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R6_T6_OUTPUT_PARENT_INVALID",
  );
  const prior = verifyPriorPreregistration();
  const attemptOne = verifyAttemptOne();
  const r6T5Proof = verifyR6T5Proof();
  const startedAt = process.hrtime.bigint();
  mkdirSync(output, { mode: 0o700 });

  for (const [path, body] of Object.entries(R6_T7_FIXTURE_FILES)) {
    writeText(join(output, "fixture", path), body);
  }
  writeJson(
    join(output, "inputs/response-schema.json"),
    R6_T7_RESPONSE_SCHEMA,
  );
  writeJson(
    join(output, "inputs/termination-policy.json"),
    R6_T7_TERMINATION_POLICY,
  );
  writeJson(
    join(output, "inputs/deadline-compatibility-contract.json"),
    r6T5Proof.compatibilityContract,
  );
  writeJson(
    join(output, "private/verdict-rule.json"),
    R6_T7_VERDICT_RULE,
  );

  const priorAudit = readJson(join(
    REPO_ROOT,
    R6_T3_ROOT,
    "private/audit-content-needles.json",
  ));
  writeJson(join(output, "private/audit-content-needles.json"), {
    schemaVersion: "R6-T6-audit-content-needles-v1",
    participantVisible: false,
    inheritedSemantics: "R3-v3-auditor-via-R6-attempt-one",
    sourceHash: canonicalSha256(priorAudit),
    needles: priorAudit.needles,
  });
  writeJson(join(output, "private/prior-task-exclusion.json"), {
    schemaVersion: "R6-T6-prior-task-exclusion-v1",
    sourcePreregistration: "R6-T3",
    sourcePreregistrationHash: R6_T3_HASH,
    taskIds: prior.taskIds,
    promptHashes: prior.promptHashes,
    consumedAsParticipantTasks: false,
  });
  writeJson(join(output, "private/product-holdout-exclusion.json"), {
    schemaVersion: "R6-T6-product-holdout-exclusion-v1",
    sourceHash: prior.productHoldoutSourceHash,
    taskIds: prior.productHoldoutTaskIds,
    consumed: false,
    remediationTasksAreProductHoldouts: false,
  });
  writeJson(join(output, "private/attempt-one-binding.json"), attemptOne);

  const source = R6_T7_FIXTURE_FILES[FIXTURE_FILE];
  const transformed = transformIntrinsicJsx({
    code: source,
    filename: join(output, "fixture", FIXTURE_FILE),
    relativeFile: FIXTURE_FILE,
    sourceRegistryRevision: REGISTRY_REVISION,
  });
  writeJson(join(output, "inputs/source-registry.json"), {
    schemaVersion: "R6-T6-source-registry-v1",
    sourceRegistryRevision: REGISTRY_REVISION,
    records: transformed.records,
  });

  const tasks = [];
  const capsuleBindings = [];
  for (const task of R6_T7_TASKS) {
    const line = source.split("\n").findIndex((value) => (
      value.includes(task.marker)
    )) + 1;
    const record = transformed.records.find((value) => (
      value.relativeFile === FIXTURE_FILE
        && value.intrinsicTag === task.tagName
        && value.line === line
    ));
    if (record === undefined) throw new Error("R6_T6_SOURCE_RECORD_MISSING");
    const prompt = `${buildR6T7Prompt(task.description)}\n`;
    const promptHash = sha256(prompt);
    if (prior.taskIds.includes(task.taskId)
      || prior.promptHashes.includes(promptHash)
      || prior.productHoldoutTaskIds.includes(task.taskId)) {
      throw new Error("R6_T6_TASK_BANK_NOT_FRESH");
    }
    writeText(
      join(output, `participant/tasks/${task.taskId}/prompt.txt`),
      prompt,
    );
    const groundTruth = {
      schemaVersion: "R6-T6-ground-truth-v1",
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
      schemaVersion: "R6-T6-vem-context-v1",
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
        "ATTEMPT_TWO_DEADLINE_REMEDIATION_ONLY",
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
        schemaVersion: "R6-T6-capsule-proof-v1",
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
      taskClass: "r6-attempt-two-deadline-only-not-product-holdout",
      armOrder: task.armOrder,
      promptHash,
      fixtureHash: canonicalSha256(R6_T7_FIXTURE_FILES),
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
      groundTruthHash: canonicalSha256(groundTruth),
      vemContextHash: canonicalSha256(vemContext),
    });
  }

  const manifest = {
    schemaVersion: "R6-T6-task-manifest-v1",
    decisionKey: "R6-RECOVERY",
    decisionAttempt: 2,
    supersedesAttempt: "R6-T4",
    model: R6_T7_MODEL,
    destination: R6_T7_DESTINATION,
    taskBank: "r6-attempt-two-deadline-only-not-product-holdout",
    contextPolicy: "fresh-process-group-per-attempt",
    promptPolicy: "identical-within-task-pair-and-provider-timeout-retry",
    terminationPolicy: R6_T7_TERMINATION_POLICY,
    tasks,
  };
  writeJson(join(output, "inputs/task-manifest.json"), manifest);
  writeJson(join(output, "inputs/attempt-classification-contract.json"), {
    schemaVersion: "R6-T6-attempt-classification-contract-v1",
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
    schemaVersion: "R6-T6-failure-evidence-contract-v1",
    perAttemptRawFinalBoundaryTerminationLedgerErrorAndHashes: true,
    processTreeMustBeEmptyBeforeRetryOrNextArm: true,
    laterSuccessMayNotOverwriteFailure: true,
    attemptOneEvidenceMayNotBeOverwritten: true,
    batchPolicy: R6_T7_VERDICT_RULE.batchPolicy,
  });
  writeJson(join(output, "inputs/runner-contract.json"), {
    schemaVersion: "R6-T6-runner-contract-v1",
    runner: "scripts/pilot/r6-t7.mjs",
    terminalizer: "scripts/pilot/r5-process-terminalizer.mjs",
    classifier: "scripts/pilot/r6-attempt-policy.mjs",
    authoritativeResponse: "codex-output-last-message-runner-owned-file",
    participantWorkspaceWritable: false,
    generatedCommandAuthAccess: "deny",
    generatedCommandNetwork: "disabled",
    deadlineStartsAt: "participant-process-spawn",
    processBoundary: "detached-process-group-tree",
    terminationPolicy: R6_T7_TERMINATION_POLICY,
  });

  const sourceBindings = Object.fromEntries(
    R6_T7_RUNTIME_SOURCE_PATHS.map((path) => [
      path,
      sha256(readFileSync(join(REPO_ROOT, path))),
    ]),
  );
  const instrumentationHash = canonicalSha256(sourceBindings);
  const versionEvidence = {
    schemaVersion: "R6-T6-version-bound-horizon-evidence-v1",
    provenanceKind: R6_T6_DEADLINE_SELECTION.provenanceKind,
    codexVersion: R6_T6_DEADLINE_SELECTION.codexVersion,
    deadlineSelection: R6_T6_DEADLINE_SELECTION,
    r6T5ProofHash: R6_T5_PROOF_HASH,
    deadlineContractHash: R6_T5_CONTRACT_HASH,
    sourceReplayHash: r6T5Proof.compatibilityContract.sourceReplayHash,
    instrumentationHash,
    providerInternalScheduleClaimed: false,
    providerNetworkProbed: false,
    modelCall: false,
  };
  const versionEvidenceHash = canonicalSha256(versionEvidence);
  const deadlineCandidate = {
    schemaVersion: "R6-T6-deadline-candidate-v1",
    codexVersion: R6_T6_DEADLINE_SELECTION.codexVersion,
    retryHorizonProvenance: {
      kind: R6_T6_DEADLINE_SELECTION.provenanceKind,
      evidenceHash: versionEvidenceHash,
      codexVersion: R6_T6_DEADLINE_SELECTION.codexVersion,
    },
    providerRetryHorizonMs:
      R6_T6_DEADLINE_SELECTION.providerRetryHorizonMs,
    terminalObservationMarginMs:
      R6_T6_DEADLINE_SELECTION.terminalObservationMarginMs,
    deadlineMs: R6_T6_DEADLINE_SELECTION.deadlineMs,
    clockDomain: r6T5Proof.compatibilityContract.clockDomain,
    deadlineOrigin: r6T5Proof.compatibilityContract.deadlineOrigin,
    terminationPolicy:
      r6T5Proof.compatibilityContract.terminationPolicyPreserved,
    externalExecutionAuthorized: false,
  };
  const deadlineValidation = validateR6AttemptTwoDeadlineCandidate({
    requirements: r6T5Proof.compatibilityContract,
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
    schemaVersion: "R6-T6-invocation-environment-contract-v1",
    outerEnvironment: R3_OUTER_PROCESS_ENV,
    outerEnvironmentHash: canonicalSha256(R3_OUTER_PROCESS_ENV),
    inheritedFromHost: false,
    priorCompatibilityPreflight:
      prior.priorPlan.compatibilityPreflight,
  });

  const participantDataPaths = [...PARTICIPANT_DATA_PATHS];
  const dataScopeHash = canonicalSha256({
    destination: R6_T7_DESTINATION,
    model: R6_T7_MODEL,
    participantFiles: participantDataPaths,
    deadlineCandidate,
    terminationPolicy: R6_T7_TERMINATION_POLICY,
    outerEnvironment: R3_OUTER_PROCESS_ENV,
  });
  writeJson(join(output, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "R6-T6-prepare-setup-cost-v1",
    totalPrepareSetupDurationNs:
      (process.hrtime.bigint() - startedAt).toString(),
    excludedFromPerArmDuration: true,
  });
  const plan = {
    schemaVersion: "R6-T6-preregistered-recovery-plan-v1",
    decisionKey: "R6-RECOVERY",
    decisionAttempt: 2,
    supersedesAttempt: "R6-T4",
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
    maxRetriesPerArm: R6_T7_TERMINATION_POLICY.maxRetriesPerArm,
    maxProcessAttempts: R6_T7_TERMINATION_POLICY.maxProcessAttempts,
    model: R6_T7_MODEL,
    destination: R6_T7_DESTINATION,
    participantDataPaths,
    dataScopeHash,
    terminationPolicy: R6_T7_TERMINATION_POLICY,
    terminationPolicyHash: canonicalSha256(R6_T7_TERMINATION_POLICY),
    deadlineContractHash: R6_T5_CONTRACT_HASH,
    deadlineCandidateHash: deadlineValidation.candidateHash,
    versionBoundInstrumentationEvidenceHash: versionEvidenceHash,
    outerEnvironment: R3_OUTER_PROCESS_ENV,
    outerEnvironmentHash: canonicalSha256(R3_OUTER_PROCESS_ENV),
    instrumentationHash,
    sourceBindings,
    preparationSourceHash: sha256(readFileSync(SCRIPT_PATH)),
    taskManifestHash: canonicalSha256(manifest),
    verdictRuleHash: canonicalSha256(R6_T7_VERDICT_RULE),
    capsuleBaseHashes: capsuleBindings,
    attemptOne,
    r6T5ProofHash: R6_T5_PROOF_HASH,
    priorPreregistration: {
      taskId: "R6-T3",
      preregistrationHash: R6_T3_HASH,
      transitivePriorDecisionChainBound: true,
    },
    groundTruthParticipantVisible: false,
    productHoldoutConsumed: false,
    externalExecutionAuthorized: false,
    productUnlockCount: 0,
    preregistrationHashAlgorithm: "sha256-canonical-file-manifest",
    nextAuthorization:
      "owner-must-bind-attempt-two-full-hash-destination-data-scope-deadline-contract-candidate-outer-environment-signals-and-max-twenty-process-attempts",
    limitations: [
      "ATTEMPT_TWO_DEADLINE_RECOVERY_ENGINEERING_SMOKE",
      "VERSION_BOUND_HORIZON_IS_AN_OBSERVATION_POLICY_NOT_A_PROVIDER_INTERNAL_SCHEDULE_CLAIM",
      "RUNNER_DEADLINE_TERMINATION_IS_NOT_PROVIDER_TURN_FAILED",
      "RUNNER_DEADLINE_TERMINATION_IS_NOT_RETRYABLE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_ATTEMPT_ONE_OR_PRIOR_DECISION_OVERWRITE",
      "NO_EXTERNAL_MODEL_CALL_IN_R6_T6",
    ],
  };
  writeJson(join(output, "PREREGISTRATION.json"), plan);
  const digest = preregistrationDigest(output);
  writeText(join(output, "PREREGISTRATION.sha256"), `${digest}\n`);
  return Object.freeze({
    ok: true,
    taskId: "R6-T6",
    decisionAttempt: 2,
    taskCount: 5,
    successfulArmCount: 10,
    maxProcessAttempts: R6_T7_TERMINATION_POLICY.maxProcessAttempts,
    localProbeCount: runProbes ? 30 : 0,
    preregistrationHash: digest,
    instrumentationHash,
    dataScopeHash,
    terminationPolicyHash: plan.terminationPolicyHash,
    deadlineContractHash: R6_T5_CONTRACT_HASH,
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
  const root = join(REPO_ROOT, R6_T3_ROOT);
  if (readFileSync(join(root, "PREREGISTRATION.sha256"), "utf8").trim()
      !== R6_T3_HASH) {
    throw new Error("R6_T6_PRIOR_PREREG_CHANGED");
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
  if (priorPlan.externalExecutionAuthorized !== false
    || manifest.tasks?.length !== 5
    || exclusion.consumedAsParticipantTasks !== false
    || holdout.consumed !== false) {
    throw new Error("R6_T6_PRIOR_PREREG_INVALID");
  }
  return {
    priorPlan,
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

function verifyAttemptOne() {
  const manifestPath = join(REPO_ROOT, R6_T4_ROOT, "RESULTS.sha256");
  const verdictPath = join(
    REPO_ROOT,
    R6_T4_ROOT,
    "results/verdict.json",
  );
  const manifestHash = sha256(readFileSync(manifestPath));
  const verdictHash = sha256(readFileSync(verdictPath));
  const verdict = readJson(verdictPath);
  if (manifestHash !== R6_T4_RESULT_MANIFEST_HASH
    || verdictHash !== R6_T4_VERDICT_HASH
    || verdict.schemaVersion !== "R6-T4-verdict-v1"
    || verdict.decisionKey !== "R6-RECOVERY"
    || verdict.decisionAttempt !== 1
    || verdict.verdict !== "adjust") {
    throw new Error("R6_T6_ATTEMPT_ONE_CHANGED");
  }
  return Object.freeze({
    taskId: "R6-T4",
    decisionAttempt: 1,
    decision: "adjust",
    resultManifestHash: manifestHash,
    verdictHash,
    overwritten: false,
  });
}

function verifyR6T5Proof() {
  const path = join(REPO_ROOT, R6_T5_PROOF_PATH);
  const raw = readFileSync(path);
  const proof = JSON.parse(raw.toString("utf8"));
  if (sha256(raw) !== R6_T5_PROOF_HASH
    || proof.taskId !== "R6-T5"
    || proof.outcome !== "passed"
    || proof.attemptOne?.evidenceImmutable !== true
    || proof.compatibilityContract?.contractHash !== R6_T5_CONTRACT_HASH
    || proof.compatibilityContract?.exactAttemptTwoDeadlineSelected !== false
    || proof.executionBoundary?.externalModelCall !== false
    || proof.preservedSafety?.productUnlockCount !== 0) {
    throw new Error("R6_T6_R6_T5_PROOF_CHANGED");
  }
  return proof;
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R6_T6_UNSAFE_NODE");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(root, absolutePath).replaceAll("\\", "/"),
        });
      } else throw new Error("R6_T6_UNSAFE_NODE");
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
    throw new Error("USAGE: node scripts/pilot/r6-t6.mjs <output-root>");
  }
  process.stdout.write(`${canonicalJson(
    prepareR6AttemptTwoPreregistration({ outputRoot: process.argv[2] }),
  )}\n`);
}
