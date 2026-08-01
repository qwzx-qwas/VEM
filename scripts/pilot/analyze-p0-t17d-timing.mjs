import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replayAttemptTwoAudit } from "./replay-p0-t17d-audit-v2.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const TASK_EVIDENCE_ROOT = join(REPO_ROOT, "docs/test-evidence/P0-T17F");
const ACTIVE_AUDIT_REPLAY = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17E/20260729T182851+0800/replay.json",
);
const MAX_JSONL_BYTES = 16 * 1024 * 1024;
const MAX_EVENTS = 20_000;
const ARMS = Object.freeze(["direct-search", "vem-assisted"]);

export function analyzeRunEvents(jsonl) {
  if (typeof jsonl !== "string") throw new Error("P0_T17F_JSONL_INVALID");
  if (Buffer.byteLength(jsonl) > MAX_JSONL_BYTES) {
    throw new Error("P0_T17F_JSONL_TOO_LARGE");
  }
  const lines = jsonl.split(/\r?\n/u).filter(Boolean);
  if (lines.length > MAX_EVENTS) throw new Error("P0_T17F_EVENT_LIMIT");
  const events = lines.map((line) => {
    try {
      const event = JSON.parse(line);
      if (typeof event !== "object" || event === null || Array.isArray(event)) {
        throw new Error("not-object");
      }
      return event;
    } catch {
      throw new Error("P0_T17F_JSONL_INVALID");
    }
  });

  const threadEvents = events.filter(
    (event) => event.type === "thread.started" && typeof event.thread_id === "string",
  );
  const turnEvents = events.filter((event) => event.type === "turn.completed");
  if (threadEvents.length !== 1 || turnEvents.length !== 1) {
    throw new Error("P0_T17F_EVENT_CARDINALITY_INVALID");
  }

  const startedCommands = events.filter(
    (event) => event.type === "item.started"
      && event.item?.type === "command_execution",
  );
  const completedCommands = events.filter(
    (event) => event.type === "item.completed"
      && event.item?.type === "command_execution",
  );
  const startedIds = startedCommands.map((event) => event.item.id);
  const completedIds = completedCommands.map((event) => event.item.id);
  if (startedIds.some((id) => typeof id !== "string")
    || completedIds.some((id) => typeof id !== "string")
    || new Set(startedIds).size !== startedIds.length
    || new Set(completedIds).size !== completedIds.length
    || canonicalJson([...startedIds].sort()) !== canonicalJson([...completedIds].sort())
    || completedCommands.some((event) => !Number.isInteger(event.item.exit_code))) {
    throw new Error("P0_T17F_COMMAND_EVENTS_INVALID");
  }

  const usage = turnEvents[0].usage;
  const usageFields = [
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
  ];
  if (typeof usage !== "object" || usage === null
    || usageFields.some((field) => (
      !Number.isSafeInteger(usage[field]) || usage[field] < 0
    ))) {
    throw new Error("P0_T17F_USAGE_INVALID");
  }

  const eventTimestampAvailable = events.some((event) => (
    Object.hasOwn(event, "timestamp")
    || Object.hasOwn(event, "timestampNs")
    || Object.hasOwn(event, "startedAt")
    || Object.hasOwn(event, "completedAt")
  ));

  return {
    threadId: threadEvents[0].thread_id,
    eventCount: events.length,
    commandCount: completedCommands.length,
    failedCommandCount: completedCommands.filter(
      (event) => event.item.exit_code !== 0,
    ).length,
    commandOutputBytes: completedCommands.reduce(
      (total, event) => total + Buffer.byteLength(event.item.aggregated_output ?? ""),
      0,
    ).toString(),
    usage: {
      inputTokens: usage.input_tokens.toString(),
      cachedInputTokens: usage.cached_input_tokens.toString(),
      outputTokens: usage.output_tokens.toString(),
      reasoningOutputTokens: usage.reasoning_output_tokens.toString(),
    },
    eventTimestampAvailable,
  };
}

