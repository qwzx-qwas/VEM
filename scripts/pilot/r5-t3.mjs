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
  runR3PermissionProfileProbe,
} from "./r3-capsule.mjs";
import {
  buildR5Prompt,
  R5_DESTINATION,
  R5_FIXTURE_FILES,
  R5_MODEL,
  R5_RESPONSE_SCHEMA,
  R5_TASKS,
  R5_TERMINATION_POLICY,
  R5_VERDICT_RULE,
} from "./r5-recovery-plan.mjs";
import { R5_RUNTIME_SOURCE_PATHS } from "./r5-t4.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R5-T3");
const FIXTURE_FILE = "packages/demo-fixture/src/App.tsx";
const REGISTRY_REVISION = "r5-process-tree-termination-registry-v1";
const PRIOR_ROOTS = Object.freeze([
  {
    id: "P0-T17B",
    root: "docs/test-evidence/P0-T17B/20260729T171610+0800",
    hash: "2bf456e2220cf61fb78c97c1854d6575847d783b66404ba3db3746380573b1bb",
  },
  {
    id: "P0-T17D",
    root: "docs/test-evidence/P0-T17D/20260729T174733+0800",
    hash: "df5859bc0af40b0daca4f2ea8b6030e8d2b950228595595a29aba8976fc70d93",
  },
  {
    id: "R0-T3",
    root: "docs/test-evidence/R0-T3/20260729T193158+0800",
    hash: "57fb4b9b033e61eb4e0b4b9a0f14ced28064b6fb17d73f5e7ae60552d0f37359",
  },
  {
    id: "R1-T3",
    root: "docs/test-evidence/R1-T3/20260729T203631+0800",
    hash: "8d93104c915fdb0acce9f31bdf7c34bbc4d19f0ac74e1b2609a10ddce35ca7f1",
  },
  {
    id: "R2-T3",
    root: "docs/test-evidence/R2-T3/20260729T225128+0800",
    hash: "dddd48ade2a92b2e12ec7600c9cdc0bd65eee6d47023d01d70b8bd71b47c273a",
  },
  {
    id: "R3-T3",
    root: "docs/test-evidence/R3-T3/20260730T114932+0800",
    hash: "8b886d443c576540f6b3b2d90e06abfd95d57955f696680dd998b748d4ffdd5b",
  },
  {
    id: "R4-T3",
    root: "docs/test-evidence/R4-T3/20260730T143215-0800",
    hash: "0ddb8c6f51d140042167231a22f8b3f73735fc8d0e271e3da5f11590c9995104",
  },
]);
const TERMINAL_INPUTS = Object.freeze({
  p0: {
    phase: "P0",
    attempt: "P0-T17D",
    verdictHash:
      "38d1dd20b591baadaed2ba4b2ebd93723706387133e366370e62c7f431ee336a",
    hashAlgorithm: "raw-file-sha256",
    path:
      "docs/test-evidence/P0-T17D/20260729T174733+0800/results/verdict.json",
  },
  r0: {
    phase: "R0",
    attempt: "R0-T4",
    verdictHash:
      "5815559a6d2b8d9c71246067a4befefe97f375edb476ffd479ee56c07978e38b",
    hashAlgorithm: "raw-file-sha256",
    path:
      "docs/test-evidence/R0-T4/20260729T194719+0800/verdict.json",
  },
  r1: {
    phase: "R1",
    attempt: "R1-T4",
    verdictHash:
      "a0a9556a63d68fcbe769da96f140e54d1d966421d0c3bad1cbffca1f24ab9baa",
    hashAlgorithm: "raw-file-sha256",
    path:
      "docs/test-evidence/R1-T4/20260729T213524+0800/results/verdict.json",
  },
  r2: {
    phase: "R2",
    attempt: "R2-T4",
    verdictHash:
      "ada1fb7e4c4ae202060a5e98e00dafedecfd4862803c61bab1970d7e30d681e1",
    hashAlgorithm: "raw-file-sha256",
    path:
      "docs/test-evidence/R2-T4/20260729T230343+0800/results/verdict.json",
  },
  r3: {
    phase: "R3",
    attempt: "R3-T4",
    verdictHash:
      "7a3e5b6bf94067e4681258982690afe911c51dc3da0e6cc4af66d069d537d95b",
    hashAlgorithm: "canonical-json-sha256",
    path:
      "docs/test-evidence/R3-T4/20260730T133111-0800/results/verdict.json",
  },
});
const R4_BLOCKED_INPUT = Object.freeze({
  phase: "R4",
  task: "R4-T4",
  status: "blocked",
  decision: "pending",
  incidentHash:
    "95021eac99d93d49985ee46d003a4108ff7a524244d83e3521b8edff8ecffd70",
  path:
    "docs/test-evidence/R4-T4/20260730T144143-0800/results/interruption.json",
});
const PARTICIPANT_DATA_PATHS = Object.freeze([
  "prompt.txt",
  "packages/demo-fixture/src/App.tsx",
  "packages/demo-fixture/src/fixtures.ts",
  ".pilot/response-schema.json",
  ".pilot/vem-context.json (vem-assisted only)",
]);

