import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditCodexJsonlV2 } from "./capsule-audit-v2.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const AUDITOR_PATH = join(dirname(SCRIPT_PATH), "capsule-audit-v2.mjs");
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const TASK_EVIDENCE_ROOT = join(REPO_ROOT, "docs/test-evidence/P0-T17E");

export function replayAttemptTwoAudit({
  attemptRoot,
  repoRoot = REPO_ROOT,
}) {
  const root = requireDirectory(attemptRoot, "P0_T17E_ATTEMPT_ROOT_INVALID");
  const repository = requireDirectory(repoRoot, "P0_T17E_REPO_ROOT_INVALID");
  if (!isWithin(repository, root)) throw new Error("P0_T17E_ATTEMPT_ROOT_OUTSIDE_REPO");

  const preregistration = readJson(join(root, "PREREGISTRATION.json"));
  const preregistrationHash = readFileSync(
    join(root, "PREREGISTRATION.sha256"),
    "utf8",
  ).trim();
  if (preregistrationDigest(root) !== preregistrationHash
    || preregistration.schemaVersion !== "P0-T17D-preregistered-plan-v1") {
    throw new Error("P0_T17E_PREREGISTRATION_CHANGED");
  }
  if (sha256(readFileSync(join(repository, "scripts/pilot/capsule.mjs")))
      !== preregistration.capsuleSha256
    || sha256(readFileSync(join(repository, "scripts/pilot/p0-t17d.mjs")))
      !== preregistration.runnerSha256) {
    throw new Error("P0_T17E_BOUND_SOURCE_CHANGED");
  }

  verifyResultsManifest(root);
  const verdict = readJson(join(root, "results/verdict.json"));
  if (verdict.verdict !== "stop"
    || verdict.decisionKey !== "P0-VALUE"
    || verdict.decisionAttempt !== 2) {
    throw new Error("P0_T17E_TERMINAL_VERDICT_CHANGED");
  }

  const runRoot = join(root, "results/runs");
  const runDirectories = readdirSync(runRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (runDirectories.length !== 10) throw new Error("P0_T17E_RUN_COUNT_INVALID");

  const runs = runDirectories.map((runId) => {
    const directory = join(runRoot, runId);
    const stdoutPath = join(directory, "stdout.jsonl");
    const stderrPath = join(directory, "stderr.txt");
    const runPath = join(directory, "run.json");
    const stdout = readFileSync(stdoutPath, "utf8");
    const stderr = readFileSync(stderrPath, "utf8");
    const legacyRun = readJson(runPath);
    const audit = auditCodexJsonlV2({ jsonl: stdout, stderr });
    return {
      runId,
      stdoutSha256: sha256(stdout),
      stderrSha256: sha256(stderr),
      runRecordSha256: sha256(readFileSync(runPath)),
      legacyCapsuleAudit: legacyRun.capsuleAudit,
      v2Audit: audit,
    };
  });

  const roadmap = readFileSync(join(repository, "ROADMAP.yaml"), "utf8");
  if (!roadmap.includes("status: failed")
    || !roadmap.includes("id: P0-T17D")
    || !roadmap.includes("status: done, decision_key: P0-VALUE")
    || !roadmap.includes("decision: stop")) {
    throw new Error("P0_T17E_ROADMAP_TERMINAL_STATE_CHANGED");
  }

  return {
    schemaVersion: "P0-T17E-attempt-two-audit-replay-v1",
    authoritative: false,
    decisionImpact: "none-terminal-stop-preserved",
    sourceAttempt: relative(repository, root).split("\\").join("/"),
    preregistrationHash,
    legacyCapsuleSha256: preregistration.capsuleSha256,
    legacyRunnerSha256: preregistration.runnerSha256,
    auditorV2Sha256: sha256(readFileSync(AUDITOR_PATH)),
    replayRunnerSha256: sha256(readFileSync(SCRIPT_PATH)),
    resultManifestSha256: sha256(readFileSync(join(root, "RESULTS.sha256"))),
    verdictSha256: sha256(readFileSync(join(root, "results/verdict.json"))),
    verdict: "stop",
    phaseStatus: "failed",
    runCount: runs.length,
    legacyFailureCount: runs.filter(
      (run) => run.legacyCapsuleAudit !== "passed",
    ).length,
    v2PassCount: runs.filter((run) => run.v2Audit.valid).length,
    runs,
    limitations: [
      "POST_HOC_NON_AUTHORITATIVE",
      "DOES_NOT_REWRITE_P0_T17D",
      "DOES_NOT_AUTHORIZE_P0_T7_OR_P1",
    ],
  };
}

function writeReplayEvidence(attemptRoot, outputRoot) {
  const output = resolve(outputRoot);
  const evidenceRoot = requireDirectory(
    dirname(output),
    "P0_T17E_OUTPUT_PARENT_INVALID",
  );
  if (evidenceRoot !== TASK_EVIDENCE_ROOT || existsSync(output)) {
    throw new Error("P0_T17E_OUTPUT_ROOT_INVALID");
  }
  const replay = replayAttemptTwoAudit({ attemptRoot });
  mkdirSync(output, { mode: 0o700 });
  const replayBody = `${canonicalJson(replay)}\n`;
  writeFileSync(join(output, "replay.json"), replayBody, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const summary = [
    "# P0-T17E post-hoc audit replay",
    "",
    "This evidence is non-authoritative and preserves the immutable P0-T17D stop verdict.",
    "",
    `- Legacy failures: ${replay.legacyFailureCount}/${replay.runCount}`,
    `- V2 audit passes: ${replay.v2PassCount}/${replay.runCount}`,
    `- V2 auditor SHA-256: ${replay.auditorV2Sha256}`,
    `- Replay runner SHA-256: ${replay.replayRunnerSha256}`,
    "- Decision impact: none; P0 remains failed and P0-T7/P1 remain locked.",
    "",
  ].join("\n");
  writeFileSync(join(output, "summary.md"), summary, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const manifest = [
    `${sha256(replayBody)}  replay.json`,
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
    legacyFailureCount: replay.legacyFailureCount,
    v2PassCount: replay.v2PassCount,
    replayHash: sha256(replayBody),
    verdict: replay.verdict,
    phaseStatus: replay.phaseStatus,
  })}\n`);
}

function verifyResultsManifest(root) {
  const manifestPath = join(root, "RESULTS.sha256");
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
  const listed = new Set();
  for (const line of lines) {
    const match = /^(?<hash>[a-f0-9]{64}) {2}(?<path>results\/[A-Za-z0-9._~/-]{1,1024})$/u.exec(line);
    if (!match?.groups || listed.has(match.groups.path)
      || match.groups.path.split("/").includes("..")) {
      throw new Error("P0_T17E_RESULTS_MANIFEST_INVALID");
    }
    const path = join(root, match.groups.path);
    if (!existsSync(path) || !statSync(path).isFile()
      || sha256(readFileSync(path)) !== match.groups.hash) {
      throw new Error("P0_T17E_RESULTS_MANIFEST_CHANGED");
    }
    listed.add(match.groups.path);
  }
  const actual = collectFiles(join(root, "results"))
    .map((path) => relative(root, path).split("\\").join("/"));
  if (actual.length !== listed.size || actual.some((path) => !listed.has(path))) {
    throw new Error("P0_T17E_RESULTS_MANIFEST_COVERAGE_INVALID");
  }
}

function preregistrationDigest(root) {
  const lines = collectFiles(root)
    .map((path) => relative(root, path).split("\\").join("/"))
    .filter((path) => (
      path !== "PREREGISTRATION.sha256"
      && path !== "RESULTS.sha256"
      && !path.startsWith("results/")
    ))
    .sort()
    .map((path) => `${sha256(readFileSync(join(root, path)))}  ${path}\n`)
    .join("");
  return sha256(lines);
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("P0_T17E_EVIDENCE_SYMLINK");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("P0_T17E_EVIDENCE_NON_REGULAR");
    }
  };
  visit(root);
  return files;
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
    if (!Number.isFinite(value)) throw new Error("P0_T17E_CANONICAL_VALUE_INVALID");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("P0_T17E_CANONICAL_VALUE_INVALID");
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
  ).join(",")}}`;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 4) {
    throw new Error(
      "USAGE: node scripts/pilot/replay-p0-t17d-audit-v2.mjs <attempt-root> <output-root>",
    );
  }
  writeReplayEvidence(process.argv[2], process.argv[3]);
}
