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
import { parseYaml, validateRepository } from "./validator-core.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R0-T1");
const OWNER_STATEMENT = "授权修改 UX-GATE-001 与 ROADMAP，新增不覆盖 P0-T17D stop 的独立恢复研究阶段，并继续执行该阶段。";

const BOUND_FILES = Object.freeze([
  "ROADMAP.yaml",
  "docs/DESIGN.md",
  "docs/requirements.yaml",
  "docs/decisions/OPEN_DECISIONS.yaml",
  "docs/delivery/R0_RECOVERY_RESEARCH.md",
  "docs/tasks/ATOMIC_TASK_PROMPTS.md",
  "scripts/roadmap/validator-core.mjs",
  "scripts/roadmap/validator-core.test.mjs",
  "scripts/roadmap/prove-r0-t1.mjs",
]);

export function assertR0CharterModel({ roadmap, decisionInbox, validation }) {
  const p0 = roadmap.phases.find((phase) => phase.id === "P0");
  const r0 = roadmap.phases.find((phase) => phase.id === "R0");
  const p0Attempt = p0?.tasks.find((task) => task.id === "P0-T17D");
  const ownerDecision = decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-R0-RECOVERY-RESEARCH",
  );
  const charterTaskStatus = r0?.tasks.find((task) => task.id === "R0-T1")?.status;
  const existingPhases = roadmap.phases.filter((phase) => phase.id !== "R0");
  const r0TaskIds = new Set(r0?.tasks.map((task) => task.id) ?? []);
  const existingTasks = existingPhases.flatMap((phase) => phase.tasks);

  if (p0?.status !== "failed"
    || p0Attempt?.status !== "done"
    || p0Attempt?.decision !== "stop"
    || roadmap.decisions["P0-VALUE"]?.current_attempt !== "P0-T17D"
    || !["in_progress", "passed", "failed"].includes(r0?.status)
    || r0.recovery_of_failed_phase !== "P0"
    || r0.scope_boundary !== "independent-research-no-product-unlock"
    || !Array.isArray(r0.depends_on)
    || r0.depends_on.length !== 0
    || roadmap.decisions["R0-RECOVERY"]?.current_attempt !== "R0-T4"
    || roadmap.decisions["R0-RECOVERY"]?.scope !== "independent-research"
    || roadmap.decisions["R0-RECOVERY"]?.does_not_supersede !== "P0-VALUE"
    || r0.gate?.requires_decisions?.["R0-RECOVERY"] !== "continue"
    || !["in_progress", "done"].includes(charterTaskStatus)
    || existingPhases.some((phase) => phase.depends_on.includes("R0"))
    || existingTasks.some((task) => (
      task.depends_on ?? []
    ).some((dependency) => r0TaskIds.has(dependency)))
    || ownerDecision?.status !== "decided"
    || ownerDecision?.decision !== "authorized"
    || ownerDecision?.evidence !== `Owner explicitly stated "${OWNER_STATEMENT}" in the active Codex thread.`
    || validation.phases < 10
    || validation.tasks < 144
    || validation.contracts < 26) {
    throw new Error("R0_T1_CHARTER_PROOF_FAILED");
  }

  return {
    valid: true,
    p0Status: p0.status,
    p0ValueVerdict: p0Attempt.decision,
    recoveryPhase: r0.id,
    recoveryStatus: r0.status,
    recoveryDecision: "R0-RECOVERY",
    recoveryDecisionStatus: "pending",
    charterTaskStatus,
    productUnlockCount: 0,
    ownerAuthorizationRecorded: true,
  };
}

export function buildR0CharterProof(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "R0_T1_REPO_ROOT_INVALID");
  const roadmap = parseYaml(readFileSync(join(root, "ROADMAP.yaml"), "utf8"), "ROADMAP.yaml");
  const decisionInbox = parseYaml(
    readFileSync(join(root, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
    "OPEN_DECISIONS.yaml",
  );
  const validation = validateRepository(root);
  const proof = assertR0CharterModel({ roadmap, decisionInbox, validation });
  return {
    schemaVersion: "R0-T1-charter-proof-v1",
    taskId: "R0-T1",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      recordedDecisionId: "OWNER-R0-RECOVERY-RESEARCH",
      scope: "independent-recovery-research",
    },
    preservedTerminalState: {
      phase: "P0",
      status: proof.p0Status,
      decisionKey: "P0-VALUE",
      currentAttempt: "P0-T17D",
      verdict: proof.p0ValueVerdict,
    },
    recoveryBoundary: {
      phase: proof.recoveryPhase,
      status: proof.recoveryStatus,
      phaseDependencies: [],
      decisionKey: proof.recoveryDecision,
      decisionStatus: proof.recoveryDecisionStatus,
      charterTaskStatus: proof.charterTaskStatus,
      doesNotSupersede: "P0-VALUE",
      productUnlockCount: proof.productUnlockCount,
    },
    validation,
    sourceBindings: Object.fromEntries(BOUND_FILES.map((path) => [
      path,
      sha256(readFileSync(join(root, path))),
    ])),
    limitations: [
      "NO_P0_OR_P1_REOPEN",
      "NO_PRODUCT_CAPABILITY_IMPLEMENTED",
      "NO_EXTERNAL_MODEL_CALL",
      "R0_CONTINUE_ONLY_AUTHORIZES_A_SEPARATE_RESEARCH_PROPOSAL",
    ],
  };
}

function writeEvidence(outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== EVIDENCE_PARENT || existsSync(output)) {
    throw new Error("R0_T1_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R0_T1_OUTPUT_PARENT_INVALID");
  const proof = buildR0CharterProof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R0-T1 recovery charter proof",
    "",
    "- P0-T17D remains done/stop and P0 remains failed.",
    "- R0 is an independently authorized research phase with no product unlock edge.",
    "- R0-RECOVERY does not supersede P0-VALUE.",
    "- No external model call or product capability is part of R0-T1.",
    "",
  ].join("\n");
  writeFileSync(join(output, "charter-proof.json"), body, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(join(output, "summary.md"), summary, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(join(output, "SHA256SUMS"), [
    `${sha256(body)}  charter-proof.json`,
    `${sha256(summary)}  summary.md`,
    "",
  ].join("\n"), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: proof.taskId,
    proofHash: sha256(body),
    p0Status: proof.preservedTerminalState.status,
    p0ValueVerdict: proof.preservedTerminalState.verdict,
    recoveryStatus: proof.recoveryBoundary.status,
    productUnlockCount: proof.recoveryBoundary.productUnlockCount,
  })}\n`);
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(code);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
  return resolved;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("R0_T1_CANONICAL_VALUE_INVALID");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("R0_T1_CANONICAL_VALUE_INVALID");
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
  ).join(",")}}`;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node scripts/roadmap/prove-r0-t1.mjs <output-root>");
  }
  writeEvidence(process.argv[2]);
}
