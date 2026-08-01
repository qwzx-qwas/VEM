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
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R1-T1");
const OWNER_STATEMENT = "授权新增不覆盖 R0-RECOVERY stop 与 P0-VALUE stop 的独立 R1 runner remediation 阶段，并继续完成修复与新预注册；外部实验仍需预注册后单独授权。";
const BOUND_FILES = Object.freeze([
  "ROADMAP.yaml",
  "docs/DESIGN.md",
  "docs/requirements.yaml",
  "docs/decisions/OPEN_DECISIONS.yaml",
  "docs/delivery/R1_RUNNER_REMEDIATION.md",
  "docs/tasks/ATOMIC_TASK_PROMPTS.md",
  "scripts/roadmap/validator-core.mjs",
  "scripts/roadmap/validator-core.test.mjs",
  "scripts/roadmap/prove-r1-t1.mjs",
]);

export function assertR1CharterModel({ roadmap, decisionInbox, validation }) {
  const p0 = roadmap.phases.find((phase) => phase.id === "P0");
  const r0 = roadmap.phases.find((phase) => phase.id === "R0");
  const r1 = roadmap.phases.find((phase) => phase.id === "R1");
  const p0Attempt = p0?.tasks.find((task) => task.id === "P0-T17D");
  const r0Attempt = r0?.tasks.find((task) => task.id === "R0-T4");
  const owner = decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-R1-RUNNER-REMEDIATION",
  );
  const r1TaskIds = new Set(r1?.tasks.map((task) => task.id) ?? []);
  const otherPhases = roadmap.phases.filter((phase) => phase.id !== "R1");
  const otherTasks = otherPhases.flatMap((phase) => phase.tasks);
  if (p0?.status !== "failed"
    || p0Attempt?.decision !== "stop"
    || r0?.status !== "failed"
    || r0Attempt?.decision !== "stop"
    || !["in_progress", "passed", "failed"].includes(r1?.status)
    || r1.recovery_of_failed_phase !== "R0"
    || r1.scope_boundary !== "independent-research-no-product-unlock"
    || r1.authorization_ref !== "docs/decisions/OPEN_DECISIONS.yaml"
    || !Array.isArray(r1.depends_on)
    || r1.depends_on.length !== 0
    || roadmap.decisions["R1-RECOVERY"]?.current_attempt !== "R1-T4"
    || roadmap.decisions["R1-RECOVERY"]?.does_not_supersede !== "R0-RECOVERY"
    || canonicalJson(
      roadmap.decisions["R1-RECOVERY"]?.also_does_not_supersede,
    ) !== canonicalJson(["P0-VALUE"])
    || r1.gate?.requires_decisions?.["R1-RECOVERY"] !== "continue"
    || otherPhases.some((phase) => phase.depends_on.includes("R1"))
    || otherTasks.some((task) => (
      task.depends_on ?? []
    ).some((dependency) => r1TaskIds.has(dependency)))
    || owner?.status !== "decided"
    || owner?.decision !== "authorized"
    || owner?.evidence !== `Owner explicitly stated "${OWNER_STATEMENT}" in the active Codex thread.`
    || validation.phases < 11
    || validation.tasks < 148
    || validation.contracts < 27) {
    throw new Error("R1_T1_CHARTER_PROOF_FAILED");
  }
  return Object.freeze({
    valid: true,
    p0Status: p0.status,
    p0Verdict: p0Attempt.decision,
    r0Status: r0.status,
    r0Verdict: r0Attempt.decision,
    r1Status: r1.status,
    productUnlockCount: 0,
    externalExecutionAuthorized: false,
  });
}

export function buildR1CharterProof(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "R1_T1_REPO_ROOT_INVALID");
  const roadmap = parseYaml(
    readFileSync(join(root, "ROADMAP.yaml"), "utf8"),
    "ROADMAP.yaml",
  );
  const decisionInbox = parseYaml(
    readFileSync(join(root, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
    "OPEN_DECISIONS.yaml",
  );
  const validation = validateRepository(root);
  const result = assertR1CharterModel({ roadmap, decisionInbox, validation });
  return {
    schemaVersion: "R1-T1-charter-proof-v1",
    taskId: "R1-T1",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      scope: "charter-runner-remediation-and-preregistration-no-external-calls",
    },
    preservedTerminalStates: [
      { phase: "P0", decisionKey: "P0-VALUE", status: result.p0Status, verdict: result.p0Verdict },
      { phase: "R0", decisionKey: "R0-RECOVERY", status: result.r0Status, verdict: result.r0Verdict },
    ],
    r1Boundary: {
      phase: "R1",
      status: result.r1Status,
      phaseDependencies: [],
      doesNotSupersede: "R0-RECOVERY",
      alsoDoesNotSupersede: ["P0-VALUE"],
      productUnlockCount: result.productUnlockCount,
      externalExecutionAuthorized: result.externalExecutionAuthorized,
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
    throw new Error("R1_T1_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R1_T1_OUTPUT_PARENT_INVALID");
  const proof = buildR1CharterProof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R1-T1 independent runner-remediation charter",
    "",
    "- P0 and R0 remain failed with immutable stop verdicts.",
    "- R1 has no phase dependency and cannot unlock existing product work.",
    "- R1-T1 through R1-T3 have no external model-call authorization.",
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
    taskId: "R1-T1",
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
    throw new Error("USAGE: node scripts/roadmap/prove-r1-t1.mjs <output-root>");
  }
  writeEvidence(process.argv[2]);
}
