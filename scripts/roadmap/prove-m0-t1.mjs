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
import { parseYaml, validateRepository } from "./validator-core.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/M0-T1");
const OWNER_STATEMENT = [
  "优先完成;coordinator + MCP STDIO；",
  "Vite/browser proxy；",
  "selection/source MCP tools；",
  "confirmation + prepare/HMR/complete；",
  "真实 Edge walking-skeleton；",
  "最小安装 CLI。",
].join("\n");
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
const REUSED_TASKS = Object.freeze([
  "P0-T0F",
  "P0-T0G",
  "P0-T1",
  "P0-T2",
  "P0-T3",
  "P0-T4",
  "P0-T5",
  "P0-T15",
  "P0-T16",
]);
const TASK_CHAIN = Object.freeze([
  ["M0-T1", []],
  ["M0-T2", ["M0-T1"]],
  ["M0-T3", ["M0-T2"]],
  ["M0-T4", ["M0-T3"]],
  ["M0-T5", ["M0-T4"]],
  ["M0-T6", ["M0-T5"]],
  ["M0-T7", ["M0-T6"]],
  ["M0-T8", ["M0-T7"]],
  ["M0-T9", ["M0-T8"]],
  ["M0-T10", ["M0-T9"]],
  ["M0-T11", ["M0-T10"]],
  ["M0-T12", ["M0-T11"]],
  ["M0-T13", ["M0-T12"]],
]);
const PRIORITY_GROUPS = Object.freeze([
  ["coordinator", "MCP STDIO"],
  ["Vite", "browser proxy"],
  ["selection", "source MCP tools"],
  ["confirmation", "prepare", "HMR", "complete"],
  ["Edge Stable", "walking skeleton"],
  ["install CLI", "Codex MCP config", "clean uninstall"],
]);
const BOUND_FILES = Object.freeze([
  "ROADMAP.yaml",
  "docs/DESIGN.md",
  "docs/requirements.yaml",
  "docs/decisions/OPEN_DECISIONS.yaml",
  "docs/delivery/M0_USABLE_MCP.md",
  "docs/tasks/ATOMIC_TASK_PROMPTS.md",
  "scripts/roadmap/validator-core.mjs",
  "scripts/roadmap/prove-m0-t1.mjs",
]);
const PRODUCT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);
const MODEL_ID = /\b(?:gpt-[A-Za-z0-9.-]+|claude-[A-Za-z0-9.-]+|gemini-[A-Za-z0-9.-]+)\b/u;

