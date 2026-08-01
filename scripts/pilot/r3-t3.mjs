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
  R3_PERMISSION_PROFILE_NAME,
  runR3PermissionProfileProbe,
} from "./r3-capsule.mjs";
import {
  buildR3Prompt,
  R3_FIXTURE_FILES,
  R3_MODEL,
  R3_RESPONSE_SCHEMA,
  R3_TASKS,
  R3_VERDICT_RULE,
} from "./r3-recovery-plan.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R3-T3");
const P0_ATTEMPT_ONE_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17B/20260729T171610+0800",
);
const P0_ATTEMPT_TWO_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17D/20260729T174733+0800",
);
const R0_PREREGISTRATION_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R0-T3/20260729T193158+0800",
);
const R1_PREREGISTRATION_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R1-T3/20260729T203631+0800",
);
const R2_PREREGISTRATION_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R2-T3/20260729T225128+0800",
);
const FIXTURE_RELATIVE_FILE = "packages/demo-fixture/src/App.tsx";
const REGISTRY_REVISION = "r3-capsule-audit-containment-registry-v1";
const R2_INSTRUMENTATION_HASH =
  "09e237ddec722207ee3b2e22c714ca5631700ff7393877a66fdd75d04c46b8a0";
const PRIOR_PREREGISTRATION_HASHES = Object.freeze({
  p0AttemptOne: "2bf456e2220cf61fb78c97c1854d6575847d783b66404ba3db3746380573b1bb",
  p0AttemptTwo: "df5859bc0af40b0daca4f2ea8b6030e8d2b950228595595a29aba8976fc70d93",
  r0: "57fb4b9b033e61eb4e0b4b9a0f14ced28064b6fb17d73f5e7ae60552d0f37359",
  r1: "8d93104c915fdb0acce9f31bdf7c34bbc4d19f0ac74e1b2609a10ddce35ca7f1",
  r2: "dddd48ade2a92b2e12ec7600c9cdc0bd65eee6d47023d01d70b8bd71b47c273a",
});
const TERMINAL_VERDICT_HASHES = Object.freeze({
  p0: "38d1dd20b591baadaed2ba4b2ebd93723706387133e366370e62c7f431ee336a",
  r0: "5815559a6d2b8d9c71246067a4befefe97f375edb476ffd479ee56c07978e38b",
  r1: "a0a9556a63d68fcbe769da96f140e54d1d966421d0c3bad1cbffca1f24ab9baa",
  r2: "ada1fb7e4c4ae202060a5e98e00dafedecfd4862803c61bab1970d7e30d681e1",
});
export const R3_PREREGISTERED_RUNTIME_SOURCE_PATHS = Object.freeze([
  "scripts/pilot/r3-t4.mjs",
  "scripts/pilot/r2-run-recorder.mjs",
  "scripts/pilot/r2-capsule.mjs",
  "scripts/pilot/r3-capsule.mjs",
  "scripts/pilot/r3-run-finalizer.mjs",
  "scripts/pilot/r3-recovery-plan.mjs",
  "scripts/pilot/capsule.mjs",
  "scripts/pilot/capsule-audit-v3.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);
const FORBIDDEN_CONTENT_SOURCES = Object.freeze([
  "AGENTS.md",
  ".agents/skills/visual-ui-edit/SKILL.md",
]);

export function prepareR3RecoveryPreregistration({
  outputRoot,
  runProbes = true,
  enforceEvidenceParent = true,
  permissionProbeRunner = runR3PermissionProfileProbe,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)
    || typeof permissionProbeRunner !== "function") {
    throw new Error("R3_T3_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R3_T3_OUTPUT_PARENT_INVALID",
  );
  verifyPriorPreregistrationInputs();
  verifyR2InstrumentationBinding();
  const terminalInputs = verifyImmutableTerminalInputs();
  const startedAt = process.hrtime.bigint();
  mkdirSync(output, { mode: 0o700 });
  for (const [path, body] of Object.entries(R3_FIXTURE_FILES)) {
    writeText(join(output, "fixture", path), body);
  }
  writeJson(join(output, "inputs/response-schema.json"), R3_RESPONSE_SCHEMA);
  writeJson(join(output, "private/verdict-rule.json"), R3_VERDICT_RULE);

  const forbiddenContent = buildForbiddenContentNeedles();
  writeJson(join(output, "private/audit-content-needles.json"), {
    schemaVersion: "R3-T3-audit-content-needles-v1",
    participantVisible: false,
    sourceHashes: forbiddenContent.sourceHashes,
    needles: forbiddenContent.needles,
  });
  const source = R3_FIXTURE_FILES[FIXTURE_RELATIVE_FILE];
  const transformed = transformIntrinsicJsx({
    code: source,
    filename: join(output, "fixture", FIXTURE_RELATIVE_FILE),
    relativeFile: FIXTURE_RELATIVE_FILE,
    sourceRegistryRevision: REGISTRY_REVISION,
  });
  writeJson(join(output, "inputs/source-registry.json"), {
    schemaVersion: "R3-T3-source-registry-v1",
    sourceRegistryRevision: REGISTRY_REVISION,
    records: transformed.records,
  });

  const priorTaskInputs = collectPriorTaskInputs();
  writeJson(join(output, "private/prior-task-exclusion.json"), {
    schemaVersion: "R3-T3-prior-task-exclusion-v1",
    sourceAttempts: ["P0-T17B", "P0-T17D", "R0-T3", "R1-T3", "R2-T3"],
    taskIds: priorTaskInputs.taskIds,
    promptHashes: priorTaskInputs.promptHashes,
    consumedAsParticipantTasks: false,
  });
  const productHoldout = readJson(
    join(P0_ATTEMPT_TWO_ROOT, "private/later-holdout-exclusion.json"),
  );
  const productHoldoutSourceHash = sha256(readFileSync(
    join(P0_ATTEMPT_TWO_ROOT, "private/later-holdout-exclusion.json"),
  ));
  writeJson(join(output, "private/product-holdout-exclusion.json"), {
    schemaVersion: "R3-T3-product-holdout-exclusion-v1",
    sourceAttempt: "P0-T17D",
    sourceHash: productHoldoutSourceHash,
    taskIds: productHoldout.taskIds,
    consumed: false,
    remediationTasksAreProductHoldouts: false,
  });

  const manifestTasks = [];
  const capsuleProofs = [];
  for (const task of R3_TASKS) {
    const line = source.split("\n").findIndex(
      (sourceLine) => sourceLine.includes(task.marker),
    ) + 1;
    const record = transformed.records.find((candidate) => (
      candidate.relativeFile === FIXTURE_RELATIVE_FILE
        && candidate.intrinsicTag === task.tagName
        && candidate.line === line
    ));
    if (line < 1 || record === undefined) {
      throw new Error("R3_T3_SOURCE_RECORD_MISSING");
    }
    const prompt = `${buildR3Prompt(task.description)}\n`;
    const promptHash = sha256(prompt);
    if (priorTaskInputs.taskIds.includes(task.taskId)
      || priorTaskInputs.promptHashes.includes(promptHash)
      || productHoldout.taskIds.includes(task.taskId)) {
      throw new Error("R3_T3_TASK_BANK_NOT_FRESH");
    }
    writeText(join(output, `participant/tasks/${task.taskId}/prompt.txt`), prompt);
    const groundTruth = {
      schemaVersion: "R3-T3-ground-truth-v1",
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
      schemaVersion: "R3-T3-vem-context-v1",
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
        "CAPSULE_AUDIT_CONTAINMENT_ONLY",
        "NO_PRODUCT_HOLDOUT_STATUS",
      ],
    };
    writeJson(
      join(output, `participant/vem-context/${task.taskId}.json`),
      vemContext,
    );
    manifestTasks.push({
      taskId: task.taskId,
      taskClass: "r3-capsule-audit-containment-only-not-product-holdout",
      armOrder: task.armOrder,
      promptHash,
      fixtureHash: canonicalSha256(R3_FIXTURE_FILES),
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
      groundTruthHash: canonicalSha256(groundTruth),
      vemContextHash: canonicalSha256(vemContext),
    });

    const directCapsule = createParticipantCapsule({
      sourceRoot: join(output, "fixture"),
      taskId: task.taskId,
      arm: "direct-search",
      responseSchemaPath: join(output, "inputs/response-schema.json"),
    });
    let vemCapsule;
    try {
      vemCapsule = createParticipantCapsule({
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
        directCapsule.manifest,
        vemCapsule.manifest,
      );
      const probes = runProbes
        ? {
            directFilesystem: runFilesystemIsolationProbe(directCapsule),
            vemFilesystem: runFilesystemIsolationProbe(vemCapsule),
            directCodexBinary: runCodexBinaryIsolationProbe(directCapsule),
            vemCodexBinary: runCodexBinaryIsolationProbe(vemCapsule),
            directPermissionProfile: permissionProbeRunner(
              buildR3PermissionProfileProbeInvocation({
                capsule: directCapsule,
              }),
            ),
            vemPermissionProfile: permissionProbeRunner(
              buildR3PermissionProfileProbeInvocation({
                capsule: vemCapsule,
              }),
            ),
          }
        : { skippedForUnitTest: true };
      const capsuleProof = {
        schemaVersion: "R3-T3-capsule-proof-v1",
        taskId: task.taskId,
        baseContextHash: difference.baseContextHash,
        onlyDifference: difference.onlyDifference,
        vemContextHash: difference.vemContextHash,
        directManifest: directCapsule.manifest,
        vemManifest: vemCapsule.manifest,
        probes,
      };
      writeJson(join(output, `capsules/${task.taskId}.json`), capsuleProof);
      capsuleProofs.push(capsuleProof);
    } finally {
      cleanupParticipantCapsule(directCapsule);
      if (vemCapsule !== undefined) cleanupParticipantCapsule(vemCapsule);
    }
  }

  const taskManifest = {
    schemaVersion: "R3-T3-task-manifest-v1",
    decisionKey: "R3-RECOVERY",
    decisionAttempt: 1,
    taskBank: "r3-capsule-audit-containment-only-not-product-holdout",
    model: R3_MODEL,
    contextPolicy: "one-codex-exec-ephemeral-process-per-arm",
    cachePolicy: "fresh-tmpfs-codex-home-per-arm-counterbalanced-order",
    promptPolicy: "identical-within-task-pair",
    toolPolicy:
      "same-read-only-permission-profile-capsule-and-no-web-within-task-pair",
    responseAuthority: "codex-output-last-message-runner-owned-file",
    jsonlRole: "audit-events-not-final-response-candidates",
    setupCostPolicy: "prepare-and-capsule-setup-reported-separately",
    groundTruthPolicy: "evaluator-only-never-copied-to-participant-capsule",
    auditNeedlePolicy:
      "private-evaluator-only-never-copied-to-participant-capsule",
    productHoldoutPolicy: "P1-P3-P4-holdouts-excluded-and-untouched",
    counterbalance: manifestTasks.map(({ taskId, armOrder }) => ({
      taskId,
      armOrder,
    })),
    tasks: manifestTasks,
  };
  writeJson(join(output, "inputs/task-manifest.json"), taskManifest);
  const auditContract = {
    schemaVersion: "R3-T3-audit-contract-v1",
    auditor: "scripts/pilot/capsule-audit-v3.mjs",
    commandCorrelation: "item-id-started-to-completed",
    decisionObservation: "completed-command-output-and-stderr-only",
    markerOnlyNegativeLookup:
      "non-authorizing-warning-when-no-forbidden-path-content-or-external-evidence",
    failClosedOn: [
      "forbidden-rule-or-skill-path-observed",
      "forbidden-content-needle-observed",
      "auth-or-proc-path-command-or-output",
      "path-traversal",
      "external-absolute-path-command-or-output",
      "malformed-duplicate-missing-or-changed-command-event",
    ],
    ordinaryViolationReturn: "structured-failed-result-not-throw",
    privateNeedlesParticipantVisible: false,
  };
  writeJson(join(output, "inputs/audit-contract.json"), auditContract);
  const permissionContract = {
    schemaVersion: "R3-T3-permission-contract-v1",
    profileName: R3_PERMISSION_PROFILE_NAME,
    rootDefault: "deny",
    runtime: "/opt/codex:read",
    workspace: "/work:read",
    auth: "/codex-home/auth.json:deny",
    procConfigured: "deny",
    procRuntimeLimitation: "self-environ-readable",
    commandEnvironment: "inherit-none-fixed-non-secret",
    commandNetwork: "disabled",
    interactiveEscalation: "disabled",
    unsupportedOrProbeMismatch: "block-before-external-run",
  };
  writeJson(join(output, "inputs/permission-contract.json"), permissionContract);
  const failureEvidenceContract = {
    schemaVersion: "R3-T3-failure-evidence-contract-v1",
    recorderLayerPreserved: true,
    recorderFiles: [
      "stdout.jsonl",
      "stderr.txt",
      "final-response-observation.json",
      "receipt-ledger.json",
      "run.json",
      "failure.json-when-recorder-fails",
      "SHA256SUMS",
    ],
    r3TerminalLayer: [
      "r3-terminal/capsule-audit.json",
      "r3-terminal/ground-truth-observation.json",
      "r3-terminal/evaluation.json",
      "r3-terminal/errors.json-when-exception",
      "r3-terminal/terminal.json",
      "R3-SHA256SUMS",
    ],
    aggregateLayer: [
      "r3-batch-terminal/batch-terminal.json",
      "r3-batch-terminal/aggregate-errors.json-when-exception",
      "R3-BATCH-SHA256SUMS",
    ],
    exceptionsContained: ["audit", "ground-truth", "evaluator", "hash", "aggregate"],
    batchPolicy: "stop-after-first-non-success-or-unsealed-run",
    sealedBeforeReturn: true,
  };
  writeJson(
    join(output, "inputs/failure-evidence-contract.json"),
    failureEvidenceContract,
  );
  const runnerContract = {
    schemaVersion: "R3-T3-runner-contract-v1",
    runner: "scripts/pilot/r3-t4.mjs",
    recorder: "scripts/pilot/r2-run-recorder.mjs",
    finalizer: "scripts/pilot/r3-run-finalizer.mjs",
    capsule: "scripts/pilot/r3-capsule.mjs",
    auditor: "scripts/pilot/capsule-audit-v3.mjs",
    responseAuthority: "codex-output-last-message-runner-owned-file",
    jsonlRole: "audit-events-not-final-response-candidates",
    finalResponsePath: "/run/vem/final-response.json",
    participantWorkspaceWritable: false,
    writableCapsulePaths: ["/run/vem/final-response.json"],
    permissionProfile: R3_PERMISSION_PROFILE_NAME,
    generatedCommandAuthAccess: "deny",
    generatedCommandEnvironment: "clean-fixed-non-secret",
    finalResponseChecks: [
      "regular-file",
      "no-symlink",
      "bounded-size",
      "frozen-schema",
      "last-agent-message-canonical-consistency",
    ],
    failureClassification:
      "protocol-capsule-audit-attribution-and-sealing-orthogonal",
    authorizationPolicy:
      "separate-exact-hash-and-ten-run-owner-authorization-required",
    resultPolicy:
      "new-R3-T4-evidence-root-preregistration-root-remains-read-only",
  };
  writeJson(join(output, "inputs/runner-contract.json"), runnerContract);
  const prepareDurationNs = (process.hrtime.bigint() - startedAt).toString();
  writeJson(join(output, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "R3-T3-prepare-setup-cost-v1",
    totalPrepareSetupDurationNs: prepareDurationNs,
    includes:
      "fixture-task-context-capsule-hash-and-local-permission-probe-preparation",
    excludes: "external-model-arm-and-per-run-capsule-setup",
    separatelyReported: true,
  });

  const runtimeBindings = Object.fromEntries(
    R3_PREREGISTERED_RUNTIME_SOURCE_PATHS.map((path) => [
      path,
      sha256(readFileSync(join(REPO_ROOT, path))),
    ]),
  );
  const instrumentationHash = canonicalSha256(runtimeBindings);
  if (instrumentationHash === R2_INSTRUMENTATION_HASH) {
    throw new Error("R3_T3_INSTRUMENTATION_HASH_NOT_FRESH");
  }
  const fixtureHash = canonicalSha256(R3_FIXTURE_FILES);
  if (fixtureHash === priorFixtureHash(R2_PREREGISTRATION_ROOT)) {
    throw new Error("R3_T3_FIXTURE_NOT_FRESH");
  }
  const plan = {
    schemaVersion: "R3-T3-preregistered-recovery-plan-v1",
    decisionKey: "R3-RECOVERY",
    decisionAttempt: 1,
    doesNotSupersede: "R2-RECOVERY",
    alsoDoesNotSupersede: ["R1-RECOVERY", "R0-RECOVERY", "P0-VALUE"],
    terminalInputs,
    preregistrationHashAlgorithm: "sha256-canonical-file-manifest",
    taskCount: manifestTasks.length,
    runCount: manifestTasks.length * 2,
    taskBank: "r3-capsule-audit-containment-only-not-product-holdout",
    taskIds: manifestTasks.map((task) => task.taskId),
    taskManifestHash: canonicalSha256(taskManifest),
    fixtureHash,
    fixtureDistinctFromR2: true,
    priorTaskIdsExcluded: priorTaskInputs.taskIds,
    priorPromptHashesExcluded: priorTaskInputs.promptHashes,
    productHoldoutSourceHash,
    productHoldoutTaskIds: productHoldout.taskIds,
    productHoldoutConsumed: false,
    groundTruthParticipantVisible: false,
    auditContentNeedlesParticipantVisible: false,
    counterbalancePolicy: "alternating-AB-BA-across-five-pairs",
    armDifferencePolicy: "vem-context.json-only",
    capsuleBaseHashes: capsuleProofs.map((proof) => ({
      taskId: proof.taskId,
      baseContextHash: proof.baseContextHash,
      vemContextHash: proof.vemContextHash,
    })),
    model: R3_MODEL,
    sourceBindings: runtimeBindings,
    preparationSourceHash: sha256(readFileSync(SCRIPT_PATH)),
    instrumentationHash,
    priorInstrumentationHash: R2_INSTRUMENTATION_HASH,
    verdictRuleHash: canonicalSha256(R3_VERDICT_RULE),
    auditContractHash: canonicalSha256(auditContract),
    permissionContractHash: canonicalSha256(permissionContract),
    failureEvidenceContractHash: canonicalSha256(failureEvidenceContract),
    runnerContractHash: canonicalSha256(runnerContract),
    thresholdPolicy: R3_VERDICT_RULE,
    externalExecutionAuthorized: false,
    productUnlockCount: 0,
    nextAuthorization:
      "explicit-owner-authorization-for-R3-T4-bound-to-this-full-hash-and-ten-runs",
    limitations: [
      "CAPSULE_AUDIT_CONTAINMENT_ENGINEERING_SMOKE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_P0_R0_R1_R2_OR_PRODUCT_UNLOCK",
      "NO_EXTERNAL_MODEL_CALL_IN_R3_T3",
    ],
  };
  writeJson(join(output, "PREREGISTRATION.json"), plan);
  const preregistrationHash = preregistrationDigest(output);
  writeText(join(output, "PREREGISTRATION.sha256"), `${preregistrationHash}\n`);
  return Object.freeze({
    ok: true,
    taskId: "R3-T3",
    outputRoot: output,
    taskCount: manifestTasks.length,
    plannedExternalRunCount: manifestTasks.length * 2,
    preregistrationHash,
    instrumentationHash,
    externalExecutionAuthorized: false,
    probesRun: runProbes,
  });
}

export function preregistrationDigest(root) {
  return sha256(canonicalJson(collectFiles(root)
    .filter((path) => (
      relative(root, path).replaceAll("\\", "/") !== "PREREGISTRATION.sha256"
    ))
    .map((path) => ({
      path: relative(root, path).replaceAll("\\", "/"),
      sha256: sha256(readFileSync(path)),
    }))));
}

function verifyR2InstrumentationBinding() {
  const r2 = readJson(join(R2_PREREGISTRATION_ROOT, "PREREGISTRATION.json"));
  if (r2.instrumentationHash !== R2_INSTRUMENTATION_HASH
    || readFileSync(
      join(R2_PREREGISTRATION_ROOT, "PREREGISTRATION.sha256"),
      "utf8",
    ).trim() !== PRIOR_PREREGISTRATION_HASHES.r2) {
    throw new Error("R3_T3_R2_BINDING_INVALID");
  }
}

function verifyPriorPreregistrationInputs() {
  const inputs = [
    [P0_ATTEMPT_ONE_ROOT, PRIOR_PREREGISTRATION_HASHES.p0AttemptOne, "p0"],
    [P0_ATTEMPT_TWO_ROOT, PRIOR_PREREGISTRATION_HASHES.p0AttemptTwo, "p0"],
    [R0_PREREGISTRATION_ROOT, PRIOR_PREREGISTRATION_HASHES.r0, "recovery"],
    [R1_PREREGISTRATION_ROOT, PRIOR_PREREGISTRATION_HASHES.r1, "recovery"],
    [R2_PREREGISTRATION_ROOT, PRIOR_PREREGISTRATION_HASHES.r2, "recovery"],
  ];
  for (const [root, expected, format] of inputs) {
    const declared = readFileSync(
      join(root, "PREREGISTRATION.sha256"),
      "utf8",
    ).trim();
    const actual = format === "p0"
      ? p0PreregistrationDigest(root)
      : preregistrationDigest(root);
    if (declared !== expected || actual !== expected) {
      throw new Error("R3_T3_PRIOR_PREREGISTRATION_CHANGED");
    }
  }
}

function verifyImmutableTerminalInputs() {
  const records = [
    {
      key: "p0",
      phase: "P0",
      attempt: "P0-T17D",
      path: join(P0_ATTEMPT_TWO_ROOT, "results/verdict.json"),
    },
    {
      key: "r0",
      phase: "R0",
      attempt: "R0-T4",
      path: join(
        REPO_ROOT,
        "docs/test-evidence/R0-T4/20260729T194719+0800/verdict.json",
      ),
    },
    {
      key: "r1",
      phase: "R1",
      attempt: "R1-T4",
      path: join(
        REPO_ROOT,
        "docs/test-evidence/R1-T4/20260729T213524+0800/results/verdict.json",
      ),
    },
    {
      key: "r2",
      phase: "R2",
      attempt: "R2-T4",
      path: join(
        REPO_ROOT,
        "docs/test-evidence/R2-T4/20260729T230343+0800/results/verdict.json",
      ),
    },
  ];
  const terminal = {};
  for (const record of records) {
    const verdict = readJson(record.path);
    const rawHash = sha256(readFileSync(record.path));
    if (verdict.verdict !== "stop"
      || rawHash !== TERMINAL_VERDICT_HASHES[record.key]) {
      throw new Error("R3_T3_TERMINAL_CHAIN_INVALID");
    }
    terminal[record.key] = {
      phase: record.phase,
      status: "failed",
      attempt: record.attempt,
      verdict: "stop",
      verdictHash: rawHash,
    };
  }
  return terminal;
}

function p0PreregistrationDigest(root) {
  return sha256(collectFiles(root)
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => (
      path !== "PREREGISTRATION.sha256"
      && path !== "RESULTS.sha256"
      && !path.startsWith("results/")
    ))
    .map((path) => `${sha256(readFileSync(join(root, path)))}  ${path}\n`)
    .join(""));
}

function collectPriorTaskInputs() {
  const roots = [
    P0_ATTEMPT_ONE_ROOT,
    P0_ATTEMPT_TWO_ROOT,
    R0_PREREGISTRATION_ROOT,
    R1_PREREGISTRATION_ROOT,
    R2_PREREGISTRATION_ROOT,
  ];
  const taskIds = [];
  const promptHashes = [];
  for (const root of roots) {
    const manifest = readJson(join(root, "inputs/task-manifest.json"));
    for (const task of manifest.tasks) {
      taskIds.push(task.taskId);
      promptHashes.push(sha256(readFileSync(
        join(root, `participant/tasks/${task.taskId}/prompt.txt`),
      )));
    }
  }
  return {
    taskIds: [...new Set(taskIds)].sort(),
    promptHashes: [...new Set(promptHashes)].sort(),
  };
}

function buildForbiddenContentNeedles() {
  const needles = [];
  const sourceHashes = {};
  for (const sourcePath of FORBIDDEN_CONTENT_SOURCES) {
    const body = readFileSync(join(REPO_ROOT, sourcePath), "utf8");
    sourceHashes[sourcePath] = sha256(body);
    const candidates = body.split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => (
        Buffer.byteLength(line, "utf8") >= 32
        && Buffer.byteLength(line, "utf8") <= 512
      ));
    const wanted = Math.min(16, candidates.length);
    for (let index = 0; index < wanted; index += 1) {
      const candidateIndex = Math.floor(index * candidates.length / wanted);
      const text = candidates[candidateIndex];
      if (text === undefined || needles.some((needle) => needle.text === text)) {
        continue;
      }
      needles.push({
        id: `rules-${needles.length + 1}`,
        text,
      });
    }
  }
  if (needles.length < 16 || needles.length > 64) {
    throw new Error("R3_T3_AUDIT_NEEDLES_INVALID");
  }
  return { sourceHashes, needles };
}

function priorFixtureHash(root) {
  return canonicalSha256(Object.fromEntries([
    "packages/demo-fixture/src/App.tsx",
    "packages/demo-fixture/src/fixtures.ts",
  ].map((path) => [path, readFileSync(join(root, "fixture", path), "utf8")])));
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  if (!existsSync(resolved)
    || !lstatSync(resolved).isDirectory()
    || lstatSync(resolved).isSymbolicLink()) {
    throw new Error(code);
  }
  return resolved;
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R3_T3_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R3_T3_NON_REGULAR_FILE_REJECTED");
      if (files.length > 512) throw new Error("R3_T3_FILE_LIMIT_EXCEEDED");
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
  if (process.argv.length !== 4 || process.argv[2] !== "prepare") {
    throw new Error("USAGE: node scripts/pilot/r3-t3.mjs prepare <output-root>");
  }
  const result = prepareR3RecoveryPreregistration({
    outputRoot: process.argv[3],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