export function summarizePairs(runs) {
  if (!Array.isArray(runs) || runs.length !== 10) {
    throw new Error("P0_T17F_RUN_COUNT_INVALID");
  }
  const taskIds = [...new Set(runs.map((run) => run.taskId))].sort();
  if (taskIds.length !== 5) throw new Error("P0_T17F_TASK_COUNT_INVALID");
  const pairs = taskIds.map((taskId) => {
    const taskRuns = runs.filter((run) => run.taskId === taskId);
    const direct = taskRuns.find((run) => run.arm === "direct-search");
    const vem = taskRuns.find((run) => run.arm === "vem-assisted");
    if (taskRuns.length !== 2 || direct === undefined || vem === undefined
      || new Set(taskRuns.map((run) => run.armOrder)).size !== 2) {
      throw new Error("P0_T17F_PAIR_INVALID");
    }
    const directDuration = BigInt(direct.durationNs);
    const vemDuration = BigInt(vem.durationNs);
    const saving = directDuration - vemDuration;
    const first = taskRuns.find((run) => run.armOrder === 1);
    const second = taskRuns.find((run) => run.armOrder === 2);
    if (first === undefined || second === undefined) throw new Error("P0_T17F_ORDER_INVALID");
    return {
      taskId,
      directDurationNs: direct.durationNs,
      vemDurationNs: vem.durationNs,
      vemSavingNs: saving.toString(),
      fasterArm: saving > 0n
        ? "vem-assisted"
        : saving < 0n ? "direct-search" : "tie",
      firstArm: first.arm,
      secondArm: second.arm,
      secondArmFaster: BigInt(second.durationNs) < BigInt(first.durationNs),
    };
  });

  const directDurations = runs
    .filter((run) => run.arm === "direct-search")
    .map((run) => BigInt(run.durationNs));
  const vemDurations = runs
    .filter((run) => run.arm === "vem-assisted")
    .map((run) => BigInt(run.durationNs));
  return {
    pairs,
    directMedianNs: median(directDurations).toString(),
    vemMedianNs: median(vemDurations).toString(),
    vemFasterPairCount: pairs.filter((pair) => pair.fasterArm === "vem-assisted").length,
    secondArmFasterPairCount: pairs.filter((pair) => pair.secondArmFaster).length,
    orderOneMedianNs: median(
      runs.filter((run) => run.armOrder === 1).map((run) => BigInt(run.durationNs)),
    ).toString(),
    orderTwoMedianNs: median(
      runs.filter((run) => run.armOrder === 2).map((run) => BigInt(run.durationNs)),
    ).toString(),
  };
}

