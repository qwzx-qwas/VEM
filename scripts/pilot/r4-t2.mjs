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
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import {
  cleanupParticipantCapsule,
  createParticipantCapsule,
  runCodexBinaryIsolationProbe,
} from "./capsule.mjs";
import {
  buildR3PermissionProfileProbeInvocation,
  runR3PermissionProfileProbe,
} from "./r3-capsule.mjs";
import {
  buildR4LocalTransportPreflight,
  classifyR4Attempt,
  planR4Retry,
  sealR4AttemptEvidence,
} from "./r4-transport.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R4-T2");
const R3_PREREGISTRATION_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R3-T3/20260730T114932+0800",
);
const R3_RESULT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R3-T4/20260730T133111-0800",
);
const R3_RUN_ID = "r3-audit-01-containment-heading-1-direct-search";
const R3_RUN_ROOT = join(R3_RESULT_ROOT, "batch/runs", R3_RUN_ID);
const EXPECTED_R3_VERDICT_HASH =
  "7a3e5b6bf94067e4681258982690afe911c51dc3da0e6cc4af66d069d537d95b";
const REPLAY_FILES = Object.freeze([
  "run.json",
  "failure.json",
  "final-response-observation.json",
  "stdout.jsonl",
  "stderr.txt",
  "receipt-ledger.json",
  "SHA256SUMS",
  "R3-SHA256SUMS",
  "r3-terminal/capsule-audit.json",
  "r3-terminal/evaluation.json",
  "r3-terminal/ground-truth-observation.json",
  "r3-terminal/terminal.json",
]);

export function buildR4TransportProof({
  localPreflightRunner = runLocalPreflight,
} = {}) {
  if (typeof localPreflightRunner !== "function") {
    throw new Error("R4_T2_PREFLIGHT_RUNNER_INVALID");
  }
  const verdict = readJson(join(R3_RESULT_ROOT, "results/verdict.json"));
  if (canonicalSha256(verdict) !== EXPECTED_R3_VERDICT_HASH
    || verdict.decisionKey !== "R3-RECOVERY"
    || verdict.verdict !== "stop"
    || !verdict.stopReasons?.includes("protocol-response-integrity-failed")) {
    throw new Error("R4_T2_R3_VERDICT_CHANGED");
  }
  const preflight = localPreflightRunner();
  if (preflight?.modelCall !== false
    || preflight?.networkRuntimeProbed !== false
    || preflight?.providerReachabilityClaimed !== false) {
    throw new Error("R4_T2_PREFLIGHT_INVALID");
  }
  const run = readJson(join(R3_RUN_ROOT, "run.json"));
  const finalResponse = readJson(
    join(R3_RUN_ROOT, "final-response-observation.json"),
  );
  const capsuleAudit = readJson(
    join(R3_RUN_ROOT, "r3-terminal/capsule-audit.json"),
  );
  const terminal = readJson(
    join(R3_RUN_ROOT, "r3-terminal/terminal.json"),
  );
  const failure = readJson(join(R3_RUN_ROOT, "failure.json"));
  const events = readJsonl(join(R3_RUN_ROOT, "stdout.jsonl"));
  const classification = classifyR4Attempt({
    process: run.process,
    finalResponse,
    events,
    capsuleAudit,
    permissionBoundaryPassed: preflight.permissionProfilePassed === true,
    evidenceSealed: terminal.evidenceSealedBeforeReturn === true
      && failure.evidenceSealed === true,
  });
  if (classification.kind
      !== "external-transport-timeout-before-response"
    || classification.retryable !== true) {
    throw new Error("R4_T2_R3_REPLAY_CLASSIFICATION_FAILED");
  }
  const evidenceHashes = Object.fromEntries(REPLAY_FILES.map((path) => [
    path,
    sha256(readFileSync(join(R3_RUN_ROOT, path))),
  ]));
  const attempt = sealR4AttemptEvidence({
    runId: R3_RUN_ID,
    armKey: "r4-r3-timeout-replay-direct",
    attemptNumber: 1,
    classification,
    evidenceHashes,
  });
  const retryDecision = planR4Retry({
    armKey: attempt.armKey,
    attempts: [attempt],
    batchProcessAttemptCount: 1,
  });
  if (retryDecision.action !== "retry"
    || retryDecision.nextAttemptNumber !== 2) {
    throw new Error("R4_T2_RETRY_PLAN_FAILED");
  }
  return Object.freeze({
    schemaVersion: "R4-T2-transport-remediation-proof-v1",
    taskId: "R4-T2",
    outcome: "passed",
    externalModelCallCount: 0,
    r3Input: {
      resultRoot: "docs/test-evidence/R3-T4/20260730T133111-0800",
      verdictHash: EXPECTED_R3_VERDICT_HASH,
      runId: R3_RUN_ID,
      sourceHashes: evidenceHashes,
    },
    localPreflight: preflight,
    replay: {
      classification,
      sealedAttempt: attempt,
      retryDecision,
    },
    sourceBindings: {
      "scripts/pilot/r4-transport.mjs": sha256(readFileSync(
        join(REPO_ROOT, "scripts/pilot/r4-transport.mjs"),
      )),
      "scripts/pilot/r4-t2.mjs": sha256(readFileSync(SCRIPT_PATH)),
    },
    limitations: [
      "LOCAL_PREFLIGHT_DOES_NOT_CLAIM_PROVIDER_REACHABILITY",
      "R3_REPLAY_ONLY_NO_EXTERNAL_RETRY_EXECUTED",
      "NO_PRODUCT_UNLOCK",
    ],
  });
}

export function runLocalPreflight() {
  const capsule = createParticipantCapsule({
    sourceRoot: join(R3_PREREGISTRATION_ROOT, "fixture"),
    taskId: "r3-audit-01-containment-heading",
    arm: "direct-search",
    responseSchemaPath: join(
      R3_PREREGISTRATION_ROOT,
      "inputs/response-schema.json",
    ),
  });
  try {
    const binary = runCodexBinaryIsolationProbe(capsule);
    const permission = runR3PermissionProfileProbe(
      buildR3PermissionProfileProbeInvocation({ capsule }),
    );
    return buildR4LocalTransportPreflight({
      codexVersion: binary.version,
      permissionProbe: permission,
    });
  } finally {
    cleanupParticipantCapsule(capsule);
  }
}

function writeEvidence(outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== EVIDENCE_PARENT || existsSync(output)) {
    throw new Error("R4_T2_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R4_T2_OUTPUT_PARENT_INVALID");
  const proof = buildR4TransportProof();
  mkdirSync(output, { mode: 0o700 });
  const proofBody = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R4-T2 external-transport timeout remediation proof",
    "",
    "- Current Codex/capsule/permission capability passed without a model call.",
    "- Provider reachability was not probed or claimed.",
    "- Immutable R3 timeout evidence classifies as retryable only under the narrow sealed pre-response rule.",
    "- One retry is planned; no retry or external request was executed.",
    "",
  ].join("\n");
  writeFileSync(join(output, "transport-proof.json"), proofBody, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "summary.md"), summary, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "SHA256SUMS"), [
    `${sha256(proofBody)}  transport-proof.json`,
    `${sha256(summary)}  summary.md`,
    "",
  ].join("\n"), {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: "R4-T2",
    proofHash: sha256(proofBody),
    classification: proof.replay.classification.kind,
    externalModelCallCount: 0,
  })}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map(
    (line) => JSON.parse(line),
  );
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
    throw new Error("USAGE: node scripts/pilot/r4-t2.mjs <output-root>");
  }
  writeEvidence(process.argv[2]);
}
