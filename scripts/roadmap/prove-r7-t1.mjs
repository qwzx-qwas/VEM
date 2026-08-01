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
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R7-T1");
const OWNER_STATEMENT =
  "我明确授权新增一个不覆盖 R6-RECOVERY stop、R5/R4 及此前所有 decision/evidence，"
  + "且不解锁产品工作的独立 R7 retry-capsule isolation remediation 路线；"
  + "先仅执行本地零调用的 charter、每次 retry 使用独立 capsule/final-output control root "
  + "的 runner 修复、exception-safe batch sealing、测试及新预注册，并按阶段 commit/push。"
  + "任何外部模型调用仍须在新预注册发布后另行精确授权。";
const TERMINAL_TASKS = Object.freeze([
  ["P0", "P0-T17D", "P0-VALUE"],
  ["R0", "R0-T4", "R0-RECOVERY"],
  ["R1", "R1-T4", "R1-RECOVERY"],
  ["R2", "R2-T4", "R2-RECOVERY"],
  ["R3", "R3-T4", "R3-RECOVERY"],
  ["R5", "R5-T4", "R5-RECOVERY"],
  ["R6", "R6-T13", "R6-RECOVERY"],
]);
const EXCLUDED_DECISIONS = Object.freeze([
  "R5-RECOVERY",
  "R4-RECOVERY",
  "R3-RECOVERY",
  "R2-RECOVERY",
  "R1-RECOVERY",
  "R0-RECOVERY",
  "P0-VALUE",
]);
const BOUND_FILES = Object.freeze([
  "ROADMAP.yaml",
  "docs/DESIGN.md",
  "docs/requirements.yaml",
  "docs/decisions/OPEN_DECISIONS.yaml",
  "docs/delivery/R7_RETRY_CAPSULE_ISOLATION_REMEDIATION.md",
  "docs/tasks/ATOMIC_TASK_PROMPTS.md",
  "scripts/roadmap/validator-core.mjs",
  "scripts/roadmap/validator-core.test.mjs",
  "scripts/roadmap/prove-r7-t1.mjs",
]);

export function assertR7CharterModel({ roadmap, decisionInbox, validation }) {
  const terminal = TERMINAL_TASKS.map(([phaseId, taskId, decisionKey]) => {
    const phase = roadmap.phases.find((candidate) => candidate.id === phaseId);
    const attempt = phase?.tasks.find((task) => task.id === taskId);
    return { phase, attempt, decisionKey };
  });
  const r4 = roadmap.phases.find((phase) => phase.id === "R4");
  const r4Attempt = r4?.tasks.find((task) => task.id === "R4-T4");
  const r7 = roadmap.phases.find((phase) => phase.id === "R7");
  const [charter, runner, preregistration, verdict] = [
    "R7-T1", "R7-T2", "R7-T3", "R7-T4",
  ].map((taskId) => r7?.tasks.find((task) => task.id === taskId));
  const descriptor = roadmap.decisions["R7-RECOVERY"];
  const owner = decisionInbox.decisions.find(
    (decision) => (
      decision.id === "OWNER-R7-RETRY-CAPSULE-ISOLATION-REMEDIATION"
    ),
  );
  const decision = decisionInbox.decisions.find(
    (candidate) => candidate.id === "R7-RECOVERY",
  );
  const r7TaskIds = new Set(r7?.tasks.map((task) => task.id) ?? []);
  const otherPhases = roadmap.phases.filter((phase) => phase.id !== "R7");
  const otherTasks = otherPhases.flatMap((phase) => phase.tasks);
  if (terminal.some(({ phase, attempt }) => (
    phase?.status !== "failed"
      || attempt?.status !== "done"
      || attempt.decision !== "stop"
  ))
    || r4?.status !== "blocked"
    || r4Attempt?.status !== "blocked"
    || r4Attempt?.decision !== "pending"
    || r7?.status !== "in_progress"
    || !["in_progress", "done"].includes(charter?.status)
    || !["todo", "done"].includes(runner?.status)
    || preregistration?.status !== "todo"
    || verdict?.status !== "todo"
    || verdict?.decision !== "pending"
    || verdict?.decision_attempt !== 1
    || verdict?.supersedes_attempt !== null
    || canonicalJson(charter?.depends_on ?? []) !== canonicalJson([])
    || canonicalJson(runner?.depends_on ?? []) !== canonicalJson(["R7-T1"])
    || canonicalJson(preregistration?.depends_on ?? [])
      !== canonicalJson(["R7-T2"])
    || canonicalJson(verdict?.depends_on ?? []) !== canonicalJson(["R7-T3"])
    || r7.recovery_of_failed_phase !== "R6"
    || r7.scope_boundary !== "independent-research-no-product-unlock"
    || r7.authorization_ref !== "docs/decisions/OPEN_DECISIONS.yaml"
    || canonicalJson(r7.depends_on) !== canonicalJson([])
    || descriptor?.phase !== "R7"
    || descriptor?.current_attempt !== "R7-T4"
    || descriptor?.scope !== "independent-research"
    || descriptor?.does_not_supersede !== "R6-RECOVERY"
    || canonicalJson(descriptor?.also_does_not_supersede)
      !== canonicalJson(EXCLUDED_DECISIONS)
    || r7.gate?.requires_decisions?.["R7-RECOVERY"] !== "continue"
    || Object.keys(r7.gate.requires_decisions).length !== 1
    || decision?.status !== "open"
    || decision?.decision !== "pending"
    || decision?.current_attempt !== "R7-T4"
    || owner?.status !== "decided"
    || owner?.decision !== "authorized"
    || owner?.owner_statement !== OWNER_STATEMENT
    || owner?.external_execution_authorized !== false
    || canonicalJson(owner?.authorized_scope)
      !== canonicalJson(["R7-T1", "R7-T2", "R7-T3"])
    || otherPhases.some((phase) => (phase.depends_on ?? []).includes("R7"))
    || otherTasks.some((task) => (
      task.depends_on ?? []
    ).some((dependency) => r7TaskIds.has(dependency)))
    || validation.phases < 17
    || validation.tasks < 181
    || validation.contracts < 33) {
    throw new Error("R7_T1_CHARTER_PROOF_FAILED");
  }
  return Object.freeze({
    terminal: terminal.map(({ phase, attempt, decisionKey }) => ({
      phase: phase.id,
      status: phase.status,
      task: attempt.id,
      decisionKey,
      verdict: attempt.decision,
    })),
    blocked: {
      phase: r4.id,
      status: r4.status,
      task: r4Attempt.id,
      taskStatus: r4Attempt.status,
      decision: r4Attempt.decision,
    },
    r7Status: r7.status,
    r7T1Status: charter.status,
    currentDecision: verdict.decision,
  });
}

