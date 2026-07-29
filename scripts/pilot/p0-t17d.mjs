import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
  VersionedReadOnlyPilotHarness,
} from "../../packages/pilot-harness/dist/index.js";
import {
  assertIntendedCapsuleDifference,
  auditCodexJsonl,
  buildCodexCapsuleInvocation,
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import {
  evaluatePilot,
  isPreregistrationExcludedPath,
  responseToLocatedSource,
} from "./p0-t17b.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const ATTEMPT_ONE_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17B/20260729T171610+0800",
);
const REMEDIATION_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17C/20260729T173959+0800",
);
const CAPSULE_PATH = join(SCRIPT_DIR, "capsule.mjs");
const ATTEMPT_ONE_RUNNER_PATH = join(SCRIPT_DIR, "p0-t17b.mjs");
const MODEL = "gpt-5.6-sol";
const TASK_IDS = Object.freeze([
  "ux-01-manifest-row",
  "ux-02-email-input",
  "ux-03-safe-route",
  "ux-04-prompt-data",
  "ux-05-raw-error",
]);

export function attemptTwoArmOrder(attemptOneOrder) {
  if (!Array.isArray(attemptOneOrder)
    || attemptOneOrder.length !== 2
    || new Set(attemptOneOrder).size !== 2
    || !attemptOneOrder.includes("direct-search")
    || !attemptOneOrder.includes("vem-assisted")) {
    throw new Error("P0_T17D_ATTEMPT_ONE_ARM_ORDER_INVALID");
  }
  return Object.freeze([attemptOneOrder[1], attemptOneOrder[0]]);
}

export function evaluateAttemptTwo({ runs, bundle, setupDurationNs }) {
  const base = evaluatePilot({ runs, bundle, setupDurationNs });
  const capsuleStopReasons = [];
  if (runs.some((run) => run.capsuleAudit !== "passed")) {
    capsuleStopReasons.push("capsule-integrity-failed");
  }
  if (runs.some((run) => run.attemptChainValid !== true)) {
    capsuleStopReasons.push("attempt-chain-changed");
  }
  if (capsuleStopReasons.length === 0) {
    return {
      ...base,
      schemaVersion: "P0-T17D-verdict-v1",
      decisionAttempt: 2,
      supersedesAttempt: "P0-T17B",
      capsuleStopReasons,
    };
  }
  return {
    ...base,
    schemaVersion: "P0-T17D-verdict-v1",
    decisionAttempt: 2,
    supersedesAttempt: "P0-T17B",
    verdict: "stop",
    stopReasons: [...base.stopReasons, ...capsuleStopReasons],
    capsuleStopReasons,
  };
}

