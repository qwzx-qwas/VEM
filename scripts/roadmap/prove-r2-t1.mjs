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
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R2-T1");
const OWNER_STATEMENT = "对暴露的问题进行修正";
const BOUND_FILES = Object.freeze([
  "ROADMAP.yaml",
  "docs/DESIGN.md",
  "docs/requirements.yaml",
  "docs/decisions/OPEN_DECISIONS.yaml",
  "docs/delivery/R2_FINAL_OUTPUT_REMEDIATION.md",
  "docs/tasks/ATOMIC_TASK_PROMPTS.md",
  "scripts/roadmap/validator-core.mjs",
  "scripts/roadmap/validator-core.test.mjs",
  "scripts/roadmap/prove-r2-t1.mjs",
]);

export function assertR2CharterModel({ roadmap, decisionInbox, validation }) {
  const terminal = [
    ["P0", "P0-T17D"],
    ["R0", "R0-T4"],
    ["R1", "R1-T4"],
  ].map(([phaseId, taskId]) => {
    const phase = roadmap.phases.find((candidate) => candidate.id === phaseId);
    return { phase, attempt: phase?.tasks.find((task) => task.id === taskId) };
  });
  const r2 = roadmap.phases.find((phase) => phase.id === "R2");
  const owner = decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-R2-FINAL-OUTPUT-REMEDIATION",
  );
  const r2TaskIds = new Set(r2?.tasks.map((task) => task.id) ?? []);
  const otherPhases = roadmap.phases.filter((phase) => phase.id !== "R2");
  const otherTasks = otherPhases.flatMap((phase) => phase.tasks);
  if (terminal.some(({ phase, attempt }) => (
    phase?.status !== "failed" || attempt?.decision !== "stop"
  ))
    || r2?.status !== "in_progress"
    || r2.recovery_of_failed_phase !== "R1"
    || r2.scope_boundary !== "independent-research-no-product-unlock"
    || r2.authorization_ref !== "docs/decisions/OPEN_DECISIONS.yaml"
    || !Array.isArray(r2.depends_on)
    || r2.depends_on.length !== 0
    || roadmap.decisions["R2-RECOVERY"]?.current_attempt !== "R2-T4"
    || roadmap.decisions["R2-RECOVERY"]?.does_not_supersede !== "R1-RECOVERY"
    || canonicalJson(
      roadmap.decisions["R2-RECOVERY"]?.also_does_not_supersede,
    ) !== canonicalJson(["R0-RECOVERY", "P0-VALUE"])
    || r2.gate?.requires_decisions?.["R2-RECOVERY"] !== "continue"
    || otherPhases.some((phase) => phase.depends_on.includes("R2"))
    || otherTasks.some((task) => (
      task.depends_on ?? []
    ).some((dependency) => r2TaskIds.has(dependency)))
    || owner?.status !== "decided"
    || owner?.decision !== "authorized"
    || owner?.evidence !== `Owner explicitly stated "${OWNER_STATEMENT}" in the active Codex thread.`
    || validation.phases < 12
    || validation.tasks < 152
    || validation.contracts < 28) {
    throw new Error("R2_T1_CHARTER_PROOF_FAILED");
  }
  return Object.freeze({
    terminal: terminal.map(({ phase, attempt }) => ({
      phase: phase.id,
      status: phase.status,
      verdict: attempt.decision,
    })),
    r2Status: r2.status,
  });
}

export function buildR2CharterProof(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "R2_T1_REPO_ROOT_INVALID");
  const roadmap = parseYaml(
    readFileSync(join(root, "ROADMAP.yaml"), "utf8"),
    "ROADMAP.yaml",
  );
  const decisionInbox = parseYaml(
    readFileSync(join(root, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
    "OPEN_DECISIONS.yaml",
  );
  const validation = validateRepository(root);
  const result = assertR2CharterModel({ roadmap, decisionInbox, validation });
  return {
    schemaVersion: "R2-T1-charter-proof-v1",
    taskId: "R2-T1",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      scope: "charter-final-output-remediation-and-preregistration-no-external-calls",
    },
    preservedTerminalStates: result.terminal,
    r2Boundary: {
      phase: "R2",
      status: result.r2Status,
      phaseDependencies: [],
      doesNotSupersede: "R1-RECOVERY",
      alsoDoesNotSupersede: ["R0-RECOVERY", "P0-VALUE"],
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
    throw new Error("R2_T1_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R2_T1_OUTPUT_PARENT_INVALID");
  const proof = buildR2CharterProof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R2-T1 independent final-output remediation charter",
    "",
    "- P0, R0 and R1 remain failed with immutable stop verdicts.",
    "- R2 has no phase dependency and cannot unlock existing product work.",
    "- R2-T1 through R2-T3 have no external model-call authorization.",
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
    taskId: "R2-T1",
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
    throw new Error("USAGE: node scripts/roadmap/prove-r2-t1.mjs <output-root>");
  }
  writeEvidence(process.argv[2]);
}
