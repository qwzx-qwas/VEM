import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import {
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import { runR2FinalOutputIsolationProbe } from "./r2-capsule.mjs";
import {
  classifyR2ResponseOutcome,
  executeR2RecordedProcess,
} from "./r2-run-recorder.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R2-T2");
const R1_PREREGISTRATION = join(
  REPO_ROOT,
  "docs/test-evidence/R1-T3/20260729T203631+0800",
);
const RUNTIME_SOURCE_PATHS = Object.freeze([
  "scripts/pilot/r2-run-recorder.mjs",
  "scripts/pilot/r2-capsule.mjs",
  "packages/pilot-harness/dist/canonical.js",
  "packages/pilot-harness/dist/index.js",
]);

export async function buildR2T2Proof({
  outputRoot,
  enforceEvidenceParent = true,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)) {
    throw new Error("R2_T2_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R2_T2_OUTPUT_PARENT_INVALID",
  );
  mkdirSync(output, { mode: 0o700 });
  const instrumentationHash = canonicalSha256(Object.fromEntries(
    RUNTIME_SOURCE_PATHS.map((path) => [path, sha256(readFileSync(join(REPO_ROOT, path)))]),
  ));
  const correct = response(7, "vem1_1fca6dac19137a546084bc64ae003bc0");
  const success = await executeProbe({
    output,
    name: "success",
    events: [
      event("thread.started", { thread_id: "r2-local-success" }),
      agentMessage(JSON.stringify(response(1, null))),
      agentMessage(JSON.stringify(correct)),
      event("turn.completed", {}),
    ],
    finalText: JSON.stringify(correct),
    instrumentationHash,
  });
  const failure = await executeProbe({
    output,
    name: "failure",
    events: [
      agentMessage(JSON.stringify(correct)),
      event("turn.completed", {}),
    ],
    finalText: JSON.stringify(response(8, null)),
    instrumentationHash,
  });
  const classified = classifyR2ResponseOutcome({
    recorded: failure,
    responseMatchesGroundTruth: false,
  });

  const capsule = createParticipantCapsule({
    sourceRoot: join(R1_PREREGISTRATION, "fixture"),
    taskId: "r2-t2-proof",
    arm: "direct-search",
    responseSchemaPath: join(R1_PREREGISTRATION, "inputs/response-schema.json"),
  });
  let capsuleBoundary;
  try {
    capsuleBoundary = runR2FinalOutputIsolationProbe(capsule);
  } finally {
    cleanupParticipantCapsule(capsule);
  }
  const proof = {
    schemaVersion: "R2-T2-final-output-authority-proof-v1",
    taskId: "R2-T2",
    outcome: success.outcome === "success"
      && failure.failureCodes.includes("AUTHORITATIVE_RESPONSE_AUDIT_MISMATCH")
      && classified.protocolFailure
      && !classified.wrongAttribution
      && classified.evidenceSealed
      && !classified.successfulResponseComplete
      && capsuleBoundary.ok
      ? "passed" : "failed",
    instrumentationHash,
    externalModelCalls: 0,
    selectedResponse: success.selectedResponse,
    responseAuthority: "codex-output-last-message-runner-owned-file",
    jsonlRole: "audit-events-not-final-response-candidates",
    protocolFailureSeparatedFromWrongAttribution: classified.protocolFailure
      && !classified.wrongAttribution,
    successEvidenceSealed: success.evidenceSealed,
    failureEvidenceSealed: failure.evidenceSealed,
    capsuleBoundary: {
      workspaceWritable: capsuleBoundary.workspaceWritable,
      outputSiblingWritable: capsuleBoundary.outputSiblingWritable,
      authoritativeFileWritable: capsuleBoundary.authoritativeFileWritable,
    },
    sourceBindings: Object.fromEntries(RUNTIME_SOURCE_PATHS.map((path) => [
      path,
      sha256(readFileSync(join(REPO_ROOT, path))),
    ])),
  };
  if (proof.outcome !== "passed") throw new Error("R2_T2_PROOF_FAILED");
  writeFileSync(join(output, "proof.json"), `${canonicalJson(proof)}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "SHA256SUMS"), `${collectFiles(output)
    .filter((path) => !path.endsWith("/SHA256SUMS"))
    .map((path) => `${sha256(readFileSync(path))}  ${relative(output, path).replaceAll("\\", "/")}`)
    .join("\n")}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  return Object.freeze(proof);
}

async function executeProbe({ output, name, events, finalText, instrumentationHash }) {
  const control = mkdtempSync(join(tmpdir(), `vem-r2-t2-${name}-`));
  const finalPath = join(control, "final-response.json");
  const program = [
    `const events=${JSON.stringify(events)};`,
    "for(const value of events)process.stdout.write(`${JSON.stringify(value)}\\n`);",
    `require("node:fs").writeFileSync(${JSON.stringify(finalPath)},${JSON.stringify(finalText)});`,
  ].join("");
  try {
    return await executeR2RecordedProcess({
      invocation: {
        executable: process.execPath,
        args: ["-e", program],
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH ?? "" },
        authoritativeResponsePath: finalPath,
        evidence: { probe: `R2-T2-${name}`, externalModelCall: false },
      },
      outputRoot: join(output, name),
      runId: `r2-t2-${name}`,
      instrumentationHash,
      validateResponse,
      metadata: { externalModelCall: false },
    });
  } finally {
    rmSync(control, { recursive: true, force: true });
  }
}

function validateResponse(text) {
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "line,relativeFile,sourceAnchorId"
    && value.relativeFile === "packages/demo-fixture/src/App.tsx"
    && Number.isSafeInteger(value.line)
    && value.line > 0
    && (value.sourceAnchorId === null || /^vem1_[a-f0-9]{32}$/u.test(value.sourceAnchorId))
    ? value : null;
}

function response(line, sourceAnchorId) {
  return { relativeFile: "packages/demo-fixture/src/App.tsx", line, sourceAnchorId };
}
function event(type, extra) { return { type, ...extra }; }
function agentMessage(text) {
  return event("item.completed", { item: { id: "message", type: "agent_message", text } });
}
function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R2_T2_EVIDENCE_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R2_T2_EVIDENCE_NON_REGULAR_REJECTED");
    }
  };
  visit(root);
  return files.sort();
}
function requireDirectory(path, code) {
  const resolved = resolve(path);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
  return resolved;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node scripts/pilot/prove-r2-t2.mjs <output-root>");
  }
  const proof = await buildR2T2Proof({ outputRoot: process.argv[2] });
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: proof.taskId,
    instrumentationHash: proof.instrumentationHash,
    externalModelCalls: 0,
  })}\n`);
}