function prepare(outputRoot) {
  requireEvidenceOutputRoot(outputRoot);
  if (existsSync(outputRoot)) throw new Error("P0_T17D_OUTPUT_EXISTS");
  verifyAttemptChain();
  const setupStartedAt = process.hrtime.bigint();
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });

  for (const path of [
    "fixture/packages/demo-fixture/src/App.tsx",
    "fixture/packages/demo-fixture/src/fixtures.ts",
    "inputs/response-schema.json",
    "inputs/source-registry.json",
    "private/later-holdout-exclusion.json",
    "private/verdict-rule.json",
  ]) {
    copyInput(ATTEMPT_ONE_ROOT, path, outputRoot, path);
  }
  for (const taskId of TASK_IDS) {
    for (const path of [
      `inputs/selections/${taskId}.json`,
      `private/ground-truth/${taskId}.json`,
      `participant/tasks/${taskId}/prompt.txt`,
      `participant/vem-context/${taskId}.json`,
    ]) {
      copyInput(ATTEMPT_ONE_ROOT, path, outputRoot, path);
    }
  }

  const attemptOneManifest = readJson(join(ATTEMPT_ONE_ROOT, "inputs/task-manifest.json"));
  const taskManifest = {
    ...attemptOneManifest,
    pilotPlanVersion: "P0-T17D-UX-GATE-001-attempt-2-v1",
    taskManifestVersion: "P0-T17D-task-manifest-v1",
    tasks: attemptOneManifest.tasks.map((task) => ({
      ...task,
      armOrder: attemptTwoArmOrder(task.armOrder),
      selectionInput: fileReference(outputRoot, task.selectionInput.path),
      sourceRegistryInput: fileReference(outputRoot, "inputs/source-registry.json"),
      groundTruthHash: fileReference(
        outputRoot,
        `private/ground-truth/${task.taskId}.json`,
      ).sha256,
    })),
    laterHoldoutExclusion: fileReference(outputRoot, "private/later-holdout-exclusion.json"),
  };
  writeJson(join(outputRoot, "inputs/task-manifest.json"), taskManifest);

  const prepareSetupDurationNs = (process.hrtime.bigint() - setupStartedAt).toString();
  writeJson(join(outputRoot, "inputs/prepare-setup-cost.json"), {
    schemaVersion: "P0-T17D-prepare-setup-cost-v1",
    totalPrepareSetupDurationNs: prepareSetupDurationNs,
    allocationPolicy: "integer-division-total-by-five-plus-per-task-capsule-setup",
    includes: "attempt-chain-input-copy-plan-and-hash-generation",
    excludes: "capsule-materialization-and-codex-source-location-time",
  });

  const plan = {
    schemaVersion: "P0-T17D-preregistered-plan-v1",
    decisionKey: "P0-VALUE",
    decisionAttempt: 2,
    supersedesAttempt: "P0-T17B",
    attemptOneDisposition: "immutable-adjust",
    attemptOnePreregistrationHash: readFileSync(
      join(ATTEMPT_ONE_ROOT, "PREREGISTRATION.sha256"),
      "utf8",
    ).trim(),
    attemptOneResultManifestHash: sha256(readFileSync(join(ATTEMPT_ONE_ROOT, "RESULTS.sha256"))),
    attemptOneCanonicalBundleHash: readJson(join(
      ATTEMPT_ONE_ROOT,
      "results/canonical-evidence-bundle.meta.json",
    )).contentHash,
    remediationEvidenceManifestHash: sha256(readFileSync(join(REMEDIATION_ROOT, "SHA256SUMS"))),
    runnerSha256: sha256(readFileSync(SCRIPT_PATH)),
    capsuleSha256: sha256(readFileSync(CAPSULE_PATH)),
    attemptOneRunnerSha256: sha256(readFileSync(ATTEMPT_ONE_RUNNER_PATH)),
    verdictRuleHash: canonicalSha256(readJson(join(outputRoot, "private/verdict-rule.json"))),
    taskCount: TASK_IDS.length,
    taskIdentity: "disclosed-attempt-one-retest-set",
    laterHoldoutConsumed: false,
    armOrder: taskManifest.tasks.map(({ taskId, armOrder }) => ({ taskId, armOrder })),
    counterbalancePolicy: "reverse-each-attempt-one-pair-order",
    model: MODEL,
    contextPolicy: "one-codex-exec-ephemeral-process-per-arm",
    capsulePolicy: {
      provider: "linux-bubblewrap",
      workspaceMount: "/work:ro",
      repositoryMount: "absent",
      codexHome: "tmpfs",
      auth: "runtime-readonly-mount-not-copied-or-recorded",
      innerCodexSandbox: "read-only",
      allowedArmDifference: "vem-context.json-only",
      commandEventAudit: "fail-closed-on-external-path-or-rule-skill-marker",
    },
    promptIdentity: "same-preregistered-prompt-within-each-pair",
    fixtureIdentity: "same-attempt-one-fixture-commit",
    timingBoundary: taskManifest.timingBoundary,
    setupCostBoundary: {
      prepare: "separate-before-run",
      capsule: "separate-before-each-task-pair",
      location: "spawn-to-final-structured-response",
    },
    verdictPolicy: "same-attempt-one-threshold-plus-capsule-integrity-stop",
    limitations: [
      "ENGINEERING_SMOKE_ONLY",
      "DISCLOSED_RETEST_SET",
      "NO_LATER_HOLDOUT_USE",
      "NO_STATISTICAL_PRODUCT_CLAIM",
    ],
  };
  writeJson(join(outputRoot, "PREREGISTRATION.json"), plan);
  const digest = preregistrationDigest(outputRoot);
  writeText(join(outputRoot, "PREREGISTRATION.sha256"), `${digest}\n`);
  console.log(JSON.stringify({
    ok: true,
    outputRoot,
    preregistrationHash: digest,
    runnerSha256: plan.runnerSha256,
    capsuleSha256: plan.capsuleSha256,
    prepareSetupDurationNs,
    attemptTwoExecuted: false,
  }));
}