export function buildTimingForensics({
  attemptRoot,
  repoRoot = REPO_ROOT,
}) {
  const repository = requireDirectory(repoRoot, "P0_T17F_REPO_ROOT_INVALID");
  const root = requireDirectory(attemptRoot, "P0_T17F_ATTEMPT_ROOT_INVALID");
  if (!isWithin(repository, root)) throw new Error("P0_T17F_ATTEMPT_OUTSIDE_REPO");

  const auditReplay = readJson(ACTIVE_AUDIT_REPLAY);
  const replayCheck = replayAttemptTwoAudit({ attemptRoot: root, repoRoot: repository });
  if (auditReplay.authoritative !== false
    || auditReplay.verdict !== "stop"
    || auditReplay.phaseStatus !== "failed"
    || auditReplay.v2PassCount !== 10
    || auditReplay.auditorV2Sha256 !== replayCheck.auditorV2Sha256
    || auditReplay.replayRunnerSha256 !== replayCheck.replayRunnerSha256) {
    throw new Error("P0_T17F_AUDIT_REPLAY_CHANGED");
  }

  const verdict = readJson(join(root, "results/verdict.json"));
  const bundle = readJson(join(root, "results/canonical-evidence-bundle.json"));
  const trialsRoot = join(root, "results/trials");
  const runRoot = join(root, "results/runs");
  const bundleRecords = new Map(bundle.tasks.flatMap((task) => task.rawRecords.map(
    ({ record }) => [`${record.taskId}:${record.arm}`, record],
  )));

  const runs = readdirSync(runRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = join(runRoot, entry.name);
      const run = readJson(join(directory, "run.json"));
      if (!ARMS.includes(run.arm)
        || ![1, 2].includes(run.armOrder)
        || typeof run.startedAtNs !== "string"
        || typeof run.endedAtNs !== "string") {
        throw new Error("P0_T17F_RUN_INVALID");
      }
      const duration = BigInt(run.endedAtNs) - BigInt(run.startedAtNs);
      if (duration <= 0n) throw new Error("P0_T17F_DURATION_INVALID");
      const trial = readJson(join(trialsRoot, `${run.taskId}.json`));
      const trialArm = trial.arms.find((arm) => arm.arm === run.arm);
      const bundleRecord = bundleRecords.get(`${run.taskId}:${run.arm}`);
      if (trialArm === undefined || bundleRecord === undefined
        || trialArm.order !== run.armOrder
        || trialArm.startedAtNs !== run.startedAtNs
        || trialArm.endedAtNs !== run.endedAtNs
        || bundleRecord.locateDurationNs !== duration.toString()) {
        throw new Error("P0_T17F_DURATION_EVIDENCE_MISMATCH");
      }
      const eventAnalysis = analyzeRunEvents(
        readFileSync(join(directory, "stdout.jsonl"), "utf8"),
      );
      if (eventAnalysis.threadId !== run.threadId) {
        throw new Error("P0_T17F_THREAD_MISMATCH");
      }
      return {
        runId: run.runId,
        taskId: run.taskId,
        arm: run.arm,
        armOrder: run.armOrder,
        durationNs: duration.toString(),
        eventEvidenceSha256: sha256(
          readFileSync(join(directory, "stdout.jsonl")),
        ),
        ...eventAnalysis,
      };
    })
    .sort((left, right) => left.runId.localeCompare(right.runId));

  const pairSummary = summarizePairs(runs);
  if (verdict.verdict !== "stop"
    || verdict.metrics.runCount !== runs.length
    || verdict.metrics.taskCount !== pairSummary.pairs.length
    || verdict.metrics.directMedianNs !== pairSummary.directMedianNs
    || verdict.metrics.vemMedianNs !== pairSummary.vemMedianNs
    || verdict.metrics.fasterPairCount !== pairSummary.vemFasterPairCount) {
    throw new Error("P0_T17F_VERDICT_METRIC_MISMATCH");
  }

  const armAggregates = Object.fromEntries(ARMS.map((arm) => {
    const armRuns = runs.filter((run) => run.arm === arm);
    return [arm, {
      runCount: armRuns.length,
      commandCount: sumDecimal(armRuns.map((run) => run.commandCount.toString())),
      failedCommandCount: sumDecimal(
        armRuns.map((run) => run.failedCommandCount.toString()),
      ),
      commandOutputBytes: sumDecimal(armRuns.map((run) => run.commandOutputBytes)),
      inputTokens: sumDecimal(armRuns.map((run) => run.usage.inputTokens)),
      cachedInputTokens: sumDecimal(armRuns.map((run) => run.usage.cachedInputTokens)),
      outputTokens: sumDecimal(armRuns.map((run) => run.usage.outputTokens)),
      reasoningOutputTokens: sumDecimal(
        armRuns.map((run) => run.usage.reasoningOutputTokens),
      ),
    }];
  }));

  return {
    schemaVersion: "P0-T17F-timing-forensics-v1",
    authoritative: false,
    decisionImpact: "none-terminal-stop-preserved",
    sourceAttempt: relative(repository, root).split("\\").join("/"),
    analyzerSha256: sha256(readFileSync(SCRIPT_PATH)),
    attemptResultManifestSha256: sha256(readFileSync(join(root, "RESULTS.sha256"))),
    attemptVerdictSha256: sha256(readFileSync(join(root, "results/verdict.json"))),
    auditReplaySha256: sha256(readFileSync(ACTIVE_AUDIT_REPLAY)),
    verdict: "stop",
    phaseStatus: "failed",
    runs,
    pairSummary,
    armAggregates,
    observations: {
      vemFasterPairCount: pairSummary.vemFasterPairCount,
      secondArmFasterPairCount: pairSummary.secondArmFasterPairCount,
      directCommandCount: armAggregates["direct-search"].commandCount,
      vemCommandCount: armAggregates["vem-assisted"].commandCount,
      directFailedCommandCount: armAggregates["direct-search"].failedCommandCount,
      vemFailedCommandCount: armAggregates["vem-assisted"].failedCommandCount,
    },
    conclusion: "insufficient-evidence-to-attribute-total-duration-difference",
    limitations: [
      "NO_EVENT_TIMESTAMPS",
      "TOTAL_RUN_DURATION_ONLY",
      "REPORTED_USAGE_IS_NOT_PHASE_TIMING",
      "FIVE_TASK_DISCLOSED_RETEST",
      "POST_HOC_NON_CAUSAL",
      "NO_CROSS_ATTEMPT_POOLING",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "DOES_NOT_REWRITE_P0_T17D_OR_AUTHORIZE_DEPENDENT_WORK",
    ],
  };
}

