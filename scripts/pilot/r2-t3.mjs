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
import { runR2FinalOutputIsolationProbe } from "./r2-capsule.mjs";
import {
  buildR2Prompt,
  R2_FIXTURE_FILES,
  R2_MODEL,
  R2_RESPONSE_SCHEMA,
  R2_TASKS,
  R2_VERDICT_RULE,
} from "./r2-recovery-plan.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R2-T3");
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
const R1_VERDICT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R1-T4/20260729T213524+0800",
);
const FIXTURE_RELATIVE_FILE = "packages/demo-fixture/src/App.tsx";
const REGISTRY_REVISION = "r2-final-output-authority-registry-v1";
const R1_INSTRUMENTATION_HASH =
  "388b1e0d89deea9a91c2d8c3701131fa358d60f988a78fd9d9098cd4c07cd231";
const RUNTIME_SOURCE_PATHS = Object.freeze([
  "scripts/pilot/r2-t4.mjs",
  "scripts/pilot/r2-run-recorder.mjs",
  "scripts/pilot/r2-capsule.mjs",
  "scripts/pilot/r2-recovery-plan.mjs",
  "scripts/pilot/capsule.mjs",
  "scripts/pilot/capsule-audit-v2.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);

export function prepareR2RecoveryPreregistration({
  outputRoot,
  runProbes = true,
  enforceEvidenceParent = true,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)) {
    throw new Error("R2_T3_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R2_T3_OUTPUT_PARENT_INVALID",
  );
  const terminalInputs = verifyImmutableTerminalInputs();
  const startedAt = process.hrtime.bigint();
  mkdirSync(output, { mode: 0o700 });
  for (const [path, body] of Object.entries(R2_FIXTURE_FILES)) {
    writeText(join(output, "fixture", path), body);
  }
  writeJson(join(output, "inputs/response-schema.json"), R2_RESPONSE_SCHEMA);
  writeJson(join(output, "private/verdict-rule.json"), R2_VERDICT_RULE);

  const source = R2_FIXTURE_FILES[FIXTURE_RELATIVE_FILE];
  const transformed = transformIntrinsicJsx({
    code: source,
    filename: join(output, "fixture", FIXTURE_RELATIVE_FILE),
    relativeFile: FIXTURE_RELATIVE_FILE,
    sourceRegistryRevision: REGISTRY_REVISION,
  });
  writeJson(join(output, "inputs/source-registry.json"), {
    schemaVersion: "R2-T3-source-registry-v1",
    sourceRegistryRevision: REGISTRY_REVISION,
    records: transformed.records,
  });

  const priorTaskInputs = collectPriorTaskInputs();
  writeJson(join(output, "private/prior-task-exclusion.json"), {
    schemaVersion: "R2-T3-prior-task-exclusion-v1",
    sourceAttempts: ["P0-T17B", "R0-T3", "R1-T3"],
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
    schemaVersion: "R2-T3-product-holdout-exclusion-v1",
    sourceAttempt: "P0-T17D",
    sourceHash: productHoldoutSourceHash,
    taskIds: productHoldout.taskIds,
    consumed: false,
    remediationTasksAreProductHoldouts: false,
  });

  const manifestTasks = [];
  const capsuleProofs = [];
  for (const task of R2_TASKS) {
    const line = source.split("\n").findIndex((sourceLine) => sourceLine.includes(task.marker)) + 1;
    const record = transformed.records.find((candidate) => (
      candidate.relativeFile === FIXTURE_RELATIVE_FILE
        && candidate.intrinsicTag === task.tagName
        && candidate.line === line
    ));
    if (line < 1 || record === undefined) throw new Error("R2_T3_SOURCE_RECORD_MISSING");
    const prompt = `${buildR2Prompt(task.description)}\n`;
    const promptHash = sha256(prompt);
    if (priorTaskInputs.taskIds.includes(task.taskId)
      || priorTaskInputs.promptHashes.includes(promptHash)
      || productHoldout.taskIds.includes(task.taskId)) {
      throw new Error("R2_T3_TASK_BANK_NOT_FRESH");
    }
    writeText(join(output, `participant/tasks/${task.taskId}/prompt.txt`), prompt);
    const groundTruth = {
      schemaVersion: "R2-T3-ground-truth-v1",
      taskId: task.taskId,
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
    };
    writeJson(join(output, `private/ground-truth/${task.taskId}.json`), groundTruth);
    const vemContext = {
      schemaVersion: "R2-T3-vem-context-v1",
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
        "FINAL_OUTPUT_REMEDIATION_ONLY",
        "NO_PRODUCT_HOLDOUT_STATUS",
      ],
    };
    writeJson(join(output, `participant/vem-context/${task.taskId}.json`), vemContext);
    manifestTasks.push({
      taskId: task.taskId,
      taskClass: "r2-final-output-remediation-only-not-product-holdout",
      armOrder: task.armOrder,
      promptHash,
      fixtureHash: canonicalSha256(R2_FIXTURE_FILES),
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
        vemContextPath: join(output, `participant/vem-context/${task.taskId}.json`),
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
          directFinalOutput: summarizeOutputProbe(runR2FinalOutputIsolationProbe(directCapsule)),
          vemFinalOutput: summarizeOutputProbe(runR2FinalOutputIsolationProbe(vemCapsule)),
        }
        : { skippedForUnitTest: true };
      const capsuleProof = {
        schemaVersion: "R2-T3-capsule-proof-v1",
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
    schemaVersion: "R2-T3-task-manifest-v1",
    decisionKey: "R2-RECOVERY",
    decisionAttempt: 1,
    taskBank: "r2-final-output-remediation-only-not-product-holdout",
    model: R2_MODEL,
    contextPolicy: "one-codex-exec-ephemeral-process-per-arm",
    cachePolicy: "fresh-tmpfs-codex-home-per-arm-counterbalanced-order",
    promptPolicy: "identical-within-task-pair",
    toolPolicy: "same-read-only-capsule-and-no-web-within-task-pair",
    responseAuthority: "codex-output-last-message-runner-owned-file",
    jsonlRole: "audit-events-not-final-response-candidates",
    setupCostPolicy: "prepare-and-capsule-setup-reported-separately",
    groundTruthPolicy: "evaluator-only-never-copied-to-participant-capsule",
    productHoldoutPolicy: "P1-P3-P4-holdouts-excluded-and-untouched",
    counterbalance: manifestTasks.map(({ taskId, armOrder }) => ({ taskId, armOrder })),
    tasks: manifestTasks,
  };
  writeJson(join(output, "inputs/task-manifest.json"), taskManifest);
  const failureEvidenceContract = {
    schemaVersion: "R2-T3-failure-evidence-contract-v1",
    rawFilesCreatedBeforeSpawn: ["stdout.jsonl.partial", "stderr.txt.partial"],
    sealedBeforeReturn: [
      "stdout.jsonl",
      "stderr.txt",
      "final-response-observation.json",
      "receipt-ledger.json",
      "run.json",
      "failure.json",
      "SHA256SUMS",
    ],
    streamCloseBeforeResponseSelection: true,
    authoritativeResponseSelectionCount: 1,
    missingInvalidMismatchOrUnsafeFinalFile: "fail-closed",
    batchPolicy: "stop-after-first-runner-or-evidence-integrity-failure",
  };
  writeJson(join(output, "inputs/failure-evidence-contract.json"), failureEvidenceContract);
  writeJson(join(output, "inputs/runner-contract.json"), {
    schemaVersion: "R2-T3-runner-contract-v1",
    runner: "scripts/pilot/r2-t4.mjs",
    recorder: "scripts/pilot/r2-run-recorder.mjs",
    responseAuthority: "codex-output-last-message-runner-owned-file",
    jsonlRole: "audit-events-not-final-response-candidates",
    finalResponsePath: "/run/vem/final-response.json",
    participantWorkspaceWritable: false,
    writableCapsulePaths: ["/run/vem/final-response.json"],
    finalResponseChecks: [
      "regular-file",
      "no-symlink",
      "bounded-size",
      "frozen-schema",
      "last-agent-message-canonical-consistency",
    ],
    failureClassification: "protocol-integrity-separate-from-wrong-attribution",
    authorizationPolicy: "separate hash-bound owner authorization required before any run",
    resultPolicy: "new R2-T4 evidence root; preregistration root remains read-only",
  });
  const prepareDurationNs = (process.hrtime.bigint() - startedAt).toString();
  writeJson(join(output, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "R2-T3-prepare-setup-cost-v1",
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
  if (instrumentationHash === R1_INSTRUMENTATION_HASH) {
    throw new Error("R2_T3_INSTRUMENTATION_HASH_NOT_FRESH");
  }
  const fixtureHash = canonicalSha256(R2_FIXTURE_FILES);
  if (fixtureHash === priorFixtureHash(R1_PREREGISTRATION_ROOT)) {
    throw new Error("R2_T3_FIXTURE_NOT_FRESH");
  }
  const plan = {
    schemaVersion: "R2-T3-preregistered-recovery-plan-v1",
    decisionKey: "R2-RECOVERY",
    decisionAttempt: 1,
    doesNotSupersede: "R1-RECOVERY",
    alsoDoesNotSupersede: ["R0-RECOVERY", "P0-VALUE"],
    terminalInputs,
    preregistrationHashAlgorithm: "sha256-canonical-file-manifest",
    taskCount: manifestTasks.length,
    runCount: manifestTasks.length * 2,
    taskBank: "r2-final-output-remediation-only-not-product-holdout",
    taskIds: manifestTasks.map((task) => task.taskId),
    taskManifestHash: canonicalSha256(taskManifest),
    fixtureHash,
    fixtureDistinctFromR1: true,
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
    model: R2_MODEL,
    sourceBindings: runtimeBindings,
    preparationSourceHash: sha256(readFileSync(SCRIPT_PATH)),
    instrumentationHash,
    priorInstrumentationHash: R1_INSTRUMENTATION_HASH,
    verdictRuleHash: canonicalSha256(R2_VERDICT_RULE),
    failureEvidenceContractHash: canonicalSha256(failureEvidenceContract),
    thresholdPolicy: R2_VERDICT_RULE,
    externalExecutionAuthorized: false,
    productUnlockCount: 0,
    nextAuthorization: "explicit-owner-authorization-for-R2-T4-after-this-hash-is-frozen",
    limitations: [
      "FINAL_OUTPUT_REMEDIATION_ENGINEERING_SMOKE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_P0_R0_R1_OR_PRODUCT_UNLOCK",
      "NO_EXTERNAL_MODEL_CALL_IN_R2_T3",
    ],
  };
  writeJson(join(output, "PREREGISTRATION.json"), plan);
  const preregistrationHash = preregistrationDigest(output);
  writeText(join(output, "PREREGISTRATION.sha256"), `${preregistrationHash}\n`);
  return Object.freeze({
    ok: true,
    taskId: "R2-T3",
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
    .filter((path) => relative(root, path).replaceAll("\\", "/") !== "PREREGISTRATION.sha256")
    .map((path) => ({
      path: relative(root, path).replaceAll("\\", "/"),
      sha256: sha256(readFileSync(path)),
    }))));
}

function verifyImmutableTerminalInputs() {
  const p0 = readJson(join(P0_ATTEMPT_TWO_ROOT, "results/verdict.json"));
  const r0 = readJson(join(REPO_ROOT, "docs/test-evidence/R0-T4/20260729T194719+0800/verdict.json"));
  const r1 = readJson(join(R1_VERDICT_ROOT, "results/verdict.json"));
  if (p0.verdict !== "stop" || r0.verdict !== "stop" || r1.verdict !== "stop") {
    throw new Error("R2_T3_TERMINAL_CHAIN_INVALID");
  }
  return {
    p0: { phase: "P0", status: "failed", attempt: "P0-T17D", verdict: "stop", verdictHash: sha256(canonicalJson(p0)) },
    r0: { phase: "R0", status: "failed", attempt: "R0-T4", verdict: "stop", verdictHash: sha256(canonicalJson(r0)) },
    r1: { phase: "R1", status: "failed", attempt: "R1-T4", verdict: "stop", verdictHash: sha256(canonicalJson(r1)) },
  };
}

function collectPriorTaskInputs() {
  const roots = [P0_ATTEMPT_ONE_ROOT, R0_PREREGISTRATION_ROOT, R1_PREREGISTRATION_ROOT];
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

function priorFixtureHash(root) {
  return canonicalSha256(Object.fromEntries([
    "packages/demo-fixture/src/App.tsx",
    "packages/demo-fixture/src/fixtures.ts",
  ].map((path) => [path, readFileSync(join(root, "fixture", path), "utf8")])));
}
function summarizeOutputProbe(probe) {
  return {
    ok: probe.ok,
    workspaceWritable: probe.workspaceWritable,
    outputSiblingWritable: probe.outputSiblingWritable,
    authoritativeFileWritable: probe.authoritativeFileWritable,
  };
}
function requireDirectory(path, code) {
  const resolved = resolve(path);
  if (!existsSync(resolved)
    || !lstatSync(resolved).isDirectory()
    || lstatSync(resolved).isSymbolicLink()) throw new Error(code);
  return resolved;
}
function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R2_T3_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R2_T3_NON_REGULAR_FILE_REJECTED");
    }
  };
  visit(root);
  return files.sort();
}
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeJson(path, value) { writeText(path, `${canonicalJson(value)}\n`); }
function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 4 || process.argv[2] !== "prepare") {
    throw new Error("USAGE: node scripts/pilot/r2-t3.mjs prepare <output-root>");
  }
  const result = prepareR2RecoveryPreregistration({ outputRoot: process.argv[3] });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