export function assertM0CharterModel({
  roadmap,
  decisionInbox,
  validation,
  productModelReferences,
}) {
  const m0 = roadmap.phases.find((phase) => phase.id === "M0");
  const tasks = TASK_CHAIN.map(([taskId]) => (
    m0?.tasks.find((task) => task.id === taskId)
  ));
  const p0 = roadmap.phases.find((phase) => phase.id === "P0");
  const r4 = roadmap.phases.find((phase) => phase.id === "R4");
  const r4Attempt = r4?.tasks.find((task) => task.id === "R4-T4");
  const owner = decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-M0-USABLE-MCP-PRIORITY",
  );
  const terminal = TERMINAL_TASKS.map(([phaseId, taskId, decisionKey]) => {
    const phase = roadmap.phases.find((candidate) => candidate.id === phaseId);
    const task = phase?.tasks.find((candidate) => candidate.id === taskId);
    return { phase, task, decisionKey };
  });
  const allTasks = roadmap.phases.flatMap((phase) => phase.tasks);
  const contract = roadmapContract(roadmap, "USABLE-MCP-001");
  if (m0?.status !== "in_progress"
    || canonicalJson(m0.depends_on) !== canonicalJson([])
    || m0.scope_boundary !== "independent-product-route-no-recovery-gate"
    || m0.authorization_ref !== "docs/decisions/OPEN_DECISIONS.yaml"
    || canonicalJson(m0.reuses_completed_tasks) !== canonicalJson(REUSED_TASKS)
    || Object.keys(m0.gate?.requires_decisions ?? {}).length !== 0
    || m0.tasks.length !== TASK_CHAIN.length
    || tasks.some((task) => task === undefined)
    || !["in_progress", "done"].includes(tasks[0]?.status)
    || tasks.slice(1).some((task) => task.status !== "todo")
    || TASK_CHAIN.some(([taskId, dependencies], index) => (
      tasks[index].id !== taskId
        || canonicalJson(tasks[index].depends_on) !== canonicalJson(dependencies)
        || !tasks[index].contracts.includes("USABLE-MCP-001")
    ))
    || terminal.some(({ phase, task }) => (
      phase?.status !== "failed" || task?.status !== "done" || task.decision !== "stop"
    ))
    || p0?.status !== "failed"
    || REUSED_TASKS.some((taskId) => (
      p0.tasks.find((task) => task.id === taskId)?.status !== "done"
    ))
    || r4?.status !== "blocked"
    || r4Attempt?.status !== "blocked"
    || r4Attempt?.decision !== "pending"
    || owner?.status !== "decided"
    || owner?.decision !== "authorized"
    || owner?.owner_statement !== OWNER_STATEMENT
    || canonicalJson(owner?.authorized_scope) !== canonicalJson(TASK_CHAIN.map(([id]) => id))
    || owner?.external_model_execution_authorized !== false
    || owner?.provider_reachability_required !== false
    || owner?.participant_model_identity_requirement !== false
    || owner?.local_edge_vite_mcp_process_tests_authorized !== true
    || roadmap.phases.some((phase) => (
      phase.id !== "M0" && (phase.depends_on ?? []).includes("M0")
    ))
    || allTasks.some((task) => (
      !task.id.startsWith("M0-")
        && (task.depends_on ?? []).some((dependency) => dependency.startsWith("M0-"))
    ))
    || roadmap.phases.some((phase) => phase.id === "R9")
    || Object.hasOwn(roadmap.decisions, "R9-RECOVERY")
    || productModelReferences.length !== 0
    || contract === null
    || validation.phases !== 19
    || validation.tasks !== 198
    || validation.contracts !== 35) {
    throw new Error("M0_T1_CHARTER_PROOF_FAILED");
  }
  return Object.freeze({
    m0,
    tasks,
    terminal,
    r4: { phase: r4, task: r4Attempt },
    owner,
  });
}

export function buildM0CharterProof(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "M0_T1_REPO_ROOT_INVALID");
  const roadmap = parseYaml(readFileSync(join(root, "ROADMAP.yaml"), "utf8"), "ROADMAP.yaml");
  const decisionInbox = parseYaml(
    readFileSync(join(root, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
    "OPEN_DECISIONS.yaml",
  );
  const validation = validateRepository(root);
  const productModelReferences = scanProductModelReferences(join(root, "packages"));
  const result = assertM0CharterModel({
    roadmap,
    decisionInbox,
    validation,
    productModelReferences,
  });
  return {
    schemaVersion: "M0-T1-usable-mcp-charter-proof-v1",
    taskId: "M0-T1",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      authorizedTaskIds: TASK_CHAIN.map(([taskId]) => taskId),
      externalModelExecutionAuthorized: false,
      localEdgeViteMcpProcessTestsAuthorized: true,
    },
    preservedTerminalStates: result.terminal.map(({ phase, task, decisionKey }) => ({
      phase: phase.id,
      phaseStatus: phase.status,
      task: task.id,
      taskStatus: task.status,
      decisionKey,
      verdict: task.decision,
    })),
    preservedR4BlockedState: {
      phase: result.r4.phase.id,
      phaseStatus: result.r4.phase.status,
      task: result.r4.task.id,
      taskStatus: result.r4.task.status,
      verdict: result.r4.task.decision,
    },
    productRoute: {
      phase: result.m0.id,
      status: result.m0.status,
      dependencies: result.m0.depends_on,
      requiredDecisions: result.m0.gate.requires_decisions,
      scopeBoundary: result.m0.scope_boundary,
      reusedCompletedTasks: result.m0.reuses_completed_tasks,
      atomicTaskIds: result.tasks.map((task) => task.id),
      priorityGroups: PRIORITY_GROUPS,
      p0OrRecoveryVerdictRequired: false,
      r8CompletionRequired: false,
      participantModelIdentityRequired: false,
      providerReachabilityRequired: false,
      productModelReferences,
      productUnlockClaimCount: 0,
    },
    executionBoundary: {
      externalModelCallCount: 0,
      participantProcessCount: 0,
      providerRequestCount: 0,
      networkProbeCount: 0,
      edgeProcessCount: 0,
      viteProcessCount: 0,
      mcpProcessCount: 0,
    },
    validation,
    sourceBindings: Object.fromEntries(BOUND_FILES.map((path) => [
      path,
      sha256(readFileSync(join(root, path))),
    ])),
  };
}

