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
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T1");
const OWNER_STATEMENT = "修复它";
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
  "docs/delivery/R6_PRESPAWN_INVOCATION_REMEDIATION.md",
  "docs/tasks/ATOMIC_TASK_PROMPTS.md",
  "scripts/roadmap/validator-core.mjs",
  "scripts/roadmap/validator-core.test.mjs",
  "scripts/roadmap/prove-r6-t1.mjs",
]);

export function assertR6CharterModel({ roadmap, decisionInbox, validation }) {
  const terminal = TERMINAL_TASKS.map(([phaseId, taskId]) => {
    const phase = roadmap.phases.find((candidate) => candidate.id === phaseId);
    return { phase, attempt: phase?.tasks.find((task) => task.id === taskId) };
  });
  const r4 = roadmap.phases.find((phase) => phase.id === "R4");
  const blockedAttempt = r4?.tasks.find((task) => task.id === "R4-T4");
  const r5 = roadmap.phases.find((phase) => phase.id === "R5");
  const r5Attempt = r5?.tasks.find((task) => task.id === "R5-T4");
  const r6 = roadmap.phases.find((phase) => phase.id === "R6");
  const charter = r6?.tasks.find((task) => task.id === "R6-T1");
  const priorAttempts = ["R6-T4", "R6-T7", "R6-T10"].map(
    (taskId) => r6?.tasks.find((task) => task.id === taskId),
  );
  const r6Decision = roadmap.decisions["R6-RECOVERY"];
  const currentAttempt = r6?.tasks.find(
    (task) => task.id === r6Decision?.current_attempt,
  );
  const owner = decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-R6-PRESPAWN-INVOCATION-REMEDIATION",
  );
  const r6TaskIds = new Set(r6?.tasks.map((task) => task.id) ?? []);
  const otherPhases = roadmap.phases.filter((phase) => phase.id !== "R6");
  const otherTasks = otherPhases.flatMap((phase) => phase.tasks);
  if (terminal.some(({ phase, attempt }) => (
    phase?.status !== "failed"
      || attempt?.status !== "done"
      || attempt.decision !== "stop"
  ))
    || r4?.status !== "blocked"
    || blockedAttempt?.status !== "blocked"
    || blockedAttempt?.decision !== "pending"
    || r5?.status !== "failed"
    || r5Attempt?.status !== "done"
    || r5Attempt?.decision !== "stop"
    || r6?.status !== "failed"
    || !["in_progress", "done"].includes(charter?.status)
    || priorAttempts.some((attempt, index) => (
      attempt?.status !== "done"
        || attempt.decision !== "adjust"
        || attempt.decision_attempt !== index + 1
        || attempt.supersedes_attempt !== [null, "R6-T4", "R6-T7"][index]
    ))
    || (charter?.depends_on ?? []).length !== 0
    || r6.recovery_of_failed_phase !== "R5"
    || r6.scope_boundary !== "independent-research-no-product-unlock"
    || r6.authorization_ref !== "docs/decisions/OPEN_DECISIONS.yaml"
    || !Array.isArray(r6.depends_on)
    || r6.depends_on.length !== 0
    || currentAttempt?.decision_key !== "R6-RECOVERY"
    || currentAttempt?.id !== r6Decision?.current_attempt
    || currentAttempt?.id !== "R6-T13"
    || currentAttempt?.status !== "done"
    || currentAttempt?.decision !== "stop"
    || currentAttempt?.decision_attempt !== 4
    || currentAttempt?.supersedes_attempt !== "R6-T10"
    || r6Decision?.does_not_supersede !== "R5-RECOVERY"
    || canonicalJson(
      r6Decision?.also_does_not_supersede,
    ) !== canonicalJson([
      "R4-RECOVERY",
      "R3-RECOVERY",
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
      "P0-VALUE",
    ])
    || r6.gate?.requires_decisions?.["R6-RECOVERY"] !== "continue"
    || Object.keys(r6.gate.requires_decisions).length !== 1
    || otherPhases.some((phase) => phase.depends_on.includes("R6"))
    || otherTasks.some((task) => (
      task.depends_on ?? []
    ).some((dependency) => r6TaskIds.has(dependency)))
    || owner?.status !== "decided"
    || owner?.decision !== "authorized"
    || owner?.owner_statement !== OWNER_STATEMENT
    || validation.phases < 17
    || validation.tasks < 181
    || validation.contracts < 33) {
    throw new Error("R6_T1_CHARTER_PROOF_FAILED");
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
    r5: {
      phase: r5.id,
      status: r5.status,
      verdict: r5Attempt.decision,
    },
    r6Status: r6.status,
    r6T1Status: charter.status,
    currentDecision: currentAttempt.decision,
  });
}

export function buildR6CharterProof(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "R6_T1_REPO_ROOT_INVALID");
  const roadmap = parseYaml(
    readFileSync(join(root, "ROADMAP.yaml"), "utf8"),
    "ROADMAP.yaml",
  );
  const decisionInbox = parseYaml(
    readFileSync(join(root, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
    "OPEN_DECISIONS.yaml",
  );
  const validation = validateRepository(root);
  const result = assertR6CharterModel({ roadmap, decisionInbox, validation });
  return {
    schemaVersion: "R6-T1-charter-proof-v1",
    taskId: "R6-T1",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      scope: "charter-pre-spawn-invocation-remediation-and-preregistration-no-external-calls",
    },
    preservedR5TerminalState: result.r5,
    preservedR4BlockedState: result.blocked,
    preservedPriorTerminalStates: result.terminal,
    r6Boundary: {
      phase: "R6",
      status: result.r6Status,
      taskStatus: result.r6T1Status,
      phaseDependencies: [],
      taskDependencies: [],
      doesNotSupersede: "R5-RECOVERY",
      alsoDoesNotSupersede: [
        "R4-RECOVERY",
        "R3-RECOVERY",
        "R2-RECOVERY",
        "R1-RECOVERY",
        "R0-RECOVERY",
        "P0-VALUE",
      ],
      productUnlockCount: 0,
      charterExternalExecutionAuthorized: false,
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
    throw new Error("R6_T1_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R6_T1_OUTPUT_PARENT_INVALID");
  const proof = buildR6CharterProof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R6-T1 independent pre-spawn invocation remediation charter",
    "",
    "- R5 remains failed with immutable R5-RECOVERY stop.",
    "- R4 remains blocked with R4-RECOVERY pending.",
    "- P0 and R0 through R3 retain their immutable stop verdicts.",
    "- R6 has no phase or task dependency and cannot unlock existing product work.",
    "- R6-T1 through R6-T3 have no external model-call authorization.",
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
    taskId: "R6-T1",
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
    throw new Error("USAGE: node scripts/roadmap/prove-r6-t1.mjs <output-root>");
  }
  writeEvidence(process.argv[2]);
}