function writeEvidence(attemptRoot, outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== TASK_EVIDENCE_ROOT || existsSync(output)) {
    throw new Error("P0_T17F_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(TASK_EVIDENCE_ROOT, "P0_T17F_OUTPUT_PARENT_INVALID");
  const report = buildTimingForensics({ attemptRoot });
  mkdirSync(output, { mode: 0o700 });
  const reportBody = `${canonicalJson(report)}\n`;
  const reportHash = sha256(reportBody);
  writeFileSync(join(output, "timing-forensics.json"), reportBody, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const summary = [
    "# P0-T17F post-hoc timing forensics",
    "",
    "This report is non-authoritative and preserves the immutable P0-T17D stop verdict.",
    "",
    `- VEM faster pairs: ${report.pairSummary.vemFasterPairCount}/5`,
    `- Second arm faster pairs: ${report.pairSummary.secondArmFasterPairCount}/5`,
    `- Direct/VEM median ns: ${report.pairSummary.directMedianNs} / ${report.pairSummary.vemMedianNs}`,
    `- Direct/VEM command count: ${report.armAggregates["direct-search"].commandCount} / ${report.armAggregates["vem-assisted"].commandCount}`,
    "- Raw events contain no event timestamps, so total duration cannot be attributed to command or model phases.",
    "- Decision impact: none; P0 remains failed and dependent product tasks remain locked.",
    "",
  ].join("\n");
  writeFileSync(join(output, "summary.md"), summary, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const manifest = [
    `${reportHash}  timing-forensics.json`,
    `${sha256(summary)}  summary.md`,
    "",
  ].join("\n");
  writeFileSync(join(output, "SHA256SUMS"), manifest, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${canonicalJson({
    ok: true,
    reportHash,
    verdict: report.verdict,
    phaseStatus: report.phaseStatus,
    vemFasterPairCount: report.pairSummary.vemFasterPairCount,
    secondArmFasterPairCount: report.pairSummary.secondArmFasterPairCount,
  })}\n`);
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length % 2 === 0) {
    throw new Error("P0_T17F_MEDIAN_INPUT_INVALID");
  }
  return [...values].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ))[(values.length - 1) / 2];
}

function sumDecimal(values) {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(code);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
  return resolved;
}

function isWithin(root, path) {
  const value = relative(root, path);
  return value === "" || (!value.startsWith("../") && value !== ".." && !isAbsolute(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("P0_T17F_CANONICAL_VALUE_INVALID");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("P0_T17F_CANONICAL_VALUE_INVALID");
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
  ).join(",")}}`;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 4) {
    throw new Error(
      "USAGE: node scripts/pilot/analyze-p0-t17d-timing.mjs <attempt-root> <output-root>",
    );
  }
  writeEvidence(process.argv[2], process.argv[3]);
}
