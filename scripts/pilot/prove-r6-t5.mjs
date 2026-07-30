import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import {
  deriveR6DeadlineRequirements,
  replayR6T4DeadlineEvidence,
} from "./r6-deadline-horizon.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T5");
const RESULT_RELATIVE_ROOT =
  "docs/test-evidence/R6-T4/20260730T171100-0800";
const RUN_RELATIVE_ROOT = `${RESULT_RELATIVE_ROOT}/runs/`
  + "r6-invocation-01-env-heading-direct-search-attempt-1";
const OWNER_STATEMENT =
  "授权执行 R6-T5 本地 retry-horizon / outer-deadline remediation；"
  + "只使用不可变 R6-T4 证据，不调用外部模型，不覆盖 attempt 1，"
  + "不解锁产品工作。";
const SOURCE_FILES = Object.freeze([
  "scripts/pilot/r6-deadline-horizon.mjs",
  "scripts/pilot/prove-r6-t5.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);
export function buildR6T5Proof(
  repoRoot = REPO_ROOT,
  { readFile = readFileSync } = {},
) {
  const root = requireDirectory(repoRoot, "R6_T5_REPO_ROOT_INVALID");
  if (typeof readFile !== "function") {
    throw new Error("R6_T5_READ_FILE_INVALID");
  }
  const resultRoot = join(root, RESULT_RELATIVE_ROOT);
  verifyResultManifest(resultRoot, readFile);
  const evidencePaths = {
    resultsManifest: `${RESULT_RELATIVE_ROOT}/RESULTS.sha256`,
    localPreflight: `${RESULT_RELATIVE_ROOT}/results/local-preflight.json`,
    verdict: `${RESULT_RELATIVE_ROOT}/results/verdict.json`,
    run: `${RUN_RELATIVE_ROOT}/run.json`,
    boundary: `${RUN_RELATIVE_ROOT}/boundary-state.json`,
    termination: `${RUN_RELATIVE_ROOT}/termination.json`,
    finalResponse: `${RUN_RELATIVE_ROOT}/final-response-observation.json`,
    receiptLedger: `${RUN_RELATIVE_ROOT}/receipt-ledger.json`,
    stdout: `${RUN_RELATIVE_ROOT}/stdout.jsonl`,
  };
  const evidenceHashes = Object.fromEntries(
    Object.entries(evidencePaths).map(([key, path]) => [
      key,
      sha256(readRaw(join(root, path), readFile)),
    ]),
  );
  const replay = replayR6T4DeadlineEvidence({
    evidenceHashes,
    localPreflight: readJson(
      join(root, evidencePaths.localPreflight),
      readFile,
    ),
    verdict: readJson(join(root, evidencePaths.verdict), readFile),
    run: readJson(join(root, evidencePaths.run), readFile),
    boundary: readJson(join(root, evidencePaths.boundary), readFile),
    termination: readJson(join(root, evidencePaths.termination), readFile),
    finalResponse: readJson(
      join(root, evidencePaths.finalResponse),
      readFile,
    ),
    receiptLedger: readJson(
      join(root, evidencePaths.receiptLedger),
      readFile,
    ),
    stdout: readRaw(join(root, evidencePaths.stdout), readFile)
      .toString("utf8"),
  });
  const compatibilityContract = deriveR6DeadlineRequirements(replay);
  if (replay.runnerDeadlinePolicyMs !== 120_000
    || replay.providerTerminalObserved !== false
    || replay.reconnectLogAuthorizesRetry !== false
    || replay.classification
      !== "runner-wall-clock-terminated-before-response"
    || compatibilityContract.minimumExplicitProviderRetryHorizonMs
      !== 120_006
    || compatibilityContract.minimumTerminalObservationMarginMs !== 31_574
    || compatibilityContract.minimumOuterDeadlineMs !== 151_580
    || compatibilityContract.exactAttemptTwoDeadlineSelected !== false
    || compatibilityContract.externalExecutionAuthorized !== false) {
    throw new Error("R6_T5_PROOF_CONTRACT_FAILED");
  }
  return deepFreeze({
    schemaVersion: "R6-T5-local-proof-v1",
    taskId: "R6-T5",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      scope: "local-evidence-replay-and-deadline-contract-only",
    },
    attemptOne: {
      taskId: "R6-T4",
      decisionAttempt: 1,
      decision: "adjust",
      resultRoot: RESULT_RELATIVE_ROOT,
      resultManifestHash: evidenceHashes.resultsManifest,
      verdictHash: evidenceHashes.verdict,
      replayHash: canonicalSha256(replay),
      evidenceImmutable: true,
    },
    replay,
    compatibilityContract,
    executionBoundary: {
      participantProcessSpawned: false,
      providerRequestSent: false,
      providerNetworkProbed: false,
      externalProcessCount: 0,
      externalModelCall: false,
    },
    preservedSafety: {
      processTreeTerminationRequired: true,
      gracefulSignal: "SIGTERM",
      forceSignal: "SIGKILL",
      runnerTerminationRetryable: false,
      maxRetriesPerArm: 1,
      maxProcessAttempts: 20,
      everyAttemptConsumesBudget: true,
      everyAttemptEvidenceRetained: true,
      productUnlockCount: 0,
    },
    nextStage: {
      taskId: "R6-T6",
      exactDeadlineSelected: false,
      preregistrationFrozen: false,
      externalExecutionAuthorized: false,
      requiresExplicitHorizonProvenance: true,
    },
    sourceBindings: Object.fromEntries(SOURCE_FILES.map((path) => [
      path,
      sha256(readRaw(join(root, path), readFile)),
    ])),
    limitations: [
      "RECONNECT_LOG_PROVES_ONLY_AN_INCOMPLETE_HORIZON_LOWER_BOUND",
      "NO_EXACT_ATTEMPT_TWO_DEADLINE_SELECTED_IN_R6_T5",
      "NO_PROVIDER_NETWORK_PROBE_OR_MODEL_CALL",
      "NO_PRODUCT_UNLOCK",
    ],
  });
}

function writeEvidence(outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== EVIDENCE_PARENT || existsSync(output)) {
    throw new Error("R6_T5_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R6_T5_OUTPUT_PARENT_INVALID");
  const proof = buildR6T5Proof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R6-T5 retry-horizon / outer-deadline remediation",
    "",
    "- Immutable R6-T4 receipts replay reconnect 2/5, 3/5 and 4/5.",
    "- The 120000 ms runner deadline occurred without a provider terminal.",
    "- Reconnect progress remains non-authorizing and runner termination remains non-retryable.",
    "- Attempt two must bind an explicit finite provider horizon and observation margin.",
    "- R6-T5 selects no exact deadline, freezes no preregistration and makes no external call.",
    "",
  ].join("\n");
  writeFileSync(join(output, "proof.json"), body, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "summary.md"), summary, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "SHA256SUMS"), [
    `${sha256(body)}  proof.json`,
    `${sha256(summary)}  summary.md`,
    "",
  ].join("\n"), {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: "R6-T5",
    proofHash: sha256(body),
    compatibilityContractHash: proof.compatibilityContract.contractHash,
    minimumOuterDeadlineMs:
      proof.compatibilityContract.minimumOuterDeadlineMs,
    externalModelCall: false,
  })}\n`);
}

function verifyResultManifest(resultRoot, readFile) {
  const manifestPath = join(resultRoot, "RESULTS.sha256");
  const body = readRaw(manifestPath, readFile);
  if (sha256(body)
    !== "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8") {
    throw new Error("R6_T5_RESULT_MANIFEST_CHANGED");
  }
  const lines = body.toString("utf8").trimEnd().split("\n");
  if (lines.length < 1) throw new Error("R6_T5_RESULT_MANIFEST_INVALID");
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/u.exec(line);
    if (match === null) throw new Error("R6_T5_RESULT_MANIFEST_INVALID");
    const path = resolve(resultRoot, match[2]);
    const rel = relative(resultRoot, path);
    if (rel === ".." || rel.startsWith(`..${sep}`) || rel === "") {
      throw new Error("R6_T5_RESULT_MANIFEST_INVALID");
    }
    requireRegular(path, "R6_T5_RESULT_MANIFEST_INVALID");
    if (sha256(readRaw(path, readFile)) !== match[1]) {
      throw new Error("R6_T5_RESULT_MANIFEST_ENTRY_CHANGED");
    }
  }
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

function requireRegular(path, code) {
  if (!existsSync(path)
    || !lstatSync(path).isFile()
    || lstatSync(path).isSymbolicLink()) {
    throw new Error(code);
  }
}

function readRaw(path, readFile) {
  const value = readFile(path);
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw new Error("R6_T5_READ_FILE_INVALID");
}

function readJson(path, readFile) {
  try {
    return JSON.parse(readRaw(path, readFile).toString("utf8"));
  } catch {
    throw new Error("R6_T5_JSON_INVALID");
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node scripts/pilot/prove-r6-t5.mjs <output-root>");
  }
  writeEvidence(process.argv[2]);
}