function run(outputRoot) {
  const preregistrationHash = verifyPreregistration(outputRoot);
  verifyAttemptChain();
  const plan = readJson(join(outputRoot, "PREREGISTRATION.json"));
  if (sha256(readFileSync(SCRIPT_PATH)) !== plan.runnerSha256
    || sha256(readFileSync(CAPSULE_PATH)) !== plan.capsuleSha256
    || sha256(readFileSync(ATTEMPT_ONE_RUNNER_PATH)) !== plan.attemptOneRunnerSha256) {
    throw new Error("P0_T17D_BOUND_SOURCE_CHANGED");
  }
  const resultsRoot = join(outputRoot, "results");
  if (existsSync(resultsRoot)) throw new Error("P0_T17D_RESULTS_ALREADY_EXIST");
  mkdirSync(resultsRoot, { recursive: true, mode: 0o700 });

  const manifest = readJson(join(outputRoot, "inputs/task-manifest.json"));
  const publication = readJson(join(outputRoot, "inputs/source-registry.json"));
  const prepareSetup = readJson(join(outputRoot, "inputs/prepare-setup-cost.json"));
  const attemptChainValid = true;
  const runs = [];
  const trialReferences = [];
  const groundTruthReferences = [];
  let totalCapsuleSetupNs = 0n;
  for (const task of manifest.tasks) {
    const groundTruthPath = `private/ground-truth/${task.taskId}.json`;
    const groundTruth = readJson(join(outputRoot, groundTruthPath));
    const prompt = readFileSync(
      join(outputRoot, `participant/tasks/${task.taskId}/prompt.txt`),
      "utf8",
    ).trimEnd();
    const capsuleSetupStartedAt = process.hrtime.bigint();
    const directCapsule = createParticipantCapsule({
      sourceRoot: join(outputRoot, "fixture"),
      taskId: task.taskId,
      arm: "direct-search",
      responseSchemaPath: join(outputRoot, "inputs/response-schema.json"),
    });
    let vemCapsule;
    let capsuleSetupDurationNs;
    const arms = [];
    try {
      vemCapsule = createParticipantCapsule({
        sourceRoot: join(outputRoot, "fixture"),
        taskId: task.taskId,
        arm: "vem-assisted",
        responseSchemaPath: join(outputRoot, "inputs/response-schema.json"),
        vemContextPath: join(outputRoot, `participant/vem-context/${task.taskId}.json`),
      });
      const capsuleDifference = assertIntendedCapsuleDifference(
        directCapsule.manifest,
        vemCapsule.manifest,
      );
      capsuleSetupDurationNs = process.hrtime.bigint() - capsuleSetupStartedAt;
      totalCapsuleSetupNs += capsuleSetupDurationNs;
      for (let index = 0; index < task.armOrder.length; index += 1) {
        const arm = task.armOrder[index];
        const capsule = arm === "direct-search" ? directCapsule : vemCapsule;
        const runId = `${task.taskId}-${index + 1}-${arm}`;
        const runRoot = join(resultsRoot, "runs", runId);
        mkdirSync(runRoot, { recursive: true, mode: 0o700 });
        const invocation = buildCodexCapsuleInvocation({
          capsule,
          prompt,
          model: MODEL,
          authFile: join(homedir(), ".codex/auth.json"),
        });
        const startedAt = process.hrtime.bigint();
        const result = spawnSync(invocation.executable, invocation.args, {
          cwd: invocation.cwd,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });
        const endedAt = process.hrtime.bigint();
        writeText(join(runRoot, "stdout.jsonl"), result.stdout ?? "");
        writeText(join(runRoot, "stderr.txt"), result.stderr ?? "");
        const events = parseJsonLines(result.stdout ?? "");
        const threadId = events.find((event) => event.type === "thread.started")?.thread_id ?? null;
        const message = [...events].reverse().find((event) => (
          event.type === "item.completed" && event.item?.type === "agent_message"
        ))?.item?.text;
        const response = parseJsonValue(message);
        const locatedSource = responseToLocatedSource(response, publication.snapshot.records);
        const responseMatchesGroundTruth = locatedSource?.sourceAnchorId
            === groundTruth.expectedSourceAnchorId
          && locatedSource.relativeFile === groundTruth.expectedRelativeFile;
        let capsuleAudit = "passed";
        try {
          auditCodexJsonl({ jsonl: result.stdout ?? "", stderr: result.stderr ?? "" });
        } catch (error) {
          capsuleAudit = error instanceof Error ? error.message : "unknown-error";
        }
        const runRecord = {
          schemaVersion: "P0-T17D-codex-run-v1",
          runId,
          taskId: task.taskId,
          arm,
          armOrder: index + 1,
          command: [
            "bwrap",
            "<bound-readonly-capsule>",
            "codex",
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "-m", MODEL,
            "-s", "read-only",
            "<preregistered-prompt>",
          ],
          invocationEvidence: invocation.evidence,
          model: MODEL,
          exitCode: result.status,
          signal: result.signal,
          threadId,
          startedAtNs: startedAt.toString(),
          endedAtNs: endedAt.toString(),
          response,
          locatedSource,
          responseMatchesGroundTruth,
          capsuleAudit,
          baseContextHash: capsuleDifference.baseContextHash,
          treatmentHash: arm === "vem-assisted" ? capsuleDifference.vemContextHash : null,
          preregistrationHashChanged: verifyPreregistration(outputRoot) !== preregistrationHash,
          groundTruthVisible: false,
          holdoutConsumed: false,
          attemptChainValid,
        };
        writeJson(join(runRoot, "run.json"), runRecord);
        runs.push(runRecord);
        arms.push({
          arm,
          order: index + 1,
          startedAtNs: startedAt.toString(),
          endedAtNs: endedAt.toString(),
          locatedSource,
          directUnavailableReason: null,
          degradedCandidates: [],
          chosenCandidateRank: null,
          targetChanged: false,
          reselectionCount: 0,
          operatorCorrection: false,
        });
      }
    } finally {
      cleanupParticipantCapsule(directCapsule);
      if (vemCapsule !== undefined) cleanupParticipantCapsule(vemCapsule);
    }
    const taskSetupDurationNs = (
      BigInt(prepareSetup.totalPrepareSetupDurationNs) / BigInt(TASK_IDS.length)
        + capsuleSetupDurationNs
    ).toString();
    const trialPath = `results/trials/${task.taskId}.json`;
    writeJson(join(outputRoot, trialPath), {
      schemaVersion: "P0-T17A-trial-record-v1",
      taskId: task.taskId,
      timingBoundaryHash: canonicalSha256(manifest.timingBoundary),
      setupDurationNs: taskSetupDurationNs,
      arms,
    });
    trialReferences.push({ taskId: task.taskId, input: fileReference(outputRoot, trialPath) });
    groundTruthReferences.push({ taskId: task.taskId, input: fileReference(outputRoot, groundTruthPath) });
  }

  const harness = new VersionedReadOnlyPilotHarness({
    rootDir: outputRoot,
    readFixtureCommit: () => manifest.tasks[0].fixtureCommit,
  });
  const built = harness.build({
    taskManifest: fileReference(outputRoot, "inputs/task-manifest.json"),
    groundTruthRecords: groundTruthReferences,
    trialRecords: trialReferences,
  });
  writeText(join(resultsRoot, "canonical-evidence-bundle.json"), `${built.canonicalJson}\n`);
  writeJson(join(resultsRoot, "canonical-evidence-bundle.meta.json"), {
    contentHash: built.contentHash,
    schemaValidation: built.schemaValidation,
    summary: built.summary,
  });
  const totalSetupDurationNs = (
    BigInt(prepareSetup.totalPrepareSetupDurationNs) + totalCapsuleSetupNs
  ).toString();
  writeJson(join(resultsRoot, "setup-cost.json"), {
    schemaVersion: "P0-T17D-total-setup-cost-v1",
    prepareSetupDurationNs: prepareSetup.totalPrepareSetupDurationNs,
    capsuleSetupDurationNs: totalCapsuleSetupNs.toString(),
    totalSetupDurationNs,
  });
  const verdict = evaluateAttemptTwo({
    runs,
    bundle: built.bundle,
    setupDurationNs: totalSetupDurationNs,
  });
  writeJson(join(resultsRoot, "verdict.json"), verdict);
  writeJson(join(resultsRoot, "run-index.json"), {
    schemaVersion: "P0-T17D-run-index-v1",
    decisionAttempt: 2,
    supersedesAttempt: "P0-T17B",
    preregistrationHash,
    runIds: runs.map((run) => run.runId),
    threadIds: runs.map((run) => run.threadId),
    capsuleAudits: runs.map((run) => run.capsuleAudit),
    canonicalEvidenceBundleHash: built.contentHash,
    verdictHash: fileReference(outputRoot, "results/verdict.json").sha256,
  });
  const resultLines = collectFiles(resultsRoot).map((path) => (
    `${sha256(readFileSync(path))}  ${relative(outputRoot, path).replaceAll("\\", "/")}`
  ));
  writeText(join(outputRoot, "RESULTS.sha256"), `${resultLines.join("\n")}\n`);
  if (verifyPreregistration(outputRoot) !== preregistrationHash) {
    throw new Error("P0_T17D_PREREGISTRATION_CHANGED");
  }
  console.log(JSON.stringify({
    ok: true,
    verdict: verdict.verdict,
    metrics: verdict.metrics,
    capsuleStopReasons: verdict.capsuleStopReasons,
    preregistrationHash,
    canonicalEvidenceBundleHash: built.contentHash,
  }));
}

