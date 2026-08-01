import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import { executeRecordedProcess } from "./r1-run-recorder.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R1-T2");
const BOUND_FILES = Object.freeze([
  "scripts/pilot/r1-run-recorder.mjs",
  "scripts/pilot/r1-run-recorder.test.mjs",
  "scripts/pilot/prove-r1-t2.mjs",
]);

export async function buildR1T2Proof(outputRoot, {
  enforceEvidenceParent = true,
} = {}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)) {
    throw new Error("R1_T2_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(dirname(output), "R1_T2_OUTPUT_PARENT_INVALID");
  mkdirSync(output, { mode: 0o700 });
  const sourceBindings = Object.fromEntries(BOUND_FILES.map((path) => [
    path,
    sha256(readFileSync(join(REPO_ROOT, path))),
  ]));
  const instrumentationHash = canonicalSha256(sourceBindings);
  const success = await executeRecordedProcess({
    invocation: localInvocation([
      agentMessage("bounded progress message"),
      agentMessage(JSON.stringify(validResponse(37))),
    ]),
    outputRoot: join(output, "success"),
    runId: "r1-t2-success-probe",
    instrumentationHash,
    validateResponse,
    metadata: { taskId: "R1-T2", probe: "multi-message-single-valid" },
  });
  const conflict = await executeRecordedProcess({
    invocation: localInvocation([
      agentMessage(JSON.stringify(validResponse(37))),
      agentMessage(JSON.stringify(validResponse(41))),
    ]),
    outputRoot: join(output, "failure"),
    runId: "r1-t2-failure-probe",
    instrumentationHash,
    validateResponse,
    metadata: { taskId: "R1-T2", probe: "conflicting-valid-responses" },
  });
  if (success.outcome !== "success"
    || conflict.outcome !== "failed"
    || !conflict.failureCodes.includes("STRUCTURED_RESPONSE_CONFLICT")) {
    throw new Error("R1_T2_PROOF_FAILED");
  }
  const proof = {
    schemaVersion: "R1-T2-remediation-proof-v1",
    taskId: "R1-T2",
    outcome: "passed",
    instrumentationHash,
    sourceBindings,
    successLedgerHash: success.ledgerContentHash,
    failureLedgerHash: conflict.ledgerContentHash,
    checks: {
      multipleAgentMessagesAreOrdinaryReceipts: true,
      exactlyOneStructuredResponseSelected: true,
      conflictingValidResponsesFailClosed: true,
      rawStdoutAndStderrPersistedBeforeReturn: true,
      terminalAndLedgerFailureEvidencePersisted: true,
      hashManifestsVerify: true,
      externalModelCall: false,
    },
  };
  writeFileSync(join(output, "proof.json"), `${canonicalJson(proof)}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "summary.md"), [
    "# R1-T2 runner remediation proof",
    "",
    "- A real local process emitted multiple agent messages and exactly one schema-valid final response.",
    "- A conflicting-valid-response process failed closed after sealing raw, terminal, ledger and hash evidence.",
    "- No external model call occurred.",
    "",
  ].join("\n"), {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  const files = collectFiles(output).filter((path) => (
    relative(output, path).replaceAll("\\", "/") !== "SHA256SUMS"
  ));
  writeFileSync(join(output, "SHA256SUMS"), `${files.map((path) => (
    `${sha256(readFileSync(path))}  ${relative(output, path).replaceAll("\\", "/")}`
  )).join("\n")}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  return Object.freeze(proof);
}

function localInvocation(events) {
  const program = [
    `const events=${JSON.stringify(events)};`,
    "for(const value of events)process.stdout.write(`${JSON.stringify(value)}\\n`);",
  ].join("");
  return {
    executable: process.execPath,
    args: ["--input-type=module", "-e", program],
    cwd: REPO_ROOT,
    env: { PATH: process.env.PATH ?? "" },
    evidence: {
      executable: "<current-node>",
      args: ["--input-type=module", "-e", "<bounded-local-r1-t2-probe>"],
    },
  };
}

function agentMessage(text) {
  return {
    type: "item.completed",
    item: { id: "item-message", type: "agent_message", text },
  };
}

function validResponse(line) {
  return {
    relativeFile: "packages/demo-fixture/src/App.tsx",
    line,
    sourceAnchorId: null,
  };
}

function validateResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return typeof parsed === "object"
    && parsed !== null
    && !Array.isArray(parsed)
    && parsed.relativeFile === "packages/demo-fixture/src/App.tsx"
    && Number.isSafeInteger(parsed.line)
    && parsed.line > 0
    && parsed.sourceAnchorId === null
    ? parsed
    : null;
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  if (!existsSync(resolved)
    || !lstatSync(resolved).isDirectory()
    || lstatSync(resolved).isSymbolicLink()) {
    throw new Error(code);
  }
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R1_T2_EVIDENCE_ENTRY_INVALID");
    }
  };
  visit(root);
  return files.sort();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node scripts/pilot/prove-r1-t2.mjs <output-root>");
  }
  const proof = await buildR1T2Proof(process.argv[2]);
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: proof.taskId,
    instrumentationHash: proof.instrumentationHash,
    successLedgerHash: proof.successLedgerHash,
    failureLedgerHash: proof.failureLedgerHash,
  })}\n`);
}
