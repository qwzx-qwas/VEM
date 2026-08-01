import { spawn } from "node:child_process";
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
  TrustedReceiptLedger,
} from "../../packages/pilot-harness/dist/index.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R0-T2");

const CHILD_PROGRAM = [
  "const emit=(value)=>process.stdout.write(`${JSON.stringify(value)}\\n`);",
  "emit({type:'thread.started',thread_id:'probe-thread-not-exported'});",
  "emit({type:'item.started',item:{id:'item_0',type:'command_execution'}});",
  "process.stderr.write('bounded probe diagnostic\\n');",
  "emit({type:'item.completed',item:{id:'item_0',type:'agent_message',text:'{\"ok\":true}'}});",
  "emit({type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:1,reasoning_output_tokens:0}});",
].join("");

const BOUND_FILES = Object.freeze([
  "packages/pilot-harness/src/receipt-ledger.ts",
  "packages/pilot-harness/src/receipt-ledger.test.ts",
  "packages/pilot-harness/src/index.ts",
  "packages/pilot-harness/package.json",
  "scripts/pilot/prove-r0-t2.mjs",
]);

export async function runReceiptLedgerProbe({
  nodeExecutable = process.execPath,
  nowNs = process.hrtime.bigint,
} = {}) {
  const instrumentationHash = canonicalSha256(Object.fromEntries(
    BOUND_FILES.map((path) => [path, sha256(readFileSync(join(REPO_ROOT, path)))]),
  ));
  const args = ["--input-type=module", "-e", CHILD_PROGRAM];
  const ledger = new TrustedReceiptLedger({
    runId: "r0-t2-real-process-probe",
    instrumentationHash,
    clockDomain: "node:process.hrtime.bigint",
    nowNs,
  });
  const child = spawn(nodeExecutable, args, {
    cwd: REPO_ROOT,
    env: {
      PATH: process.env.PATH ?? "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutEventCount = 0;
  let structuredResponseCount = 0;
  let captureError;
  let stdoutBuffer = "";
  const recordLine = (line) => {
    try {
      ledger.recordStdoutEvent(line);
      stdoutEventCount += 1;
      const event = JSON.parse(line);
      if (event.type === "item.completed"
        && event.item?.type === "agent_message"
        && typeof event.item.text === "string") {
        ledger.recordStructuredResponse(event.item.text);
        structuredResponseCount += 1;
      }
    } catch (error) {
      captureError ??= error;
      child.kill("SIGTERM");
    }
  };
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    if (Buffer.byteLength(stdoutBuffer, "utf8") > 1_048_576) {
      captureError ??= new Error("R0_T2_STDOUT_LINE_LIMIT_EXCEEDED");
      child.kill("SIGTERM");
      return;
    }
    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      recordLine(line);
      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  });
  const stdoutClosed = new Promise((resolvePromise) => {
    child.stdout.once("close", () => {
      if (stdoutBuffer.length > 0) recordLine(stdoutBuffer);
      stdoutBuffer = "";
      resolvePromise();
    });
  });
  child.stderr.on("data", (chunk) => {
    try {
      ledger.recordStderrChunk(new Uint8Array(chunk));
    } catch (error) {
      captureError ??= error;
      child.kill("SIGTERM");
    }
  });
  const stderrClosed = new Promise((resolvePromise) => {
    child.stderr.once("close", resolvePromise);
  });
  ledger.recordProcessSpawned(canonicalSha256({
    executable: nodeExecutable,
    args,
    cwd: "<canonical-repo-root>",
    environmentAllowlist: ["PATH"],
  }));

  const terminalPromise = new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", (exitCode, signal) => resolvePromise({ exitCode, signal }));
  });
  const [terminal] = await Promise.all([
    terminalPromise,
    stdoutClosed,
    stderrClosed,
  ]);
  if (captureError !== undefined) throw captureError;
  if (terminal.exitCode === 0 && structuredResponseCount !== 1) {
    throw new Error(
      `R0_T2_STRUCTURED_RESPONSE_MISSING:${stdoutEventCount}:${structuredResponseCount}`,
    );
  }
  ledger.recordProcessExited(terminal);
  const built = ledger.build();
  if (structuredResponseCount !== 1
    || built.ledger.terminalOutcome !== "success"
    || built.ledger.entries.filter(
      (entry) => entry.kind === "stdout-event-received",
    ).length !== 4
    || built.canonicalJson.includes("probe-thread-not-exported")
    || built.canonicalJson.includes("bounded probe diagnostic")) {
    throw new Error("R0_T2_REAL_PROCESS_PROBE_FAILED");
  }
  return {
    instrumentationHash,
    sourceBindings: Object.fromEntries(BOUND_FILES.map((path) => [
      path,
      sha256(readFileSync(join(REPO_ROOT, path))),
    ])),
    ledger: built.ledger,
    canonicalJson: built.canonicalJson,
    contentHash: built.contentHash,
  };
}

async function writeEvidence(outputRoot) {
  const output = resolve(outputRoot);
  if (dirname(output) !== EVIDENCE_PARENT || existsSync(output)) {
    throw new Error("R0_T2_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(EVIDENCE_PARENT, "R0_T2_OUTPUT_PARENT_INVALID");
  const probe = await runReceiptLedgerProbe();
  mkdirSync(output, { mode: 0o700 });
  const ledgerBody = `${probe.canonicalJson}\n`;
  const proof = {
    schemaVersion: "R0-T2-real-process-proof-v1",
    taskId: "R0-T2",
    outcome: "passed",
    provider: "trusted-outer-runner",
    instrumentationHash: probe.instrumentationHash,
    ledgerContentHash: probe.contentHash,
    sourceBindings: probe.sourceBindings,
    checks: {
      realOsProcess: true,
      monotonicReceiptPoints: true,
      rawBodiesExcluded: true,
      boundedCanonicalEvidence: true,
      terminalComplete: true,
    },
    limitations: probe.ledger.limitations,
  };
  const proofBody = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R0-T2 trusted receipt-ledger proof",
    "",
    `- Ledger entries: ${probe.ledger.entryCount}`,
    `- Terminal outcome: ${probe.ledger.terminalOutcome}`,
    `- Ledger content hash: ${probe.contentHash}`,
    "- Timestamps are trusted outer-runner receipt points, not provider generation or compute time.",
    "",
  ].join("\n");
  writeFileSync(join(output, "ledger.json"), ledgerBody, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(join(output, "proof.json"), proofBody, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(join(output, "summary.md"), summary, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(join(output, "SHA256SUMS"), [
    `${sha256(ledgerBody)}  ledger.json`,
    `${sha256(proofBody)}  proof.json`,
    `${sha256(summary)}  summary.md`,
    "",
  ].join("\n"), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: proof.taskId,
    ledgerContentHash: probe.contentHash,
    instrumentationHash: probe.instrumentationHash,
    entryCount: probe.ledger.entryCount,
    terminalOutcome: probe.ledger.terminalOutcome,
  })}\n`);
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(code);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
  return resolved;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node scripts/pilot/prove-r0-t2.mjs <output-root>");
  }
  await writeEvidence(process.argv[2]);
}
