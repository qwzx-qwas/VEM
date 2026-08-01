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
  deriveR6ProviderTerminalCompatibilityContract,
  replayR6T10ProviderTerminalEvidence,
} from "./r6-provider-terminal-remediation.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T11");
const RESULT_RELATIVE_ROOT =
  "docs/test-evidence/R6-T10/20260730T195616-0800";
const RUN_RELATIVE_ROOT = `${RESULT_RELATIVE_ROOT}/runs/`
  + "r6-terminal-01-fallback-heading-direct-search-attempt-1";
const OWNER_STATEMENT =
  "结合文档内容，从当前最新阶段的prompt开始做，每完成一个阶段就在对应的prompt下面标注已完成，以及简短的概述做了什么，同时在每个阶段完成时进行commit push";
const PRIOR_MANIFESTS = Object.freeze([
  [
    "docs/test-evidence/R6-T4/20260730T171100-0800/RESULTS.sha256",
    "89fd404e6ba72dc9397044a9a496c8c0195ede8d64c771dfb0912c7d1d2745d8",
  ],
  [
    "docs/test-evidence/R6-T7/20260730T183547-0800/RESULTS.sha256",
    "2ba2b0537b4fb312e2e82cdd69a7c87b41d05b7117572c5b58978bd300e8fdd7",
  ],
  [
    `${RESULT_RELATIVE_ROOT}/RESULTS.sha256`,
    "a45f1970978996cdbe8df8b99e7b09fd3fbcf4865f76d8eeb504dcde2bead13b",
  ],
]);
const SOURCE_FILES = Object.freeze([
  "scripts/pilot/r6-attempt-policy.mjs",
  "scripts/pilot/r6-provider-terminal-remediation.mjs",
  "scripts/pilot/prove-r6-t11.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);

export function buildR6T11Proof(
  repoRoot = REPO_ROOT,
  { readFile = readFileSync } = {},
) {
  const root = requireDirectory(repoRoot, "R6_T11_REPO_ROOT_INVALID");
  if (typeof readFile !== "function") {
    throw new Error("R6_T11_READ_FILE_INVALID");
  }
  for (const [path, expected] of PRIOR_MANIFESTS) {
    if (sha256(readRaw(join(root, path), readFile)) !== expected) {
      throw new Error("R6_T11_PRIOR_ATTEMPT_CHAIN_CHANGED");
    }
  }
  verifyManifest(
    join(root, RESULT_RELATIVE_ROOT),
    "RESULTS.sha256",
    PRIOR_MANIFESTS[2][1],
    readFile,
  );
  verifyManifest(
    join(root, RUN_RELATIVE_ROOT),
    "SHA256SUMS",
    "495db20af478abdf3f8506d00fc507ac22b3244bf125391e506f49d9688e86de",
    readFile,
  );
  const evidencePaths = {
    authorization: "docs/test-evidence/R6-T10/OWNER_AUTHORIZATION_20260730.json",
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
  const replay = replayR6T10ProviderTerminalEvidence({
    evidenceHashes,
    localPreflight: readJson(join(root, evidencePaths.localPreflight), readFile),
    runIndex: readJson(join(root, evidencePaths.runIndex), readFile),
    verdict: readJson(join(root, evidencePaths.verdict), readFile),
    run: readJson(join(root, evidencePaths.run), readFile),
    boundary: readJson(join(root, evidencePaths.boundary), readFile),
    termination: readJson(join(root, evidencePaths.termination), readFile),
    finalResponse: readJson(join(root, evidencePaths.finalResponse), readFile),
    receiptLedger: readJson(join(root, evidencePaths.receiptLedger), readFile),
    stdout: readRaw(join(root, evidencePaths.stdout), readFile).toString("utf8"),
  });
  const compatibilityContract =
    deriveR6ProviderTerminalCompatibilityContract(replay);
  if (replay.websocketReconnectAttempts.join(",") !== "2,3,4,5"
    || replay.httpsReconnectAttempts.join(",") !== "1,2,3,4,5"
    || replay.fallbackReceipt.elapsedFromSpawnMs !== 123_049
    || replay.providerTerminalReceipt.elapsedFromSpawnMs !== 992_292
    || replay.providerTerminalTimeout !== false
    || replay.runnerDeadlineExpired !== false
    || replay.attemptThreeRetryable !== false
    || compatibilityContract.disposition
      !== "continue-to-preregistration-only"
    || compatibilityContract.boundedRemediationAvailable !== true
    || compatibilityContract.compatibleFutureClassIsTimeout !== false
    || compatibilityContract.exactAttemptFourPolicySelected !== false
    || compatibilityContract.externalExecutionAuthorized !== false
    || compatibilityContract.productUnlockCount !== 0) {
    throw new Error("R6_T11_PROOF_CONTRACT_FAILED");
  }
  return deepFreeze({
    schemaVersion: "R6-T11-local-proof-v1",
    taskId: "R6-T11",
    outcome: "passed",
    ownerAuthorization: {
      statement: OWNER_STATEMENT,
      interpretedScope:
        "local-no-call-provider-terminal-remediation-only",
      prerequisitePublish: {
        commit: "b0317928670214b75dbea10922a2a47388436a4d",
        branch: "agent/complete-p0-r1-stages",
        remoteShaVerifiedBeforeTask: true,
      },
    },
    immutableDecisionAttempts: PRIOR_MANIFESTS.map(([path, hash], index) => ({
      taskId: ["R6-T4", "R6-T7", "R6-T10"][index],
      decisionAttempt: index + 1,
      verdict: "adjust",
      manifestPath: path,
      manifestHash: hash,
      evidenceImmutable: true,
    })),
    replay,
    replayHash: canonicalSha256(replay),
    compatibilityContract,
    executionBoundary: {
      participantProcessSpawned: false,
      providerRequestSent: false,
      providerNetworkProbed: false,
      externalProcessCount: 0,
      externalModelCall: false,
    },
    noRetryPreservation: {
      attemptThreeRetried: false,
      attemptThreeClassificationChanged: false,
      intermediateReconnectTimeoutPromotedToProviderTerminal: false,
      unknownNonTimeoutTerminalUpgradedToRetryable: false,
    },
    nextStage: {
      taskId: "R6-T12",
      noCallPreregistrationStructurallyEligible: true,
      exactAttemptFourPolicySelected: false,
      preregistrationFrozen: false,
      externalExecutionAuthorized: false,
      separatelyAuthorized: false,
    },
    sourceBindings: Object.fromEntries(SOURCE_FILES.map((path) => [
      path,
      sha256(readRaw(join(root, path), readFile)),
    ])),
    limitations: [
      "OBSERVED_ERROR_SEQUENCE_DOES_NOT_PROVE_PROVIDER_ROOT_CAUSE",
      "ATTEMPT_THREE_REMAINS_NONRETRYABLE_UNDER_ITS_FROZEN_POLICY",
      "NO_EXACT_ATTEMPT_FOUR_POLICY_SELECTED_IN_R6_T11",
      "NO_PROVIDER_NETWORK_PROBE_OR_MODEL_CALL",
      "NO_PRODUCT_UNLOCK",
    ],
  });
}

function writeEvidence(outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== EVIDENCE_PARENT || existsSync(output)) {
    throw new Error("R6_T11_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R6_T11_OUTPUT_PARENT_INVALID");
  const proof = buildR6T11Proof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R6-T11 non-timeout provider-terminal remediation",
    "",
    "- Immutable attempts 1, 2 and 3 remain hash-bound and unchanged.",
    "- Ordered receipts distinguish WebSocket and HTTPS reconnect progress.",
    "- The final provider turn.failed is non-timeout error-sending-request.",
    "- Attempt 3 remains protocol-or-unknown and nonretryable under its policy.",
    "- A bounded distinct future class may be preregistered only in R6-T12.",
    "- R6-T11 selects no attempt-4 policy and makes no external call.",
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
    taskId: "R6-T11",
    proofHash: sha256(body),
    compatibilityContractHash: proof.compatibilityContract.contractHash,
    disposition: proof.compatibilityContract.disposition,
    attemptThreeRetryable: proof.replay.attemptThreeRetryable,
    externalModelCall: false,
  })}\n`);
}

function verifyManifest(root, name, expectedHash, readFile) {
  const body = readRaw(join(root, name), readFile);
  if (sha256(body) !== expectedHash) {
    throw new Error("R6_T11_RESULT_MANIFEST_CHANGED");
  }
  const lines = body.toString("utf8").trimEnd().split("\n");
  if (lines.length < 1) throw new Error("R6_T11_RESULT_MANIFEST_INVALID");
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/u.exec(line);
    if (match === null) throw new Error("R6_T11_RESULT_MANIFEST_INVALID");
    const path = resolve(root, match[2]);
    const rel = relative(root, path);
    if (rel === ".." || rel.startsWith(`..${sep}`) || rel === "") {
      throw new Error("R6_T11_RESULT_MANIFEST_INVALID");
    }
    requireRegular(path, "R6_T11_RESULT_MANIFEST_INVALID");
    if (sha256(readRaw(path, readFile)) !== match[1]) {
      throw new Error("R6_T11_RESULT_MANIFEST_ENTRY_CHANGED");
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
  throw new Error("R6_T11_READ_FILE_INVALID");
}

function readJson(path, readFile) {
  try {
    return JSON.parse(readRaw(path, readFile).toString("utf8"));
  } catch {
    throw new Error("R6_T11_JSON_INVALID");
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
      "USAGE: node scripts/pilot/prove-r6-t11.mjs write <output-root>",
    );
  }
  writeEvidence(process.argv[3]);
}