export function writeM0T1Evidence(outputRoot) {
  const parent = requireDirectory(EVIDENCE_PARENT, "M0_T1_EVIDENCE_PARENT_INVALID");
  const output = resolve(outputRoot);
  if (dirname(output) !== parent || existsSync(output)) {
    throw new Error("M0_T1_EVIDENCE_ROOT_INVALID");
  }
  const proof = buildM0CharterProof();
  mkdirSync(output, { mode: 0o700 });
  const proofBody = `${canonicalJson(proof)}\n`;
  const summary = [
    "# M0-T1 model-agnostic usable MCP route charter",
    "",
    "- Result: passed.",
    "- M0 is an independent product route with no P0 or recovery decision dependency.",
    "- P0 and every recovery stop/blocked state remain immutable.",
    "- Thirteen atomic tasks preserve the owner's six priority groups and end at a fresh-project install/edit/uninstall gate.",
    "- Existing environment, protocol, selector, anchor and registry work is reused only as completed tested assets, not as a successful P0 verdict.",
    "- Product runtime and MCP behavior remain independent of participant model identity and provider reachability.",
    "- External model calls, participant/provider/network probes and local Edge/Vite/MCP processes: 0.",
    "",
  ].join("\n");
  writePrivate(join(output, "charter-proof.json"), proofBody);
  writePrivate(join(output, "SUMMARY.md"), summary);
  writePrivate(join(output, "SHA256SUMS"), [
    `${sha256(proofBody)}  charter-proof.json`,
    `${sha256(summary)}  SUMMARY.md`,
    "",
  ].join("\n"));
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: "M0-T1",
    proofHash: sha256(proofBody),
    externalModelCallCount: 0,
    productUnlockClaimCount: 0,
  })}\n`);
}

function roadmapContract(roadmap, contractId) {
  const task = roadmap.phases.flatMap((phase) => phase.tasks)
    .find((candidate) => candidate.contracts.includes(contractId));
  return task === undefined ? null : contractId;
}

function scanProductModelReferences(root) {
  const references = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "dist" || entry.name === "dist-types") continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && PRODUCT_EXTENSIONS.has(extname(entry.name))) {
        if (MODEL_ID.test(readFileSync(absolute, "utf8"))) {
          references.push(relative(root, absolute));
        }
      }
    }
  };
  visit(root);
  return references.sort();
}

function requireDirectory(path, code) {
  const root = resolve(path);
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
    throw new Error(code);
  }
  return root;
}

function writePrivate(path, body) {
  writeFileSync(path, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 4 || process.argv[2] !== "write-evidence") {
    throw new Error(
      "USAGE: node scripts/roadmap/prove-m0-t1.mjs write-evidence <output-root>",
    );
  }
  writeM0T1Evidence(process.argv[3]);
}
