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
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R4-T1");
const OWNER_STATEMENT = "授权新增不覆盖 R3-RECOVERY、R2-RECOVERY、R1-RECOVERY、R0-RECOVERY 与 P0-VALUE stop 的独立 R4 external-transport timeout remediation 阶段，并继续完成传输预检、超时分类、有限重试 runner 修复与新预注册；外部实验仍需预注册后单独授权。";
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
  "docs/delivery/R4_TRANSPORT_TIMEOUT_REMEDIATION.md",
  "docs/tasks/ATOMIC_TASK_PROMPTS.md",
  "scripts/roadmap/validator-core.mjs",
  "scripts/roadmap/validator-core.test.mjs",
  "scripts/roadmap/prove-r4-t1.mjs",
]);

export function assertR4CharterModel({ roadmap, decisionInbox, validation }) {
  const terminal = TERMINAL_TASKS.map(([phaseId, taskId]) => {
    const phase = roadmap.phases.find((candidate) => candidate.id === phaseId);
    return { phase, attempt: phase?.tasks.find((task) => task.id === taskId) };
  });
  const r4 = roadmap.phases.find((phase) => phase.id === "R4");
  const charter = r4?.tasks.find((task) => task.id === "R4-T1");
  const verdict = r4?.tasks.find((task) => task.id === "R4-T4");
  const r4StatusValid = r4?.status === "in_progress"
    || (r4?.status === "blocked"
      && verdict?.status === "blocked"
      && verdict.decision === "pending")
    || (r4?.status === "failed"
      && verdict?.status === "done"
      && verdict.decision === "stop");
  const owner = decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-R4-TRANSPORT-TIMEOUT-REMEDIATION",
  );
  const r4TaskIds = new Set(r4?.tasks.map((task) => task.id) ?? []);
  const otherPhases = roadmap.phases.filter((phase) => phase.id !== "R4");
  const otherTasks = otherPhases.flatMap((phase) => phase.tasks);
  if (terminal.some(({ phase, attempt }) => (
    phase?.status !== "failed"
      || attempt?.status !== "done"
      || attempt.decision !== "stop"
  ))
    || !r4StatusValid
    || !["in_progress", "done"].includes(charter?.status)
    || (charter?.depends_on ?? []).length !== 0
    || r4.recovery_of_failed_phase !== "R3"
    || r4.scope_boundary !== "independent-research-no-product-unlock"
    || r4.authorization_ref !== "docs/decisions/OPEN_DECISIONS.yaml"
    || !Array.isArray(r4.depends_on)
    || r4.depends_on.length !== 0
    || roadmap.decisions["R4-RECOVERY"]?.current_attempt !== "R4-T4"
    || roadmap.decisions["R4-RECOVERY"]?.does_not_supersede !== "R3-RECOVERY"
    || canonicalJson(
      roadmap.decisions["R4-RECOVERY"]?.also_does_not_supersede,
    ) !== canonicalJson([
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
      "P0-VALUE",
    ])
    || r4.gate?.requires_decisions?.["R4-RECOVERY"] !== "continue"
    || Object.keys(r4.gate.requires_decisions).length !== 1
    || otherPhases.some((phase) => phase.depends_on.includes("R4"))
    || otherTasks.some((task) => (
      task.depends_on ?? []
    ).some((dependency) => r4TaskIds.has(dependency)))
    || owner?.status !== "decided"
    || owner?.decision !== "authorized"
    || owner?.evidence !== `Owner explicitly stated "${OWNER_STATEMENT}" in the active Codex thread.`
    || validation.phases < 14
    || validation.tasks < 160
    || validation.contracts < 30) {
    throw new Error("R4_T1_CHARTER_PROOF_FAILED");
  }
  return Object.freeze({
    terminal: terminal.map(({ phase, attempt }) => ({
      phase: phase.id,
      status: phase.status,
      verdict: attempt.decision,
    })),
    r4Status: r4.status,
    r4T1Status: charter.status,
  });
}

export function buildR4CharterProof(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "R4_T1_REPO_ROOT_INVALID");
  const roadmap = parseYaml(
    readFileSync(join(root, "ROADMAP.yaml"), "utf8"),
    "ROADMAP.yaml",
  );
  const decisionInbox = parseYaml(
    readFileSync(join(root, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
    "OPEN_DECISIONS.yaml",
  );
  const validation = validateRepository(root);
  const result = assertR4CharterModel({ roadmap, decisionInbox, validation });
  return {
    schemaVersion: "R4-T1-charter-proof-v1",
    taskId: "R4-T1",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      scope: "charter-transport-remediation-and-preregistration-no-external-calls",
    },
    preservedTerminalStates: result.terminal,
    r4Boundary: {
      phase: "R4",
      status: result.r4Status,
      taskStatus: result.r4T1Status,
      phaseDependencies: [],
      taskDependencies: [],
      doesNotSupersede: "R3-RECOVERY",
      alsoDoesNotSupersede: [
        "R2-RECOVERY",
        "R1-RECOVERY",
        "R0-RECOVERY",
        "P0-VALUE",
      ],
      productUnlockCount: 0,
      externalExecutionAuthorized: false,
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
    throw new Error("R4_T1_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R4_T1_OUTPUT_PARENT_INVALID");
  const proof = buildR4CharterProof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R4-T1 independent external-transport timeout remediation charter",
    "",
    "- P0, R0, R1, R2 and R3 remain failed with immutable stop verdicts.",
    "- R4 has no phase or task dependency and cannot unlock existing product work.",
    "- R4-T1 through R4-T3 have no external model-call authorization.",
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
    taskId: "R4-T1",
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
    throw new Error("USAGE: node scripts/roadmap/prove-r4-t1.mjs <output-root>");
  }
  writeEvidence(process.argv[2]);
}
