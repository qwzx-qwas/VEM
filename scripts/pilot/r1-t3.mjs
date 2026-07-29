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
  buildR1Prompt,
  R1_FIXTURE_FILES,
  R1_MODEL,
  R1_RESPONSE_SCHEMA,
  R1_TASKS,
  R1_VERDICT_RULE,
} from "./r1-recovery-plan.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R1-T3");
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
const R0_VERDICT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R0-T4/20260729T194719+0800",
);
const FIXTURE_RELATIVE_FILE = "packages/demo-fixture/src/App.tsx";
const REGISTRY_REVISION = "r1-runner-remediation-registry-v1";
const R0_INSTRUMENTATION_HASH =
  "c7851c93a8451436d056cc9b2ed097e4b0fc5c6cc0e9f7289ec22ff710d4067b";
const RUNTIME_SOURCE_PATHS = Object.freeze([
  "scripts/pilot/r1-t4.mjs",
  "scripts/pilot/r1-run-recorder.mjs",
  "scripts/pilot/r1-recovery-plan.mjs",
  "scripts/pilot/capsule.mjs",
  "scripts/pilot/capsule-audit-v2.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);

export function prepareR1RecoveryPreregistration({
  outputRoot,
  runProbes = true,
  enforceEvidenceParent = true,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)) {
    throw new Error("R1_T3_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R1_T3_OUTPUT_PARENT_INVALID",
  );
  const immutableInputs = verifyImmutableTerminalInputs();
  const startedAt = process.hrtime.bigint();
  mkdirSync(output, { mode: 0o700 });
  for (const [path, body] of Object.entries(R1_FIXTURE_FILES)) {
    writeText(join(output, "fixture", path), body);
  }
  writeJson(join(output, "inputs/response-schema.json"), R1_RESPONSE_SCHEMA);
  writeJson(join(output, "private/verdict-rule.json"), R1_VERDICT_RULE);

  const source = R1_FIXTURE_FILES[FIXTURE_RELATIVE_FILE];
  const transformed = transformIntrinsicJsx({
    code: source,
    filename: join(output, "fixture", FIXTURE_RELATIVE_FILE),
    relativeFile: FIXTURE_RELATIVE_FILE,
    sourceRegistryRevision: REGISTRY_REVISION,
  });
  writeJson(join(output, "inputs/source-registry.json"), {
    schemaVersion: "R1-T3-source-registry-v1",
    sourceRegistryRevision: REGISTRY_REVISION,
    records: transformed.records,
  });

  const priorTaskInputs = collectPriorTaskInputs();
  writeJson(join(output, "private/prior-task-exclusion.json"), {
    schemaVersion: "R1-T3-prior-task-exclusion-v1",
    sourceAttempts: ["P0-T17B", "R0-T3"],
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
    schemaVersion: "R1-T3-product-holdout-exclusion-v1",
    sourceAttempt: "P0-T17D",
    sourceHash: productHoldoutSourceHash,
    taskIds: productHoldout.taskIds,
    consumed: false,
    remediationTasksAreProductHoldouts: false,
  });

  const manifestTasks = [];
  const capsuleProofs = [];
  for (const task of R1_TASKS) {
    const line = source.split("\n").findIndex((sourceLine) => (
      sourceLine.includes(task.marker)
    )) + 1;
    const record = transformed.records.find((candidate) => (
      candidate.relativeFile === FIXTURE_RELATIVE_FILE
        && candidate.intrinsicTag === task.tagName
        && candidate.line === line
    ));
    if (line < 1 || record === undefined) throw new Error("R1_T3_SOURCE_RECORD_MISSING");
    const prompt = `${buildR1Prompt(task.description)}\n`;
    const promptHash = sha256(prompt);
    if (priorTaskInputs.taskIds.includes(task.taskId)
      || priorTaskInputs.promptHashes.includes(promptHash)
      || productHoldout.taskIds.includes(task.taskId)) {
      throw new Error("R1_T3_TASK_BANK_NOT_FRESH");
    }
    writeText(join(output, `participant/tasks/${task.taskId}/prompt.txt`), prompt);
    const groundTruth = {
      schemaVersion: "R1-T3-ground-truth-v1",
      taskId: task.taskId,
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
    };
    writeJson(join(output, `private/ground-truth/${task.taskId}.json`), groundTruth);
    const vemContext = {
      schemaVersion: "R1-T3-vem-context-v1",
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
        "RUNNER_REMEDIATION_ONLY",
        "NO_PRODUCT_HOLDOUT_STATUS",
      ],
    };
    writeJson(
      join(output, `participant/vem-context/${task.taskId}.json`),
      vemContext,
    );
    manifestTasks.push({
      taskId: task.taskId,
      taskClass: "r1-runner-remediation-only-not-product-holdout",
      armOrder: task.armOrder,
      promptHash,
      fixtureHash: canonicalSha256(R1_FIXTURE_FILES),
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
        }
        : { skippedForUnitTest: true };
      const capsuleProof = {
        schemaVersion: "R1-T3-capsule-proof-v1",
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
    schemaVersion: "R1-T3-task-manifest-v1",
    decisionKey: "R1-RECOVERY",
    decisionAttempt: 1,
    taskBank: "r1-runner-remediation-only-not-product-holdout",
    model: R1_MODEL,
    contextPolicy: "one-codex-exec-ephemeral-process-per-arm",
    cachePolicy: "fresh-tmpfs-codex-home-per-arm-counterbalanced-order",
    promptPolicy: "identical-within-task-pair",
    toolPolicy: "same-read-only-capsule-and-no-web-within-task-pair",
    setupCostPolicy: "prepare-and-capsule-setup-reported-separately",
    groundTruthPolicy: "evaluator-only-never-copied-to-participant-capsule",
    productHoldoutPolicy: "P1-P3-P4-holdouts-excluded-and-untouched",
    timingPolicy: {
      source: "trusted-outer-remediated-receipt-ledger",
      clock: "node:process.hrtime.bigint",
      unit: "nanoseconds-decimal-string",
      start: "process-spawned-receipt",
      end: "run-finalized-receipt-after-stream-close",
      limitations: [
        "NO_MODEL_SERVER_GENERATION_TIME",
        "NO_MODEL_COMPUTE_ATTRIBUTION",
        "NO_SHELL_INTERNAL_TIMING",
      ],
    },
    counterbalance: manifestTasks.map(({ taskId, armOrder }) => ({ taskId, armOrder })),
    tasks: manifestTasks,
  };
  writeJson(join(output, "inputs/task-manifest.json"), taskManifest);
  const failureEvidenceContract = {
    schemaVersion: "R1-T3-failure-evidence-contract-v1",
    rawFilesCreatedBeforeSpawn: ["stdout.jsonl.partial", "stderr.txt.partial"],
    sealedBeforeReturn: [
      "stdout.jsonl",
      "stderr.txt",
      "receipt-ledger.json",
      "run.json",
      "failure.json",
      "SHA256SUMS",
    ],
    streamCloseBeforeResponseSelection: true,
    schemaValidNonconflictingSelectionCount: 1,
    zeroOrConflictingValidCandidates: "fail-closed",
    batchPolicy: "stop-after-first-runner-or-evidence-integrity-failure",
  };
  writeJson(
    join(output, "inputs/failure-evidence-contract.json"),
    failureEvidenceContract,
  );
  writeJson(join(output, "inputs/runner-contract.json"), {
    schemaVersion: "R1-T3-runner-contract-v1",
    runner: "scripts/pilot/r1-t4.mjs",
    recorder: "scripts/pilot/r1-run-recorder.mjs",
    invocation: "one async child process per arm through the hash-bound bubblewrap capsule",
    responsePolicy: "classify all agent messages after stream close and select one schema-valid nonconflicting final response",
    rawEvidence: ["stdout.jsonl", "stderr.txt", "receipt-ledger.json", "run.json"],
    failureEvidence: ["failure.json", "SHA256SUMS"],
    authorizationPolicy: "separate hash-bound owner authorization required before any run",
    resultPolicy: "new R1-T4 evidence root; preregistration root remains read-only",
  });

  const prepareDurationNs = (process.hrtime.bigint() - startedAt).toString();
  writeJson(join(output, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "R1-T3-prepare-setup-cost-v1",
    totalPrepareSetupDurationNs: prepareDurationNs,
    includes: "fixture-task-context-capsule-hash-and-local-probe-preparation",
    excludes: "external-model-arm-and-per-run-capsule-setup",
    separatelyReported: true,
  });
  const runtimeBindings = Object.fromEntries(RUNTIME_SOURCE_PATHS.map((path) => [
    path,
    sha256(readFileSync(join(REPO_ROOT, path))),
  ]));
  const instrumentationHash = canonicalSha256(runtimeBindings);
  if (instrumentationHash === R0_INSTRUMENTATION_HASH) {
    throw new Error("R1_T3_INSTRUMENTATION_HASH_NOT_FRESH");
  }
  const fixtureHash = canonicalSha256(R1_FIXTURE_FILES);
  const priorFixtureHashes = collectPriorFixtureHashes();
  if (priorFixtureHashes.includes(fixtureHash)) {
    throw new Error("R1_T3_FIXTURE_NOT_FRESH");
  }
  const plan = {
    schemaVersion: "R1-T3-preregistered-recovery-plan-v1",
    decisionKey: "R1-RECOVERY",
    decisionAttempt: 1,
    doesNotSupersede: "R0-RECOVERY",
    alsoDoesNotSupersede: ["P0-VALUE"],
    terminalInputs: immutableInputs,
    preregistrationHashAlgorithm: "sha256-canonical-file-manifest",
    taskCount: manifestTasks.length,
    runCount: manifestTasks.length * 2,
    taskBank: "r1-runner-remediation-only-not-product-holdout",
    taskIds: manifestTasks.map((task) => task.taskId),
    taskManifestHash: canonicalSha256(taskManifest),
    fixtureHash,
    fixtureDistinctFromPriorAttempts: true,
    priorTaskIdsExcluded: priorTaskInputs.taskIds,
    priorPromptHashesExcluded: priorTaskInputs.promptHashes,
    productHoldoutSourceHash,
    productHoldoutTaskIds: productHoldout.taskIds,
    productHoldoutConsumed: false,
    groundTruthParticipantVisible: false,
    counterbalancePolicy: "alternating-AB-BA-across-five-pairs",
    armDifferencePolicy: "vem-context.json-only",
    capsuleBaseHashes: capsuleProofs.map((proof) => ({
      taskId: proof.taskId,
      baseContextHash: proof.baseContextHash,
      vemContextHash: proof.vemContextHash,
    })),
    model: R1_MODEL,
    sourceBindings: runtimeBindings,
    preparationSourceHash: sha256(readFileSync(SCRIPT_PATH)),
    instrumentationHash,
    priorInstrumentationHash: R0_INSTRUMENTATION_HASH,
    verdictRuleHash: canonicalSha256(R1_VERDICT_RULE),
    failureEvidenceContractHash: canonicalSha256(failureEvidenceContract),
    thresholdPolicy: R1_VERDICT_RULE,
    externalExecutionAuthorized: false,
    nextAuthorization: "explicit-owner-authorization-for-R1-T4-after-this-hash-is-frozen",
    limitations: [
      "RUNNER_REMEDIATION_ENGINEERING_SMOKE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_P0_R0_OR_PRODUCT_UNLOCK",
      "NO_EXTERNAL_MODEL_CALL_IN_R1_T3",
    ],
  };
  writeJson(join(output, "PREREGISTRATION.json"), plan);
  const preregistrationHash = preregistrationDigest(output);
  writeText(join(output, "PREREGISTRATION.sha256"), `${preregistrationHash}\n`);
  return Object.freeze({
    ok: true,
    outputRoot: output,
    taskCount: manifestTasks.length,
    runCount: manifestTasks.length * 2,
    preregistrationHash,
    instrumentationHash,
    externalExecutionAuthorized: false,
    probesRun: runProbes,
  });
}

export function preregistrationDigest(root) {
  const files = collectFiles(root)
    .filter((path) => relative(root, path).replaceAll("\\", "/") !== "PREREGISTRATION.sha256")
    .map((path) => ({
      path: relative(root, path).replaceAll("\\", "/"),
      sha256: sha256(readFileSync(path)),
    }));
  return sha256(canonicalJson(files));
}

function verifyImmutableTerminalInputs() {
  for (const root of [
    P0_ATTEMPT_ONE_ROOT,
    P0_ATTEMPT_TWO_ROOT,
    R0_PREREGISTRATION_ROOT,
    R0_VERDICT_ROOT,
  ]) {
    requireDirectory(root, "R1_T3_TERMINAL_EVIDENCE_MISSING");
  }
  const p0Verdict = readJson(join(P0_ATTEMPT_TWO_ROOT, "results/verdict.json"));
  const r0Verdict = readJson(join(R0_VERDICT_ROOT, "verdict.json"));
  if (p0Verdict.decisionKey !== "P0-VALUE"
    || p0Verdict.verdict !== "stop"
    || r0Verdict.decisionKey !== "R0-RECOVERY"
    || r0Verdict.verdict !== "stop") {
    throw new Error("R1_T3_TERMINAL_CHAIN_INVALID");
  }
  return {
    p0: {
      phase: "P0",
      status: "failed",
      attempt: "P0-T17D",
      verdict: "stop",
      verdictHash: sha256(readFileSync(
        join(P0_ATTEMPT_TWO_ROOT, "results/verdict.json"),
      )),
    },
    r0: {
      phase: "R0",
      status: "failed",
      attempt: "R0-T4",
      verdict: "stop",
      verdictHash: sha256(readFileSync(
        join(R0_VERDICT_ROOT, "verdict.json"),
      )),
    },
  };
}

function collectPriorTaskInputs() {
  const manifests = [
    {
      root: P0_ATTEMPT_ONE_ROOT,
      manifest: readJson(join(P0_ATTEMPT_ONE_ROOT, "inputs/task-manifest.json")),
    },
    {
      root: R0_PREREGISTRATION_ROOT,
      manifest: readJson(join(R0_PREREGISTRATION_ROOT, "inputs/task-manifest.json")),
    },
  ];
  const taskIds = [];
  const promptHashes = [];
  for (const { root, manifest } of manifests) {
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

function collectPriorFixtureHashes() {
  return [
    canonicalSha256(Object.fromEntries([
      "packages/demo-fixture/src/App.tsx",
      "packages/demo-fixture/src/fixtures.ts",
    ].map((path) => [
      path,
      readFileSync(join(R0_PREREGISTRATION_ROOT, "fixture", path), "utf8"),
    ]))),
    canonicalSha256(Object.fromEntries([
      "packages/demo-fixture/src/App.tsx",
      "packages/demo-fixture/src/fixtures.ts",
    ].map((path) => [
      path,
      readFileSync(join(P0_ATTEMPT_TWO_ROOT, "fixture", path), "utf8"),
    ]))),
  ];
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
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R1_T3_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R1_T3_NON_REGULAR_FILE_REJECTED");
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
    throw new Error(
      "USAGE: node scripts/pilot/r1-t3.mjs prepare <output-root>",
    );
  }
  const result = prepareR1RecoveryPreregistration({
    outputRoot: process.argv[3],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