function verifyAttemptChain() {
  verifyHashManifest(ATTEMPT_ONE_ROOT, "RESULTS.sha256", join(ATTEMPT_ONE_ROOT, "results"));
  verifyHashManifest(REMEDIATION_ROOT, "SHA256SUMS", REMEDIATION_ROOT);
  const attemptOnePreregistration = readFileSync(
    join(ATTEMPT_ONE_ROOT, "PREREGISTRATION.sha256"),
    "utf8",
  ).trim();
  const attemptOneVerdict = readJson(join(ATTEMPT_ONE_ROOT, "results/verdict.json"));
  const remediation = readJson(join(REMEDIATION_ROOT, "summary.json"));
  if (attemptOnePreregistration
      !== "2bf456e2220cf61fb78c97c1854d6575847d783b66404ba3db3746380573b1bb"
    || attemptOneVerdict.verdict !== "adjust"
    || remediation.outcome !== "passed"
    || remediation.attemptTwoExecuted !== false) {
    throw new Error("P0_T17D_ATTEMPT_CHAIN_INVALID");
  }
}

function verifyHashManifest(root, manifestPath, coverageRoot) {
  const lines = readFileSync(join(root, manifestPath), "utf8").trim().split(/\r?\n/u);
  const listed = new Set();
  for (const line of lines) {
    const match = /^(?<hash>[a-f0-9]{64}) {2}(?<path>[A-Za-z0-9._~/-]{1,1024})$/u.exec(line);
    if (!match?.groups) throw new Error("P0_T17D_HASH_MANIFEST_INVALID");
    const path = match.groups.path;
    if (path.startsWith("/") || path.split("/").includes("..") || listed.has(path)) {
      throw new Error("P0_T17D_HASH_MANIFEST_INVALID");
    }
    const absolutePath = join(root, path);
    if (!existsSync(absolutePath)
      || !statSync(absolutePath).isFile()
      || sha256(readFileSync(absolutePath)) !== match.groups.hash) {
      throw new Error("P0_T17D_HASH_MANIFEST_MISMATCH");
    }
    listed.add(path);
  }
  const covered = collectFiles(coverageRoot)
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => path !== manifestPath);
  if (covered.length !== listed.size || covered.some((path) => !listed.has(path))) {
    throw new Error("P0_T17D_HASH_MANIFEST_COVERAGE_MISMATCH");
  }
}