export function prepareR5RecoveryPreregistration({
  outputRoot,
  runProbes = true,
  enforceEvidenceParent = true,
  permissionProbeRunner = runR3PermissionProfileProbe,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)
    || typeof permissionProbeRunner !== "function") {
    throw new Error("R5_T3_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R5_T3_OUTPUT_PARENT_INVALID",
  );
  verifyPriorInputs();
  const prior = collectPriorTasks();
  const terminalInputs = verifyTerminalInputs();
  const blockedInput = verifyBlockedInput();
  const startedAt = process.hrtime.bigint();
  mkdirSync(output, { mode: 0o700 });
  for (const [path, body] of Object.entries(R5_FIXTURE_FILES)) {
    writeText(join(output, "fixture", path), body);
  }
  writeJson(join(output, "inputs/response-schema.json"), R5_RESPONSE_SCHEMA);
  writeJson(
    join(output, "inputs/termination-policy.json"),
    R5_TERMINATION_POLICY,
  );
  writeJson(join(output, "private/verdict-rule.json"), R5_VERDICT_RULE);
  const priorAudit = readJson(join(
    REPO_ROOT,
    "docs/test-evidence/R4-T3/20260730T143215-0800/"
      + "private/audit-content-needles.json",
  ));
  writeJson(join(output, "private/audit-content-needles.json"), {
    schemaVersion: "R5-T3-audit-content-needles-v1",
    participantVisible: false,
    inheritedSemantics: "R3-v3-auditor-via-R4",
    sourceHash: canonicalSha256(priorAudit),
    needles: priorAudit.needles,
  });
  writeJson(join(output, "private/prior-task-exclusion.json"), {
    schemaVersion: "R5-T3-prior-task-exclusion-v1",
    sourceAttempts: PRIOR_ROOTS.map((entry) => entry.id),
    taskIds: prior.taskIds,
    promptHashes: prior.promptHashes,
    consumedAsParticipantTasks: false,
  });
  const holdoutPath = join(
    REPO_ROOT,
    "docs/test-evidence/P0-T17D/20260729T174733+0800/"
      + "private/later-holdout-exclusion.json",
  );
  const holdout = readJson(holdoutPath);
  writeJson(join(output, "private/product-holdout-exclusion.json"), {
    schemaVersion: "R5-T3-product-holdout-exclusion-v1",
    sourceAttempt: "P0-T17D",
    sourceHash: sha256(readFileSync(holdoutPath)),
    taskIds: holdout.taskIds,
    consumed: false,
    remediationTasksAreProductHoldouts: false,
  });

  const source = R5_FIXTURE_FILES[FIXTURE_FILE];
  const transformed = transformIntrinsicJsx({
    code: source,
    filename: join(output, "fixture", FIXTURE_FILE),
    relativeFile: FIXTURE_FILE,
    sourceRegistryRevision: REGISTRY_REVISION,
  });
  writeJson(join(output, "inputs/source-registry.json"), {
    schemaVersion: "R5-T3-source-registry-v1",
    sourceRegistryRevision: REGISTRY_REVISION,
    records: transformed.records,
  });

  const tasks = [];
  const capsuleBindings = [];
  for (const task of R5_TASKS) {
    const line = source.split("\n").findIndex((value) => (
      value.includes(task.marker)
    )) + 1;
    const record = transformed.records.find((value) => (
      value.relativeFile === FIXTURE_FILE
        && value.intrinsicTag === task.tagName
        && value.line === line
    ));
    if (record === undefined) throw new Error("R5_T3_SOURCE_RECORD_MISSING");
    const prompt = `${buildR5Prompt(task.description)}\n`;
    const promptHash = sha256(prompt);
    if (prior.taskIds.includes(task.taskId)
      || prior.promptHashes.includes(promptHash)
      || holdout.taskIds.includes(task.taskId)) {
      throw new Error("R5_T3_TASK_BANK_NOT_FRESH");
    }
    writeText(join(
      output,
      `participant/tasks/${task.taskId}/prompt.txt`,
    ), prompt);
    const groundTruth = {
      schemaVersion: "R5-T3-ground-truth-v1",
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
      schemaVersion: "R5-T3-vem-context-v1",
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
        "PROCESS_TERMINATION_REMEDIATION_ONLY",
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
        schemaVersion: "R5-T3-capsule-proof-v1",
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
      taskClass: "r5-process-termination-only-not-product-holdout",
      armOrder: task.armOrder,
      promptHash,
      fixtureHash: canonicalSha256(R5_FIXTURE_FILES),
      expectedRelativeFile: record.relativeFile,
      expectedLine: record.line,
      expectedSourceAnchorId: record.sourceAnchorId,
      groundTruthHash: canonicalSha256(groundTruth),
      vemContextHash: canonicalSha256(vemContext),
    });
  }

  const manifest = {
    schemaVersion: "R5-T3-task-manifest-v1",
    decisionKey: "R5-RECOVERY",
    decisionAttempt: 1,
    model: R5_MODEL,
    destination: R5_DESTINATION,
    taskBank: "r5-process-termination-only-not-product-holdout",
    contextPolicy: "fresh-process-group-per-attempt",
    promptPolicy: "identical-within-task-pair-and-provider-timeout-retry",
    terminationPolicy: R5_TERMINATION_POLICY,
    tasks,
  };
  writeJson(join(output, "inputs/task-manifest.json"), manifest);
  writeJson(join(output, "inputs/attempt-classification-contract.json"), {
    schemaVersion: "R5-T3-attempt-classification-contract-v1",
    retryable:
      ["external-transport-timeout-before-response"],
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
    schemaVersion: "R5-T3-failure-evidence-contract-v1",
    perAttemptRawFinalBoundaryTerminationLedgerErrorAndHashes: true,
    processTreeMustBeEmptyBeforeRetryOrNextArm: true,
    laterSuccessMayNotOverwriteFailure: true,
    batchPolicy: R5_VERDICT_RULE.batchPolicy,
  });
  writeJson(join(output, "inputs/runner-contract.json"), {
    schemaVersion: "R5-T3-runner-contract-v1",
    runner: "scripts/pilot/r5-t4.mjs",
    terminalizer: "scripts/pilot/r5-process-terminalizer.mjs",
    classifier: "scripts/pilot/r5-attempt-policy.mjs",
    authoritativeResponse: "codex-output-last-message-runner-owned-file",
    participantWorkspaceWritable: false,
    generatedCommandAuthAccess: "deny",
    generatedCommandNetwork: "disabled",
    deadlineStartsAt: "participant-process-spawn",
    processBoundary: "detached-process-group-tree",
    terminationPolicy: R5_TERMINATION_POLICY,
  });

  const sourceBindings = Object.fromEntries(
    R5_RUNTIME_SOURCE_PATHS.map((path) => [
      path,
      sha256(readFileSync(join(REPO_ROOT, path))),
    ]),
  );
  const participantDataPaths = [...PARTICIPANT_DATA_PATHS];
  const dataScopeHash = canonicalSha256({
    destination: R5_DESTINATION,
    model: R5_MODEL,
    participantFiles: participantDataPaths,
    terminationPolicy: R5_TERMINATION_POLICY,
  });
  const prepareDurationNs = (
    process.hrtime.bigint() - startedAt
  ).toString();
  writeJson(join(output, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "R5-T3-prepare-setup-cost-v1",
    totalPrepareSetupDurationNs: prepareDurationNs,
    excludedFromPerArmDuration: true,
  });
  const plan = {
    schemaVersion: "R5-T3-preregistered-recovery-plan-v1",
    decisionKey: "R5-RECOVERY",
    decisionAttempt: 1,
    doesNotSupersede: "R4-RECOVERY",
    alsoDoesNotSupersede: [
      "R3-RECOVERY",
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
      "P0-VALUE",
    ],
    taskCount: 5,
    successfulArmCount: 10,
    maxRetriesPerArm: R5_TERMINATION_POLICY.maxRetriesPerArm,
    maxProcessAttempts: R5_TERMINATION_POLICY.maxProcessAttempts,
    model: R5_MODEL,
    destination: R5_DESTINATION,
    participantDataPaths,
    dataScopeHash,
    terminationPolicy: R5_TERMINATION_POLICY,
    terminationPolicyHash: canonicalSha256(R5_TERMINATION_POLICY),
    instrumentationHash: canonicalSha256(sourceBindings),
    sourceBindings,
    preparationSourceHash: sha256(readFileSync(SCRIPT_PATH)),
    taskManifestHash: canonicalSha256(manifest),
    verdictRuleHash: canonicalSha256(R5_VERDICT_RULE),
    capsuleBaseHashes: capsuleBindings,
    blockedInput,
    terminalInputs,
    priorPreregistrationHashes: Object.fromEntries(
      PRIOR_ROOTS.map((entry) => [entry.id, entry.hash]),
    ),
    groundTruthParticipantVisible: false,
    productHoldoutConsumed: false,
    externalExecutionAuthorized: false,
    productUnlockCount: 0,
    preregistrationHashAlgorithm: "sha256-canonical-file-manifest",
    nextAuthorization:
      "owner-must-bind-full-hash-destination-data-scope-deadline-grace-signals-and-max-twenty-process-attempts",
    limitations: [
      "PROCESS_TERMINATION_RECOVERY_ENGINEERING_SMOKE",
      "RUNNER_DEADLINE_TERMINATION_IS_NOT_PROVIDER_TURN_FAILED",
      "RUNNER_DEADLINE_TERMINATION_IS_NOT_RETRYABLE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_R4_OR_PRIOR_STOP_OR_PRODUCT_UNLOCK",
      "NO_EXTERNAL_MODEL_CALL_IN_R5_T3",
    ],
  };
  writeJson(join(output, "PREREGISTRATION.json"), plan);
  const digest = preregistrationDigest(output);
  writeText(join(output, "PREREGISTRATION.sha256"), `${digest}\n`);
  return Object.freeze({
    ok: true,
    taskId: "R5-T3",
    taskCount: 5,
    successfulArmCount: 10,
    maxProcessAttempts: R5_TERMINATION_POLICY.maxProcessAttempts,
    localProbeCount: runProbes ? 30 : 0,
    preregistrationHash: digest,
    instrumentationHash: plan.instrumentationHash,
    dataScopeHash,
    terminationPolicyHash: plan.terminationPolicyHash,
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

function verifyPriorInputs() {
  for (const entry of PRIOR_ROOTS) {
    const actual = readFileSync(
      join(REPO_ROOT, entry.root, "PREREGISTRATION.sha256"),
      "utf8",
    ).trim();
    if (actual !== entry.hash) throw new Error("R5_T3_PRIOR_PREREG_CHANGED");
  }
}

function verifyTerminalInputs() {
  return Object.fromEntries(Object.entries(TERMINAL_INPUTS).map(
    ([key, input]) => {
      const path = join(REPO_ROOT, input.path);
      const raw = readFileSync(path);
      const verdict = JSON.parse(raw.toString("utf8"));
      const actualHash = input.hashAlgorithm === "raw-file-sha256"
        ? sha256(raw)
        : canonicalSha256(verdict);
      if (actualHash !== input.verdictHash
        || verdict.verdict !== "stop") {
        throw new Error("R5_T3_TERMINAL_INPUT_CHANGED");
      }
      return [key, {
        phase: input.phase,
        attempt: input.attempt,
        status: "failed",
        verdict: "stop",
        verdictHash: input.verdictHash,
        hashAlgorithm: input.hashAlgorithm,
      }];
    },
  ));
}

function verifyBlockedInput() {
  const path = join(REPO_ROOT, R4_BLOCKED_INPUT.path);
  const value = readJson(path);
  if (canonicalSha256(value) !== R4_BLOCKED_INPUT.incidentHash
    || value.taskId !== R4_BLOCKED_INPUT.task
    || value.taskState !== R4_BLOCKED_INPUT.status
    || value.decision !== R4_BLOCKED_INPUT.decision
    || value.evidenceSealed !== false) {
    throw new Error("R5_T3_BLOCKED_INPUT_CHANGED");
  }
  return {
    ...R4_BLOCKED_INPUT,
    evidenceSealed: false,
  };
}

function collectPriorTasks() {
  const taskIds = new Set();
  const promptHashes = new Set();
  for (const entry of PRIOR_ROOTS) {
    const root = join(REPO_ROOT, entry.root);
    const candidates = collectFiles(root).filter((file) => (
      file.relativePath.endsWith("task-manifest.json")
    ));
    for (const candidate of candidates) {
      const manifest = readJson(candidate.absolutePath);
      for (const task of manifest.tasks ?? []) {
        if (typeof task.taskId === "string") taskIds.add(task.taskId);
        if (/^[a-f0-9]{64}$/u.test(task.promptHash ?? "")) {
          promptHashes.add(task.promptHash);
        }
      }
    }
  }
  return {
    taskIds: [...taskIds].sort(),
    promptHashes: [...promptHashes].sort(),
  };
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R5_T3_UNSAFE_NODE");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(root, absolutePath).replaceAll("\\", "/"),
        });
      } else throw new Error("R5_T3_UNSAFE_NODE");
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
    throw new Error("USAGE: node scripts/pilot/r5-t3.mjs <output-root>");
  }
  process.stdout.write(`${canonicalJson(prepareR5RecoveryPreregistration({
    outputRoot: process.argv[2],
  }))}\n`);
}
