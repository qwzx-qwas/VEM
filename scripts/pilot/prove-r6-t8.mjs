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
  deriveR6DualTransportDeadlineRequirements,
  replayR6T7DualTransportEvidence,
} from "./r6-dual-transport-horizon.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T8");
const RESULT_RELATIVE_ROOT =
  "docs/test-evidence/R6-T7/20260730T183547-0800";
const RUN_RELATIVE_ROOT = `${RESULT_RELATIVE_ROOT}/runs/`
  + "r6-deadline-01-horizon-heading-direct-search-attempt-1";
const OWNER_STATEMENT = "授权，还有记得commit push";
const R6_T4_RESULT_MANIFEST_HASH =
  "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8";
const R6_T5_PROOF_HASH =
  "82585caca431e25e6bc0f8a7737cdab4a437ecd5cf8ebbb88eb6158c5c719fcb";
const R6_T6_PREREGISTRATION_FILE_HASH =
  "d9c25c731e21493702743f9b045c47b086275214ac9027630272ed108ffea35c";
const SOURCE_FILES = Object.freeze([
  "scripts/pilot/r6-dual-transport-horizon.mjs",
  "scripts/pilot/prove-r6-t8.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);

export function buildR6T8Proof(
  repoRoot = REPO_ROOT,
  { readFile = readFileSync } = {},
) {
  const root = requireDirectory(repoRoot, "R6_T8_REPO_ROOT_INVALID");
  if (typeof readFile !== "function") {
    throw new Error("R6_T8_READ_FILE_INVALID");
  }
  verifyPriorChain(root, readFile);
  const resultRoot = join(root, RESULT_RELATIVE_ROOT);
  verifyManifest(
    resultRoot,
    "RESULTS.sha256",
    "2ba2b0537b4fb312e2e82cdd69a7c87b41d05b7117572c5b58978bd300e8fdd7",
    readFile,
  );
  verifyManifest(
    join(root, RUN_RELATIVE_ROOT),
    "SHA256SUMS",
    "13113f8ee9d46a1182be1d23eb4ec6784e7b9c4340543df3d4d7c7c7849a1e4b",
    readFile,
  );
  const evidencePaths = {
    authorization: "docs/test-evidence/R6-T7/OWNER_AUTHORIZATION_20260730.json",
    resultsManifest: `${RESULT_RELATIVE_ROOT}/RESULTS.sha256`,
    localPreflight: `${RESULT_RELATIVE_ROOT}/results/local-preflight.json`,
    runIndex: `${RESULT_RELATIVE_ROOT}/results/run-index.json`,
    verdict: `${RESULT_RELATIVE_ROOT}/results/verdict.json`,
    attemptManifest: `${RUN_RELATIVE_ROOT}/SHA256SUMS`,
    run: `${RUN_RELATIVE_ROOT}/run.json`,
    boundary: `${RUN_RELATIVE_ROOT}/boundary-state.json`,
    failure: `${RUN_RELATIVE_ROOT}/failure.json`,
    termination: `${RUN_RELATIVE_ROOT}/termination.json`,
    finalResponse: `${RUN_RELATIVE_ROOT}/final-response-observation.json`,
    receiptLedger: `${RUN_RELATIVE_ROOT}/receipt-ledger.json`,
    stdout: `${RUN_RELATIVE_ROOT}/stdout.jsonl`,
    stderr: `${RUN_RELATIVE_ROOT}/stderr.txt`,
  };
  const evidenceHashes = Object.fromEntries(
    Object.entries(evidencePaths).map(([key, path]) => [
      key,
      sha256(readRaw(join(root, path), readFile)),
    ]),
  );
  const replay = replayR6T7DualTransportEvidence({
    evidenceHashes,
    localPreflight: readJson(
      join(root, evidencePaths.localPreflight),
      readFile,
    ),
    runIndex: readJson(join(root, evidencePaths.runIndex), readFile),
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
  const compatibilityContract =
    deriveR6DualTransportDeadlineRequirements(replay);
  if (replay.runnerDeadlinePolicyMs !== 600_000
    || replay.observedDualTransportTerminalHorizonLowerBoundMs !== 600_000
    || replay.duplicateCrossTransportRawHashCount !== 2
    || replay.providerTerminalObserved !== false
    || replay.reconnectLogAuthorizesRetry !== false
    || replay.classification
      !== "runner-wall-clock-terminated-before-response"
    || compatibilityContract.disposition
      !== "continue-to-preregistration-only"
    || compatibilityContract.boundedEnvelopeAvailable !== true
    || compatibilityContract.minimumExplicitProviderTerminalHorizonMs
      !== 600_001
    || compatibilityContract.minimumTerminalObservationMarginMs !== 308_226
    || compatibilityContract.minimumOuterDeadlineMs !== 908_227
    || compatibilityContract.maximumOuterDeadlineMs !== 1_200_000
    || compatibilityContract.exactAttemptThreeDeadlineSelected !== false
    || compatibilityContract.externalExecutionAuthorized !== false) {
    throw new Error("R6_T8_PROOF_CONTRACT_FAILED");
  }
  return deepFreeze({
    schemaVersion: "R6-T8-local-proof-v1",
    taskId: "R6-T8",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      interpretedScope:
        "local-no-call-dual-transport-horizon-remediation-only",
      prerequisitePublish: {
        commit: "d3dca37e0aa2560238e81bc6639081cb6ecd321f",
        branch: "agent/complete-p0-r1-stages",
        remoteShaVerifiedBeforeTask: true,
      },
    },
    attemptOne: {
      taskId: "R6-T4",
      decisionAttempt: 1,
      decision: "adjust",
      resultManifestHash: R6_T4_RESULT_MANIFEST_HASH,
      evidenceImmutable: true,
    },
    attemptTwo: {
      taskId: "R6-T7",
      decisionAttempt: 2,
      supersedesAttempt: "R6-T4",
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
      orderedReceiptCorrelationRequired: true,
      rawHashUniquenessAssumed: false,
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
      taskId: "R6-T9",
      noCallPreregistrationStructurallyEligible: true,
      exactDeadlineSelected: false,
      preregistrationFrozen: false,
      externalExecutionAuthorized: false,
      separatelyAuthorized: false,
      requiresExplicitTerminalHorizonProvenance: true,
    },
    sourceBindings: Object.fromEntries(SOURCE_FILES.map((path) => [
      path,
      sha256(readRaw(join(root, path), readFile)),
    ])),
    limitations: [
      "RECONNECT_LOG_PROVES_ONLY_AN_INCOMPLETE_DUAL_TRANSPORT_LOWER_BOUND",
      "RAW_HASH_IS_NOT_A_UNIQUE_TRANSPORT_RECEIPT_IDENTITY",
      "NO_EXACT_ATTEMPT_THREE_DEADLINE_SELECTED_IN_R6_T8",
      "NO_PROVIDER_NETWORK_PROBE_OR_MODEL_CALL",
      "NO_PRODUCT_UNLOCK",
    ],
  });
}

function writeEvidence(outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== EVIDENCE_PARENT || existsSync(output)) {
    throw new Error("R6_T8_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R6_T8_OUTPUT_PARENT_INVALID");
  const proof = buildR6T8Proof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R6-T8 dual-transport terminal-horizon remediation",
    "",
    "- Immutable R6-T7 receipts separate WebSocket and HTTPS by ordered fallback boundary.",
    "- Two reconnect raw hashes repeat across transports and remain distinct receipts.",
    "- The 600000 ms runner deadline occurred without provider terminal or final response.",
    "- The bounded compatibility floor is 600001 ms horizon plus 308226 ms margin.",
    "- R6-T8 selects no exact deadline, freezes no preregistration and makes no external call.",
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
    taskId: "R6-T8",
    proofHash: sha256(body),
    compatibilityContractHash: proof.compatibilityContract.contractHash,
    disposition: proof.compatibilityContract.disposition,
    minimumOuterDeadlineMs:
      proof.compatibilityContract.minimumOuterDeadlineMs,
    maximumOuterDeadlineMs:
      proof.compatibilityContract.maximumOuterDeadlineMs,
    externalModelCall: false,
  })}\n`);
}

function verifyPriorChain(root, readFile) {
  const inputs = [
    [
      "docs/test-evidence/R6-T4/20260730T171100-0800/RESULTS.sha256",
      R6_T4_RESULT_MANIFEST_HASH,
    ],
    [
      "docs/test-evidence/R6-T5/20260730T174418-0800/proof.json",
      R6_T5_PROOF_HASH,
    ],
    [
      "docs/test-evidence/R6-T6/20260730T180734-0800/PREREGISTRATION.sha256",
      R6_T6_PREREGISTRATION_FILE_HASH,
    ],
  ];
  for (const [path, expected] of inputs) {
    if (sha256(readRaw(join(root, path), readFile)) !== expected) {
      throw new Error("R6_T8_PRIOR_ATTEMPT_CHAIN_CHANGED");
    }
  }
}

function verifyManifest(root, name, expectedHash, readFile) {
  const manifestPath = join(root, name);
  const body = readRaw(manifestPath, readFile);
  if (sha256(body) !== expectedHash) {
    throw new Error("R6_T8_RESULT_MANIFEST_CHANGED");
  }
  const lines = body.toString("utf8").trimEnd().split("\n");
  if (lines.length < 1) throw new Error("R6_T8_RESULT_MANIFEST_INVALID");
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/u.exec(line);
    if (match === null) throw new Error("R6_T8_RESULT_MANIFEST_INVALID");
    const path = resolve(root, match[2]);
    const rel = relative(root, path);
    if (rel === ".." || rel.startsWith(`..${sep}`) || rel === "") {
      throw new Error("R6_T8_RESULT_MANIFEST_INVALID");
    }
    requireRegular(path, "R6_T8_RESULT_MANIFEST_INVALID");
    if (sha256(readRaw(path, readFile)) !== match[1]) {
      throw new Error("R6_T8_RESULT_MANIFEST_ENTRY_CHANGED");
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
  throw new Error("R6_T8_READ_FILE_INVALID");
}

function readJson(path, readFile) {
  try {
    return JSON.parse(readRaw(path, readFile).toString("utf8"));
  } catch {
    throw new Error("R6_T8_JSON_INVALID");
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
  if (process.argv.length !== 4 || process.argv[2] !== "write") {
    throw new Error(
      "USAGE: node scripts/pilot/prove-r6-t8.mjs write <output-root>",
    );
  }
  writeEvidence(process.argv[3]);
}