function requireEvidenceOutputRoot(outputRoot) {
  const allowedParent = join(REPO_ROOT, "docs/test-evidence/P0-T17D");
  if (dirname(outputRoot) !== allowedParent) throw new Error("P0_T17D_OUTPUT_ROOT_INVALID");
}

function copyInput(sourceRoot, sourcePath, destinationRoot, destinationPath) {
  const source = join(sourceRoot, sourcePath);
  const destination = join(destinationRoot, destinationPath);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  cpSync(source, destination, { errorOnExist: true, force: false });
}

function fileReference(root, path) {
  return { path, sha256: sha256(readFileSync(join(root, path))) };
}

function preregistrationFiles(root) {
  return collectFiles(root)
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => !isPreregistrationExcludedPath(path))
    .sort();
}

function preregistrationDigest(root) {
  return sha256(preregistrationFiles(root)
    .map((path) => `${sha256(readFileSync(join(root, path)))}  ${path}\n`)
    .join(""));
}

function verifyPreregistration(root) {
  const expected = readFileSync(join(root, "PREREGISTRATION.sha256"), "utf8").trim();
  const actual = preregistrationDigest(root);
  if (expected !== actual) throw new Error("P0_T17D_PREREGISTRATION_CHANGED");
  return actual;
}

function collectFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    return entry.isFile() && statSync(path).isFile() ? [path] : [];
  }).sort();
}

function parseJsonLines(text) {
  return text.split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function parseJsonValue(value) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${canonicalJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
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

function main() {
  const [command, rawOutputRoot] = process.argv.slice(2);
  if (!["prepare", "run"].includes(command) || !rawOutputRoot) {
    throw new Error("USAGE: node scripts/pilot/p0-t17d.mjs <prepare|run> <evidence-root>");
  }
  const outputRoot = resolve(REPO_ROOT, rawOutputRoot);
  if (command === "prepare") prepare(outputRoot);
  else run(outputRoot);
}

if (process.argv[1] === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
