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
} from "./capsule.mjs";
import { verifyR6InvocationCompatibility } from "./r6-invocation-preflight.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R6-T2");
const FIXTURE_ROOT = "docs/test-evidence/R5-T3/20260730T154956-0800/fixture";
const RESPONSE_SCHEMA =
  "docs/test-evidence/R5-T3/20260730T154956-0800/inputs/response-schema.json";
const R4_INTERRUPTION =
  "docs/test-evidence/R4-T4/20260730T144143-0800/results/interruption.json";
const R5_VERDICT =
  "docs/test-evidence/R5-T4/20260730T155920-0800/results/verdict.json";
const SOURCE_FILES = Object.freeze([
  "scripts/pilot/capsule.mjs",
  "scripts/pilot/r2-capsule.mjs",
  "scripts/pilot/r3-capsule.mjs",
  "scripts/pilot/r5-process-terminalizer.mjs",
  "scripts/pilot/r6-invocation-preflight.mjs",
]);

export function buildR6T2Proof(repoRoot = REPO_ROOT, { spawn } = {}) {
  const root = requireDirectory(repoRoot, "R6_T2_REPO_ROOT_INVALID");
  const decisionCapsule = createParticipantCapsule({
    sourceRoot: join(root, FIXTURE_ROOT),
    taskId: "r6-proof-decision",
    arm: "direct-search",
    responseSchemaPath: join(root, RESPONSE_SCHEMA),
  });
  const probeCapsule = createParticipantCapsule({
    sourceRoot: join(root, FIXTURE_ROOT),
    taskId: "r6-proof-probe",
    arm: "direct-search",
    responseSchemaPath: join(root, RESPONSE_SCHEMA),
  });
  try {
    const authFile = join(decisionCapsule.controlRoot, "r6-proof-auth.json");
    writeFileSync(authFile, '{"r6_local_dummy_auth":true}\n', {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    const compatibility = verifyR6InvocationCompatibility({
      decisionCapsule,
      probeCapsule,
      authFile,
      ...(spawn === undefined ? {} : { spawn }),
    });
    const r4InterruptionHash = canonicalSha256(
      readJson(join(root, R4_INTERRUPTION)),
    );
    const r5VerdictHash = canonicalSha256(readJson(join(root, R5_VERDICT)));
    const proof = {
      schemaVersion: "R6-T2-local-proof-v1",
      taskId: "R6-T2",
      outcome: "passed",
      compatibility,
      executionBoundary: {
        participantProcessSpawned: false,
        providerRequestSent: false,
        providerNetworkProbed: false,
        externalProcessCount: 0,
        externalModelCall: false,
      },
      preservedEvidence: {
        r4InterruptionHash,
        r5VerdictHash,
        r4BlockedPendingPreserved: true,
        r5StopPreserved: true,
      },
      sourceBindings: Object.fromEntries(SOURCE_FILES.map((path) => [
        path,
        sha256(readFileSync(join(root, path))),
      ])),
      limitations: [
        "NO_PROVIDER_REACHABILITY_OBSERVATION",
        "NO_EXTERNAL_PROCESS_OR_MODEL_CALL",
        "NO_R6_BATCH_AUTHORIZATION",
      ],
    };
    if (r4InterruptionHash
        !== "95021eac99d93d49985ee46d003a4108ff7a524244d83e3521b8edff8ecffd70"
      || r5VerdictHash
        !== "c04a6631b6285735fa3ff1da0d576e31b1a85b3fbc981a69c25aa4cb27b0a016"
      || compatibility.outerEnvironmentHash
        !== "cf24c3c5e349e230a9c04223dceb4854bd377915e21f46d830134b085bc3579d") {
      throw new Error("R6_T2_PROOF_FAILED");
    }
    return Object.freeze(proof);
  } finally {
    cleanupParticipantCapsule(decisionCapsule);
    cleanupParticipantCapsule(probeCapsule);
  }
}

function writeEvidence(outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== EVIDENCE_PARENT || existsSync(output)) {
    throw new Error("R6_T2_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R6_T2_OUTPUT_PARENT_INVALID");
  const proof = buildR6T2Proof();
  mkdirSync(output, { mode: 0o700 });
  const body = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R6-T2 explicit pre-spawn invocation compatibility",
    "",
    "- Exact R3 decision invocation now carries immutable PATH=/usr/bin:/bin.",
    "- The terminalizer's shared invocation predicate accepts the exact builder output.",
    "- Real local permission probe kept generated-command auth denied and /work read-only.",
    "- No participant process, provider request, network probe or model call occurred.",
    "- R5 stop, R4 blocked/pending and all earlier terminal evidence remain immutable.",
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
    taskId: "R6-T2",
    proofHash: sha256(body),
    outerEnvironmentHash: proof.compatibility.outerEnvironmentHash,
    externalModelCall: false,
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node scripts/pilot/prove-r6-t2.mjs <output-root>");
  }
  writeEvidence(process.argv[2]);
}
