import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertIntendedCapsuleDifference,
  auditCodexJsonl,
  cleanupParticipantCapsule,
  createParticipantCapsule,
  runCodexBinaryIsolationProbe,
  runFilesystemIsolationProbe,
} from "./capsule.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const ATTEMPT_ONE = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17B/20260729T171610+0800",
);
const TASK_IDS = Object.freeze([
  "ux-01-manifest-row",
  "ux-02-email-input",
  "ux-03-safe-route",
  "ux-04-prompt-data",
  "ux-05-raw-error",
]);

function main() {
  const [rawOutputRoot] = process.argv.slice(2);
  if (!rawOutputRoot) {
    throw new Error("USAGE: node scripts/pilot/prove-p0-t17c.mjs <evidence-root>");
  }
  const outputRoot = resolve(REPO_ROOT, rawOutputRoot);
  const allowedParent = join(REPO_ROOT, "docs/test-evidence/P0-T17C");
  if (dirname(outputRoot) !== allowedParent || existsSync(outputRoot)) {
    throw new Error("P0_T17C_EVIDENCE_ROOT_INVALID");
  }
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });

  const attemptOnePreregistrationHash = readFileSync(
    join(ATTEMPT_ONE, "PREREGISTRATION.sha256"),
    "utf8",
  ).trim();
  const attemptOneBundleMeta = readJson(join(
    ATTEMPT_ONE,
    "results/canonical-evidence-bundle.meta.json",
  ));
  const attemptOneVerdict = readJson(join(ATTEMPT_ONE, "results/verdict.json"));
  if (attemptOnePreregistrationHash
      !== "2bf456e2220cf61fb78c97c1854d6575847d783b66404ba3db3746380573b1bb"
    || attemptOneBundleMeta.contentHash
      !== "d7eaabf23afd3456c7adbd4cf9f1abd6c381c69149d7650b5ac9b361c642f65e"
    || attemptOneVerdict.verdict !== "adjust") {
    throw new Error("P0_T17C_ATTEMPT_ONE_EVIDENCE_MISMATCH");
  }

  const capsules = [];
  const baseContextHashes = new Set();
  const treatmentHashes = new Set();
  for (const taskId of TASK_IDS) {
    const direct = createParticipantCapsule({
      sourceRoot: join(ATTEMPT_ONE, "fixture"),
      taskId,
      arm: "direct-search",
      responseSchemaPath: join(ATTEMPT_ONE, "inputs/response-schema.json"),
    });
    const vem = createParticipantCapsule({
      sourceRoot: join(ATTEMPT_ONE, "fixture"),
      taskId,
      arm: "vem-assisted",
      responseSchemaPath: join(ATTEMPT_ONE, "inputs/response-schema.json"),
      vemContextPath: join(ATTEMPT_ONE, `participant/vem-context/${taskId}.json`),
    });
    try {
      const difference = assertIntendedCapsuleDifference(direct.manifest, vem.manifest);
      const directFilesystemProbe = runFilesystemIsolationProbe(direct);
      const vemFilesystemProbe = runFilesystemIsolationProbe(vem);
      const directCodexProbe = runCodexBinaryIsolationProbe(direct);
      const vemCodexProbe = runCodexBinaryIsolationProbe(vem);
      baseContextHashes.add(difference.baseContextHash);
      if (difference.vemContextHash) treatmentHashes.add(difference.vemContextHash);
      const record = {
        schemaVersion: "P0-T17C-capsule-pair-evidence-v1",
        taskId,
        directManifest: direct.manifest,
        vemManifest: vem.manifest,
        intendedDifference: difference,
        directFilesystemProbe,
        vemFilesystemProbe,
        directCodexProbe,
        vemCodexProbe,
        cleanupRequired: true,
      };
      writeJson(join(outputRoot, `capsules/${taskId}.json`), record);
      capsules.push(record);
    } finally {
      cleanupParticipantCapsule(direct);
      cleanupParticipantCapsule(vem);
    }
    if (existsSync(direct.capsuleRoot) || existsSync(vem.capsuleRoot)) {
      throw new Error("P0_T17C_CAPSULE_RESIDUE");
    }
  }
  if (baseContextHashes.size !== 1 || treatmentHashes.size !== TASK_IDS.length) {
    throw new Error("P0_T17C_CONTEXT_HASH_SET_INVALID");
  }

  const attemptOneAudits = [];
  for (const runId of readdirSync(join(ATTEMPT_ONE, "results/runs")).sort()) {
    const runRoot = join(ATTEMPT_ONE, "results/runs", runId);
    const jsonl = readFileSync(join(runRoot, "stdout.jsonl"), "utf8");
    const stderr = readFileSync(join(runRoot, "stderr.txt"), "utf8");
    let auditResult = "unexpected-pass";
    try {
      auditCodexJsonl({ jsonl, stderr });
    } catch (error) {
      auditResult = error instanceof Error ? error.message : "unknown-error";
    }
    attemptOneAudits.push({ runId, auditResult });
  }
  const detectedLeakCount = attemptOneAudits.filter(
    ({ auditResult }) => auditResult === "CAPSULE_COMMAND_PATH_ESCAPE",
  ).length;
  if (detectedLeakCount === 0) throw new Error("P0_T17C_ATTEMPT_ONE_LEAK_NOT_REPRODUCED");

  const positiveAudit = auditCodexJsonl({
    jsonl: [
      JSON.stringify({ type: "thread.started", thread_id: "p0-t17c-probe" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "/bin/bash -lc \"rg -n target /work/packages/demo-fixture/src/App.tsx\"",
          aggregated_output: "/work/packages/demo-fixture/src/App.tsx:35:<li>",
        },
      }),
    ].join("\n"),
  });
  let negativeAudit = "unexpected-pass";
  try {
    auditCodexJsonl({
      jsonl: JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "/bin/bash -lc \"sed -n 1,40p /home/qwzx/src/VEM/.agents/skills/visual-ui-edit/SKILL.md\"",
          aggregated_output: "",
        },
      }),
    });
  } catch (error) {
    negativeAudit = error instanceof Error ? error.message : "unknown-error";
  }
  if (negativeAudit !== "CAPSULE_COMMAND_PATH_ESCAPE") {
    throw new Error("P0_T17C_NEGATIVE_AUDIT_DID_NOT_FAIL");
  }

  writeJson(join(outputRoot, "attempt-one-leak-audit.json"), {
    schemaVersion: "P0-T17C-attempt-one-leak-audit-v1",
    attemptOnePreregistrationHash,
    attemptOneCanonicalBundleHash: attemptOneBundleMeta.contentHash,
    attemptOneVerdict: attemptOneVerdict.verdict,
    runCount: attemptOneAudits.length,
    detectedLeakCount,
    audits: attemptOneAudits,
    interpretation: "attempt-one-cannot-prove-equal-base-context",
  });
  writeJson(join(outputRoot, "audit-probes.json"), {
    schemaVersion: "P0-T17C-audit-probes-v1",
    positiveAudit,
    negativeAudit,
  });
  writeJson(join(outputRoot, "summary.json"), {
    schemaVersion: "P0-T17C-remediation-evidence-v1",
    task: "P0-T17C",
    outcome: "passed",
    capsulePairCount: capsules.length,
    filesystemProbeCount: capsules.length * 2,
    codexBinaryProbeCount: capsules.length * 2,
    distinctBaseContextHashCount: baseContextHashes.size,
    distinctTreatmentHashCount: treatmentHashes.size,
    onlyAllowedDifference: "vem-context.json",
    repositoryVisibleInsideCapsule: false,
    homeVisibleInsideCapsule: false,
    repoRulesOrSkillsVisibleInsideCapsule: false,
    groundTruthMounted: false,
    laterHoldoutMounted: false,
    authCopiedOrRecorded: false,
    networkBoundary: "outer-api-network-retained-inner-codex-readonly-sandbox-required",
    attemptTwoExecuted: false,
    capsuleResidueCount: 0,
    limitations: [
      "NO_ATTEMPT_TWO_RESULT",
      "NO_P0_VALUE_VERDICT_CHANGE",
      "LINUX_BUBBLEWRAP_CAPSULE",
    ],
  });

  const evidenceFiles = collectFiles(outputRoot);
  const lines = evidenceFiles.map((path) => (
    `${sha256(readFileSync(path))}  ${relative(outputRoot, path).replaceAll("\\", "/")}`
  ));
  writeFileSync(join(outputRoot, "SHA256SUMS"), `${lines.join("\n")}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log(JSON.stringify({
    ok: true,
    outputRoot,
    capsulePairCount: capsules.length,
    detectedAttemptOneLeakCount: detectedLeakCount,
    baseContextHash: [...baseContextHashes][0],
    evidenceFileCount: evidenceFiles.length,
    attemptTwoExecuted: false,
  }));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${canonicalJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function collectFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    return entry.isFile() && statSync(path).isFile() ? [path] : [];
  }).sort();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
