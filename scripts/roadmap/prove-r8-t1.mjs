import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../packages/pilot-harness/dist/index.js";
import { parseYaml, validateRepository } from "./validator-core.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R8-T1");
const OWNER_STATEMENT =
  "可以尝试一下，但超时就停止 recovery 实验，转向真正的模型无关 MCP 产品开发路线。";
const TERMINAL_TASKS = Object.freeze([
  ["P0", "P0-T17D", "P0-VALUE"],
  ["R0", "R0-T4", "R0-RECOVERY"],
  ["R1", "R1-T4", "R1-RECOVERY"],
  ["R2", "R2-T4", "R2-RECOVERY"],
  ["R3", "R3-T4", "R3-RECOVERY"],
  ["R5", "R5-T4", "R5-RECOVERY"],
  ["R6", "R6-T13", "R6-RECOVERY"],
  ["R7", "R7-T4", "R7-RECOVERY"],
]);
const EXCLUDED_DECISIONS = Object.freeze([
  "R6-RECOVERY",
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
  "docs/delivery/R8_FINAL_RECOVERY_EXIT.md",
  "docs/tasks/ATOMIC_TASK_PROMPTS.md",
  "scripts/roadmap/validator-core.mjs",
  "scripts/roadmap/prove-r8-t1.mjs",
]);
const PRODUCT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);
const MODEL_ID = /\b(?:gpt-[A-Za-z0-9.-]+|claude-[A-Za-z0-9.-]+|gemini-[A-Za-z0-9.-]+)\b/u;

export function assertR8CharterModel({
  roadmap,
  decisionInbox,
  validation,
  productModelReferences,
}) {
  const terminal = TERMINAL_TASKS.map(([phaseId, taskId, decisionKey]) => {
    const phase = roadmap.phases.find((candidate) => candidate.id === phaseId);
    const attempt = phase?.tasks.find((task) => task.id === taskId);
    return { phase, attempt, decisionKey };
  });
  const r4 = roadmap.phases.find((phase) => phase.id === "R4");
  const r4Attempt = r4?.tasks.find((task) => task.id === "R4-T4");
  const r8 = roadmap.phases.find((phase) => phase.id === "R8");
  const [charter, adapter, preregistration, verdict] = [
    "R8-T1", "R8-T2", "R8-T3", "R8-T4",
  ].map((taskId) => r8?.tasks.find((task) => task.id === taskId));
  const descriptor = roadmap.decisions["R8-RECOVERY"];
  const owner = decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-R8-FINAL-RECOVERY-EXIT",
  );
  const decision = decisionInbox.decisions.find(
    (candidate) => candidate.id === "R8-RECOVERY",
  );
  const r8TaskIds = new Set(r8?.tasks.map((task) => task.id) ?? []);
  const otherPhases = roadmap.phases.filter((phase) => phase.id !== "R8");
  const otherTasks = otherPhases.flatMap((phase) => phase.tasks);
  if (terminal.some(({ phase, attempt }) => (
    phase?.status !== "failed"
      || attempt?.status !== "done"
      || attempt.decision !== "stop"
  ))
    || r4?.status !== "blocked"
    || r4Attempt?.status !== "blocked"
    || r4Attempt?.decision !== "pending"
    || r8?.status !== "in_progress"
    || !["in_progress", "done"].includes(charter?.status)
    || adapter?.status !== "todo"
    || preregistration?.status !== "todo"
    || verdict?.status !== "todo"
    || verdict?.decision !== "pending"
    || verdict?.decision_attempt !== 1
    || verdict?.supersedes_attempt !== null
    || canonicalJson(charter?.depends_on ?? []) !== canonicalJson([])
    || canonicalJson(adapter?.depends_on ?? []) !== canonicalJson(["R8-T1"])
    || canonicalJson(preregistration?.depends_on ?? [])
      !== canonicalJson(["R8-T2"])
    || canonicalJson(verdict?.depends_on ?? []) !== canonicalJson(["R8-T3"])
    || r8.recovery_of_failed_phase !== "R7"
    || r8.scope_boundary !== "independent-research-no-product-unlock"
    || r8.authorization_ref !== "docs/decisions/OPEN_DECISIONS.yaml"
    || canonicalJson(r8.depends_on) !== canonicalJson([])
    || descriptor?.phase !== "R8"
    || descriptor?.current_attempt !== "R8-T4"
    || descriptor?.scope !== "independent-research"
    || descriptor?.does_not_supersede !== "R7-RECOVERY"
    || canonicalJson(descriptor?.also_does_not_supersede)
      !== canonicalJson(EXCLUDED_DECISIONS)
    || r8.gate?.requires_decisions?.["R8-RECOVERY"] !== "continue"
    || Object.keys(r8.gate.requires_decisions).length !== 1
    || decision?.status !== "open"
    || decision?.decision !== "pending"
    || decision?.current_attempt !== "R8-T4"
    || owner?.status !== "decided"
    || owner?.decision !== "authorized"
    || owner?.owner_statement !== OWNER_STATEMENT
    || owner?.external_execution_authorized !== false
    || owner?.model_identity_product_requirement !== false
    || owner?.maximum_future_external_processes !== 1
    || owner?.maximum_future_retries !== 0
    || owner?.timeout_disposition
      !== "stop-recovery-and-transition-to-separate-model-agnostic-product-route"
    || otherPhases.some((phase) => (phase.depends_on ?? []).includes("R8"))
    || otherTasks.some((task) => (
      task.depends_on ?? []
    ).some((dependency) => r8TaskIds.has(dependency)))
    || roadmap.phases.some((phase) => phase.id === "R9")
    || Object.hasOwn(roadmap.decisions, "R9-RECOVERY")
    || productModelReferences.length !== 0
    || validation.phases < 18
    || validation.tasks < 185
    || validation.contracts < 34) {
    throw new Error("R8_T1_CHARTER_PROOF_FAILED");
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
    r8Status: r8.status,
    r8T1Status: charter.status,
    currentDecision: verdict.decision,
  });
}

