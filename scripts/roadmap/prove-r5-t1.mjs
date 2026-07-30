import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../packages/pilot-harness/dist/index.js";
import { parseYaml, validateRepository } from "./validator-core.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R5-T1");
const OWNER_STATEMENT = "结合文档内容，从当前最新阶段的prompt开始做，每完成一个阶段就在对应的prompt下面标注已完成，以及简短的概述做了什么,如果没有额度就输出：任务目标是什么，当前做了什么，有什么方案，还剩什么，下一步要做什么，供下次codex能接上任务";
const TERMINAL_TASKS = Object.freeze([
  ["P0", "P0-T17D"],
  ["R0", "R0-T4"],
  ["R1", "R1-T4"],
  ["R2", "R2-T4"],
  ["R3", "R3-T4"],
]);
const BOUND_FILES = Object.freeze([
  "ROADMAP.yaml",
  "docs/DESIGN.md",
  "docs/requirements.yaml",
  "docs/decisions/OPEN_DECISIONS.yaml",
  "docs/delivery/R5_PROCESS_TREE_TERMINATION_REMEDIATION.md",
  "docs/tasks/ATOMIC_TASK_PROMPTS.md",
  "scripts/roadmap/validator-core.mjs",
  "scripts/roadmap/validator-core.test.mjs",
  "scripts/roadmap/prove-r5-t1.mjs",
]);

export function assertR5CharterModel({ roadmap, decisionInbox, validation }) {
  const terminal = TERMINAL_TASKS.map(([phaseId, taskId]) => {
    const phase = roadmap.phases.find((candidate) => candidate.id === phaseId);
    return { phase, attempt: phase?.tasks.find((task) => task.id === taskId) };
  });
  const r4 = roadmap.phases.find((phase) => phase.id === "R4");
  const blockedAttempt = r4?.tasks.find((task) => task.id === "R4-T4");
  const r5 = roadmap.phases.find((phase) => phase.id === "R5");
  const charter = r5?.tasks.find((task) => task.id === "R5-T1");
  const r5Decision = r5?.tasks.find((task) => task.id === "R5-T4");
  const owner = decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-R5-PROCESS-TREE-TERMINATION-REMEDIATION",
  );
  const r5TaskIds = new Set(r5?.tasks.map((task) => task.id) ?? []);
  const otherPhases = roadmap.phases.filter((phase) => phase.id !== "R5");
  const otherTasks = otherPhases.flatMap((phase) => phase.tasks);
  if (terminal.some(({ phase, attempt }) => (
    phase?.status !== "failed"
      || attempt?.status !== "done"
      || attempt.decision !== "stop"
  ))
    || r4?.status !== "blocked"
    || blockedAttempt?.status !== "blocked"
    || blockedAttempt?.decision !== "pending"
    || !["in_progress", "failed"].includes(r5?.status)
    || (r5?.status === "failed"
      && (r5Decision?.status !== "done" || r5Decision?.decision !== "stop"))
    || (r5?.status === "in_progress"
      && r5Decision?.decision !== "pending")
    || !["in_progress", "done"].includes(charter?.status)
    || (charter?.depends_on ?? []).length !== 0
    || r5.remediation_of_blocked_phase !== "R4"
    || r5.scope_boundary !== "independent-research-no-product-unlock"
    || r5.authorization_ref !== "docs/decisions/OPEN_DECISIONS.yaml"
    || !Array.isArray(r5.depends_on)
    || r5.depends_on.length !== 0
    || roadmap.decisions["R5-RECOVERY"]?.current_attempt !== "R5-T4"
    || roadmap.decisions["R5-RECOVERY"]?.does_not_supersede !== "R4-RECOVERY"
    || canonicalJson(
      roadmap.decisions["R5-RECOVERY"]?.also_does_not_supersede,
    ) !== canonicalJson([
      "R3-RECOVERY",
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
      "P0-VALUE",
    ])
    || r5.gate?.requires_decisions?.["R5-RECOVERY"] !== "continue"
    || Object.keys(r5.gate.requires_decisions).length !== 1
    || otherPhases.some((phase) => phase.depends_on.includes("R5"))
    || otherTasks.some((task) => (
      task.depends_on ?? []
    ).some((dependency) => r5TaskIds.has(dependency)))
    || owner?.status !== "decided"
    || owner?.decision !== "authorized"
    || owner?.owner_statement !== OWNER_STATEMENT
    || validation.phases < 15
    || validation.tasks < 164
    || validation.contracts < 31) {
    throw new Error("R5_T1_CHARTER_PROOF_FAILED");
  }
  return Object.freeze({
    terminal: terminal.map(({ phase, attempt }) => ({
      phase: phase.id,
      status: phase.status,
      verdict: attempt.decision,
    })),
    blocked: {
      phase: r4.id,
      status: r4.status,
      task: blockedAttempt.id,
      taskStatus: blockedAttempt.status,
      decision: blockedAttempt.decision,
    },
    r5Status: r5.status,
    r5T1Status: charter.status,
    r5Decision: r5Decision.decision,
  });
}

export function buildR5CharterProof(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "R5_T1_REPO_ROOT_INVALID");
  const roadmap = parseYaml(
    readFileSync(join(root, "ROADMAP.yaml"), "utf8"),
    "ROADMAP.yaml",
  );
  const decisionInbox = parseYaml(
    readFileSync(join(root, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
    "OPEN_DECISIONS.yaml",
  );
  const validation = validateRepository(root);
  const result = assertR5CharterModel({ roadmap, decisionInbox, validation });
  return {
    schemaVersion: "R5-T1-charter-proof-v1",
    taskId: "R5-T1",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      scope: "charter-process-termination-remediation-and-preregistration-no-external-calls",
    },
    preservedBlockedState: result.blocked,
    preservedTerminalStates: result.terminal,
    r5Boundary: {
      phase: "R5",
      status: result.r5Status,
      taskStatus: result.r5T1Status,
      phaseDependencies: [],
      taskDependencies: [],
      doesNotSupersede: "R4-RECOVERY",
      alsoDoesNotSupersede: [
        "R3-RECOVERY",
        "R2-RECOVERY",
        "R1-RECOVERY",
        "R0-RECOVERY",
        "P0-VALUE",
      ],
      productUnlockCount: 0,
      charterExternalExecutionAuthorized: false,
      currentDecision: result.r5Decision,
    },
    validation,
    sourceBindings: Object.fromEntries(BOUND_FILES.map((path) => [
      path,
      sha256(readFileSync(join(root, path))),
    ])),
  };
}

function writeEvidence(outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== EVIDENCE_PARENT || existsSync(output)) {
    throw new Error("R5_T1_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R5_T1_OUTPUT_PARENT_INVALID");
  const proof = buildR5CharterProof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R5-T1 independent process-tree termination remediation charter",
    "",
    "- R4 remains blocked with R4-RECOVERY pending.",
    "- P0 and R0 through R3 remain failed with immutable stop verdicts.",
    "- R5 has no phase or task dependency and cannot unlock existing product work.",
    "- R5-T1 through R5-T3 have no external model-call authorization.",
    "",
  ].join("\n");
  writeFileSync(join(output, "charter-proof.json"), body, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "summary.md"), summary, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "SHA256SUMS"), [
    `${sha256(body)}  charter-proof.json`,
    `${sha256(summary)}  summary.md`,
    "",
  ].join("\n"), {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: "R5-T1",
    proofHash: sha256(body),
    productUnlockCount: 0,
    externalExecutionAuthorized: false,
  })}\n`);
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node scripts/roadmap/prove-r5-t1.mjs <output-root>");
  }
  writeEvidence(process.argv[2]);
}
