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
  buildR0Prompt,
  R0_FIXTURE_FILES,
  R0_MODEL,
  R0_RESPONSE_SCHEMA,
  R0_TASKS,
  R0_VERDICT_RULE,
} from "./r0-recovery-plan.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R0-T3");
const P0_ATTEMPT_ONE_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17B/20260729T171610+0800",
);
const P0_ATTEMPT_TWO_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17D/20260729T174733+0800",
);
const FIXTURE_RELATIVE_FILE = "packages/demo-fixture/src/App.tsx";
const REGISTRY_REVISION = "r0-recovery-registry-v1";
const RUNTIME_SOURCE_PATHS = Object.freeze([
  "scripts/pilot/r0-t4.mjs",
  "scripts/pilot/r0-recovery-plan.mjs",
  "scripts/pilot/capsule.mjs",
  "scripts/pilot/capsule-audit-v2.mjs",
  "packages/pilot-harness/src/receipt-ledger.ts",
  "packages/pilot-harness/dist/receipt-ledger.js",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);

export function prepareR0RecoveryPreregistration({
  outputRoot,
  runProbes = true,
  enforceEvidenceParent = true,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)) {
    throw new Error("R0_T3_OUTPUT_ROOT_INVALID");
  }
  if (enforceEvidenceParent) {
    requireDirectory(EVIDENCE_PARENT, "R0_T3_OUTPUT_PARENT_INVALID");
  } else {
    requireDirectory(dirname(output), "R0_T3_OUTPUT_PARENT_INVALID");
  }
  verifyImmutableP0Inputs();
  const startedAt = process.hrtime.bigint();
  mkdirSync(output, { mode: 0o700 });
  for (const [path, body] of Object.entries(R0_FIXTURE_FILES)) {
    writeText(join(output, "fixture", path), body);
  }
  writeJson(join(output, "inputs/response-schema.json"), R0_RESPONSE_SCHEMA);
  writeJson(join(output, "private/verdict-rule.json"), R0_VERDICT_RULE);

  const source = R0_FIXTURE_FILES[FIXTURE_RELATIVE_FILE];
  const transformed = transformIntrinsicJsx({
    code: source,
    filename: join(output, "fixture", FIXTURE_RELATIVE_FILE),
    relativeFile: FIXTURE_RELATIVE_FILE,
    sourceRegistryRevision: REGISTRY_REVISION,
  });
  writeJson(join(output, "inputs/source-registry.json"), {
    schemaVersion: "R0-T3-source-registry-v1",
    sourceRegistryRevision: REGISTRY_REVISION,
    records: transformed.records,
  });

  const p0Manifest = readJson(join(P0_ATTEMPT_ONE_ROOT, "inputs/task-manifest.json"));
  const p0TaskIds = p0Manifest.tasks.map((task) => task.taskId);
  const p0PromptHashes = p0TaskIds.map((taskId) => sha256(readFileSync(
    join(P0_ATTEMPT_ONE_ROOT, `participant/tasks/${taskId}/prompt.txt`),
  )));
  const productHoldout = readJson(
    join(P0_ATTEMPT_TWO_ROOT, "private/later-holdout-exclusion.json"),
  );
  const productHoldoutSourceHash = sha256(readFileSync(
    join(P0_ATTEMPT_TWO_ROOT, "private/later-holdout-exclusion.json"),
  ));
  writeJson(join(output, "private/product-holdout-exclusion.json"), {
    schemaVersion: "R0-T3-product-holdout-exclusion-v1",
    sourceAttempt: "P0-T17D",
    sourceHash: productHoldoutSourceHash,
    taskIds: productHoldout.taskIds,
    consumed: false,
    recoveryTasksAreProductHoldouts: false,
  });

  const manifestTasks = [];
  const capsuleProofs = [];
  for (const task of R0_TASKS) {
    const line = source.split("\n").findIndex((sourceLine) => (
      sourceLine.includes(task.marker)
    )) + 1;
    const record = transformed.records.find((candidate) => (
      candidate.relativeFile === FIXTURE_RELATIVE_FILE
        && candidate.intrinsicTag === task.tagName
        && candidate.line === line
    ));
    if (line < 1 || record === undefined) throw new Error("R0_T3_SOURCE_RECORD_MISSING");
    const prompt = `${buildR0Prompt(task.description)}\n`;
    const promptHash = sha256(prompt);
    if (p0TaskIds.includes(task.taskId)
      || productHoldout.taskIds.includes(task.taskId)
      || p0PromptHashes.includes(promptHash)) {
      throw new Error("R0_T3_TASK_BANK_NOT_FRESH");
    }
    writeText(join(output, `participant/tasks/${task.taskId}/prompt.txt`), prompt);
    const groundTruth = {
      schemaVersion: "R0-T3-ground-truth-v1",
      taskId: task.taskId,
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
    };
    writeJson(join(output, `private/ground-truth/${task.taskId}.json`), groundTruth);
    const vemContext = {
      schemaVersion: "R0-T3-vem-context-v1",
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
      limitations: ["RECOVERY_ONLY", "NO_PRODUCT_HOLDOUT_STATUS"],
    };
    writeJson(
      join(output, `participant/vem-context/${task.taskId}.json`),
      vemContext,
    );
    manifestTasks.push({
      taskId: task.taskId,
      taskClass: "recovery-only-not-product-holdout",
      armOrder: task.armOrder,
      promptHash,
      fixtureHash: canonicalSha256(R0_FIXTURE_FILES),
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
        schemaVersion: "R0-T3-capsule-proof-v1",
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
    schemaVersion: "R0-T3-task-manifest-v1",
    decisionKey: "R0-RECOVERY",
    decisionAttempt: 1,
    taskBank: "recovery-only-not-product-holdout",
    model: R0_MODEL,
    contextPolicy: "one-codex-exec-ephemeral-process-per-arm",
    cachePolicy: "fresh-tmpfs-codex-home-per-arm-counterbalanced-order",
    promptPolicy: "identical-within-task-pair",
    toolPolicy: "same-read-only-capsule-and-no-web-within-task-pair",
    setupCostPolicy: "prepare-and-capsule-setup-reported-separately",
    groundTruthPolicy: "evaluator-only-never-copied-to-participant-capsule",
    productHoldoutPolicy: "P1-P3-P4-holdouts-excluded-and-untouched",
    timingPolicy: {
      source: "trusted-outer-runner-receipt-ledger",
      clock: "node:process.hrtime.bigint",
      unit: "nanoseconds-decimal-string",
      start: "process-spawned-receipt",
      end: "process-exited-receipt",
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
  writeJson(join(output, "inputs/runner-contract.json"), {
    schemaVersion: "R0-T3-runner-contract-v1",
    runner: "scripts/pilot/r0-t4.mjs",
    invocation: "one async child process per arm through the hash-bound bubblewrap capsule",
    rawEvidence: ["stdout.jsonl", "stderr.txt", "receipt-ledger.json", "run.json"],
    terminalPolicy: "successful exit requires exactly one structured response and complete ledger",
    authorizationPolicy: "separate hash-bound owner authorization required before any run",
    resultPolicy: "new R0-T4 evidence root; preregistration root remains read-only",
  });

  const prepareDurationNs = (process.hrtime.bigint() - startedAt).toString();
  writeJson(join(output, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "R0-T3-prepare-setup-cost-v1",
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
  const fixtureHash = canonicalSha256(R0_FIXTURE_FILES);
  const plan = {
    schemaVersion: "R0-T3-preregistered-recovery-plan-v1",
    decisionKey: "R0-RECOVERY",
    decisionAttempt: 1,
    doesNotSupersede: "P0-VALUE",
    p0TerminalState: { phase: "P0", status: "failed", attempt: "P0-T17D", verdict: "stop" },
    preregistrationHashAlgorithm: "sha256-canonical-file-manifest",
    taskCount: manifestTasks.length,
    runCount: manifestTasks.length * 2,
    taskBank: "recovery-only-not-product-holdout",
    taskIds: manifestTasks.map((task) => task.taskId),
    taskManifestHash: canonicalSha256(taskManifest),
    fixtureHash,
    fixtureDistinctFromP0: Object.values(R0_FIXTURE_FILES).every((body) => (
      ![
        sha256(readFileSync(join(
          P0_ATTEMPT_TWO_ROOT,
          "fixture/packages/demo-fixture/src/App.tsx",
        ))),
        sha256(readFileSync(join(
          P0_ATTEMPT_TWO_ROOT,
          "fixture/packages/demo-fixture/src/fixtures.ts",
        ))),
      ].includes(sha256(body))
    )),
    p0TaskIdsExcluded: p0TaskIds,
    p0PromptHashesExcluded: p0PromptHashes,
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
    model: R0_MODEL,
    sourceBindings: runtimeBindings,
    preparationSourceHash: sha256(readFileSync(SCRIPT_PATH)),
    instrumentationHash,
    verdictRuleHash: canonicalSha256(R0_VERDICT_RULE),
    thresholdPolicy: R0_VERDICT_RULE,
    externalExecutionAuthorized: false,
    nextAuthorization: "explicit-owner-authorization-for-R0-T4-after-this-hash-is-frozen",
    limitations: [
      "RECOVERY_ONLY_ENGINEERING_SMOKE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_P0_OR_PRODUCT_UNLOCK",
      "NO_EXTERNAL_MODEL_CALL_IN_R0_T3",
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

function verifyImmutableP0Inputs() {
  for (const root of [P0_ATTEMPT_ONE_ROOT, P0_ATTEMPT_TWO_ROOT]) {
    requireDirectory(root, "R0_T3_P0_EVIDENCE_MISSING");
  }
  const attemptTwoPlan = readJson(join(P0_ATTEMPT_TWO_ROOT, "PREREGISTRATION.json"));
  if (attemptTwoPlan.decisionKey !== "P0-VALUE"
    || attemptTwoPlan.decisionAttempt !== 2
    || attemptTwoPlan.attemptOneDisposition !== "immutable-adjust") {
    throw new Error("R0_T3_P0_CHAIN_INVALID");
  }
  const verdict = readJson(join(P0_ATTEMPT_TWO_ROOT, "results/verdict.json"));
  if (verdict.verdict !== "stop") throw new Error("R0_T3_P0_CHAIN_INVALID");
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
      if (entry.isSymbolicLink()) throw new Error("R0_T3_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R0_T3_NON_REGULAR_FILE_REJECTED");
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
      "USAGE: node scripts/pilot/r0-t3.mjs prepare <output-root>",
    );
  }
  const result = prepareR0RecoveryPreregistration({
    outputRoot: process.argv[3],
  });
  process.stdout.write(`${canonicalJson(result)}\n`);
}