export function buildR8CharterProof(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "R8_T1_REPO_ROOT_INVALID");
  const roadmap = parseYaml(
    readFileSync(join(root, "ROADMAP.yaml"), "utf8"),
    "ROADMAP.yaml",
  );
  const decisionInbox = parseYaml(
    readFileSync(join(root, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
    "OPEN_DECISIONS.yaml",
  );
  const validation = validateRepository(root);
  const productModelReferences = scanProductModelReferences(join(root, "packages"));
  const result = assertR8CharterModel({
    roadmap,
    decisionInbox,
    validation,
    productModelReferences,
  });
  return {
    schemaVersion: "R8-T1-charter-proof-v1",
    taskId: "R8-T1",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      scope: "final-recovery-exit-charter-first",
      externalExecutionAuthorized: false,
    },
    preservedTerminalStates: result.terminal,
    preservedR4BlockedState: result.blocked,
    r8Boundary: {
      phase: "R8",
      status: result.r8Status,
      taskStatus: result.r8T1Status,
      phaseDependencies: [],
      taskDependencies: [],
      doesNotSupersede: "R7-RECOVERY",
      alsoDoesNotSupersede: EXCLUDED_DECISIONS,
      maximumFutureExternalProcesses: 1,
      maximumFutureRetries: 0,
      timeoutDisposition:
        "stop-recovery-and-transition-to-separate-model-agnostic-product-route",
      r9Allowed: false,
      productRouteRequiresR8Continue: false,
      productModelIdentityRequirement: false,
      productModelReferences,
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

function scanProductModelReferences(root) {
  const references = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "dist" || entry.name === "dist-types") continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && PRODUCT_EXTENSIONS.has(extname(entry.name))) {
        const text = readFileSync(absolute, "utf8");
        if (MODEL_ID.test(text)) references.push(relative(root, absolute));
      }
    }
  };
  visit(root);
  return references.sort();
}

function writeEvidence(outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== EVIDENCE_PARENT || existsSync(output)) {
    throw new Error("R8_T1_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R8_T1_OUTPUT_PARENT_INVALID");
  const proof = buildR8CharterProof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R8-T1 final recovery exit charter",
    "",
    "- R7 and every prior decision/evidence remain immutable.",
    "- The final recovery execution is one process with no retry and separate authorization.",
    "- Any timeout stops recovery permanently; R9 is forbidden.",
    "- Future product work is model-agnostic and does not require R8 continue.",
    "- Participant processes, provider probes and external model calls: 0.",
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
    taskId: "R8-T1",
    proofHash: sha256(body),
    productModelReferenceCount: 0,
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
      "USAGE: node scripts/roadmap/prove-r8-t1.mjs write-evidence <output-root>",
    );
  }
  writeEvidence(process.argv[3]);
}