export function buildR7CharterProof(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "R7_T1_REPO_ROOT_INVALID");
  const roadmap = parseYaml(
    readFileSync(join(root, "ROADMAP.yaml"), "utf8"),
    "ROADMAP.yaml",
  );
  const decisionInbox = parseYaml(
    readFileSync(join(root, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
    "OPEN_DECISIONS.yaml",
  );
  const validation = validateRepository(root);
  const result = assertR7CharterModel({ roadmap, decisionInbox, validation });
  return {
    schemaVersion: "R7-T1-charter-proof-v1",
    taskId: "R7-T1",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      scope: "r7-t1-through-r7-t3-local-zero-call-only",
      externalExecutionAuthorized: false,
    },
    preservedTerminalStates: result.terminal,
    preservedR4BlockedState: result.blocked,
    r7Boundary: {
      phase: "R7",
      status: result.r7Status,
      taskStatus: result.r7T1Status,
      phaseDependencies: [],
      taskDependencies: [],
      doesNotSupersede: "R6-RECOVERY",
      alsoDoesNotSupersede: EXCLUDED_DECISIONS,
      productUnlockCount: 0,
      externalExecutionAuthorized: false,
      currentDecision: result.currentDecision,
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
    throw new Error("R7_T1_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R7_T1_OUTPUT_PARENT_INVALID");
  const proof = buildR7CharterProof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R7-T1 retry-capsule isolation remediation charter",
    "",
    "- R6 remains failed with immutable R6-RECOVERY stop.",
    "- R5 stop, R4 blocked/pending and every earlier terminal stop remain unchanged.",
    "- R7 has no phase or task dependency and cannot unlock product work.",
    "- R7-T1 through R7-T3 are local zero-call work; R7-T4 remains unauthorized.",
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
    taskId: "R7-T1",
    proofHash: sha256(body),
    productUnlockCount: 0,
    externalExecutionAuthorized: false,
  })}\n`);
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  if (!existsSync(resolved)
    || !lstatSync(resolved).isDirectory()
    || lstatSync(resolved).isSymbolicLink()) throw new Error(code);
  return resolved;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 4 || process.argv[2] !== "write-evidence") {
    throw new Error(
      "USAGE: node scripts/roadmap/prove-r7-t1.mjs write-evidence <output-root>",
    );
  }
  writeEvidence(process.argv[3]);
}
