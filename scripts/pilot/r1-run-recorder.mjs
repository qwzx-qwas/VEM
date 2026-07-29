import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,63}$/u;
const SIGNAL = /^[A-Z][A-Z0-9]{1,31}$/u;
const DEFAULT_MAX_STREAM_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 4_096;

export class RemediatedRunRecorder {
  #runId;
  #instrumentationHash;
  #nowNs;
  #maxLineBytes;
  #maxEntries;
  #entries = [];
  #candidates = [];
  #lastNs = null;
  #spawned = false;
  #exited = false;
  #cancelled = false;
  #failureCodes = [];
  #totalRawBytes = 0n;
  #terminal = null;
  #finalized = null;

  constructor({
    runId,
    instrumentationHash,
    nowNs = process.hrtime.bigint,
    maxLineBytes = DEFAULT_MAX_LINE_BYTES,
    maxEntries = DEFAULT_MAX_ENTRIES,
  }) {
    if (!ID.test(runId)
      || !HASH.test(instrumentationHash)
      || !Number.isSafeInteger(maxLineBytes)
      || maxLineBytes < 1
      || maxLineBytes > 16 * 1024 * 1024
      || !Number.isSafeInteger(maxEntries)
      || maxEntries < 4
      || maxEntries > 65_536) {
      throw new Error("R1_RECORDER_OPTIONS_INVALID");
    }
    this.#runId = runId;
    this.#instrumentationHash = instrumentationHash;
    this.#nowNs = nowNs;
    this.#maxLineBytes = maxLineBytes;
    this.#maxEntries = maxEntries;
  }

  recordProcessSpawned(invocationHash) {
    if (this.#spawned || !HASH.test(invocationHash)) {
      throw new Error("R1_RECORDER_SPAWN_INVALID");
    }
    this.#append({ kind: "process-spawned", invocationHash });
    this.#spawned = true;
  }

  recordStdoutLine(line) {
    this.#requireActive();
    const bytes = Buffer.from(line, "utf8");
    if (bytes.byteLength > this.#maxLineBytes) {
      this.recordProtocolFailure("STDOUT_LINE_LIMIT_EXCEEDED");
      return;
    }
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      this.#append({
        kind: "stdout-line-received",
        bytes: String(bytes.byteLength),
        rawSha256: sha256(bytes),
        eventType: "malformed",
      }, bytes.byteLength);
      this.recordProtocolFailure("STDOUT_JSONL_INVALID");
      return;
    }
    const eventType = typeof event?.type === "string"
      ? event.type.slice(0, 128)
      : "unknown";
    const receipt = this.#append({
      kind: "stdout-line-received",
      bytes: String(bytes.byteLength),
      rawSha256: sha256(bytes),
      eventType,
    }, bytes.byteLength);
    if (event?.type === "item.completed"
      && event.item?.type === "agent_message"
      && typeof event.item.text === "string") {
      const candidateBytes = Buffer.from(event.item.text, "utf8");
      if (candidateBytes.byteLength > this.#maxLineBytes) {
        this.recordProtocolFailure("RESPONSE_CANDIDATE_LIMIT_EXCEEDED");
        return;
      }
      this.#candidates.push({
        text: event.item.text,
        receiptSequence: receipt.sequence,
        receivedAtNs: receipt.receivedAtNs,
        rawSha256: sha256(candidateBytes),
        bytes: String(candidateBytes.byteLength),
      });
    }
  }

  recordStderrChunk(chunk) {
    this.#requireActive();
    const bytes = Buffer.from(chunk);
    if (bytes.byteLength > this.#maxLineBytes) {
      this.recordProtocolFailure("STDERR_CHUNK_LIMIT_EXCEEDED");
      return;
    }
    this.#append({
      kind: "stderr-chunk-received",
      bytes: String(bytes.byteLength),
      rawSha256: sha256(bytes),
    }, bytes.byteLength);
  }

  recordCancellationRequested(reasonCode) {
    this.#requireActive();
    if (this.#cancelled || !ERROR_CODE.test(reasonCode)) {
      throw new Error("R1_RECORDER_CANCELLATION_INVALID");
    }
    this.#append({ kind: "cancellation-requested", reasonCode });
    this.#cancelled = true;
  }

  recordProtocolFailure(code) {
    this.#requireActive();
    if (!ERROR_CODE.test(code)) throw new Error("R1_RECORDER_FAILURE_CODE_INVALID");
    if (!this.#failureCodes.includes(code)) this.#failureCodes.push(code);
  }

  recordProcessExited({ exitCode, signal = null }) {
    this.#requireActive();
    if ((exitCode !== null && (!Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255))
      || (signal !== null && !SIGNAL.test(signal))
      || (exitCode === null && signal === null)) {
      throw new Error("R1_RECORDER_EXIT_INVALID");
    }
    const entry = this.#append({
      kind: "process-exited",
      exitCode,
      signal,
    });
    this.#terminal = { exitCode, signal, receiptSequence: entry.sequence };
    this.#exited = true;
  }

  finalize({ validateResponse }) {
    if (this.#finalized !== null) return this.#finalized;
    if (!this.#spawned || !this.#exited || typeof validateResponse !== "function") {
      throw new Error("R1_RECORDER_FINALIZE_INVALID");
    }
    const validCandidates = [];
    if (this.#failureCodes.length === 0 && this.#terminal?.exitCode === 0) {
      for (const candidate of this.#candidates) {
        let parsed;
        try {
          parsed = validateResponse(candidate.text);
        } catch {
          continue;
        }
        if (parsed !== null && parsed !== undefined) {
          validCandidates.push({
            ...candidate,
            parsed,
            canonicalResponse: canonicalJson(parsed),
          });
        }
      }
      if (validCandidates.length === 0) {
        this.#failureCodes.push("STRUCTURED_RESPONSE_MISSING");
      } else if (new Set(
        validCandidates.map((candidate) => candidate.canonicalResponse),
      ).size > 1) {
        this.#failureCodes.push("STRUCTURED_RESPONSE_CONFLICT");
      }
    }
    if (this.#terminal?.exitCode !== 0 && !this.#cancelled) {
      this.#failureCodes.push("PROCESS_EXIT_NONZERO");
    }

    let selectedResponse = null;
    if (this.#failureCodes.length === 0 && !this.#cancelled) {
      const selected = validCandidates.at(-1);
      selectedResponse = selected.parsed;
      this.#append({
        kind: "structured-response-selected",
        bytes: selected.bytes,
        rawSha256: selected.rawSha256,
        sourceReceiptSequence: selected.receiptSequence,
        sourceReceivedAtNs: selected.receivedAtNs,
        validCandidateCount: validCandidates.length,
        selectionPolicy: "last-schema-valid-nonconflicting",
      });
    } else {
      this.#append({
        kind: "protocol-failure-detected",
        codes: [...this.#failureCodes],
      });
    }
    const outcome = this.#cancelled
      ? "cancelled"
      : this.#failureCodes.length > 0 ? "failed" : "success";
    this.#append({ kind: "run-finalized", outcome });
    const ledger = {
      schemaVersion: "R1-T2-remediated-receipt-ledger-v1",
      runId: this.#runId,
      instrumentationHash: this.#instrumentationHash,
      clock: {
        provider: "trusted-outer-runner",
        domain: "node:process.hrtime.bigint",
        unit: "nanoseconds",
        semantics: "receipt-and-selection-time-not-provider-generation-time",
      },
      entryCount: this.#entries.length,
      totalRawBytes: this.#totalRawBytes.toString(),
      firstReceivedAtNs: this.#entries[0].receivedAtNs,
      lastReceivedAtNs: this.#entries.at(-1).receivedAtNs,
      outcome,
      failureCodes: [...this.#failureCodes],
      selectedResponseHash: selectedResponse === null
        ? null
        : canonicalSha256(selectedResponse),
      entries: this.#entries.map((entry) => ({ ...entry })),
      limitations: [
        "NO_MODEL_SERVER_GENERATION_TIME",
        "NO_MODEL_COMPUTE_ATTRIBUTION",
        "NO_SHELL_INTERNAL_TIMING",
      ],
    };
    const serialized = canonicalJson(ledger);
    this.#finalized = Object.freeze({
      ledger: Object.freeze(ledger),
      canonicalJson: serialized,
      contentHash: sha256(serialized),
      selectedResponse,
      outcome,
      failureCodes: Object.freeze([...this.#failureCodes]),
    });
    return this.#finalized;
  }

  #requireActive() {
    if (!this.#spawned || this.#exited || this.#finalized !== null) {
      throw new Error("R1_RECORDER_STATE_INVALID");
    }
  }

  #append(entry, rawBytes = 0) {
    if (this.#entries.length >= this.#maxEntries) {
      throw new Error("R1_RECORDER_ENTRY_LIMIT_EXCEEDED");
    }
    const receivedAtNs = this.#nowNs();
    if (typeof receivedAtNs !== "bigint"
      || receivedAtNs < 0n
      || (this.#lastNs !== null && receivedAtNs < this.#lastNs)) {
      throw new Error("R1_RECORDER_CLOCK_INVALID");
    }
    this.#lastNs = receivedAtNs;
    this.#totalRawBytes += BigInt(rawBytes);
    const complete = {
      sequence: this.#entries.length,
      receivedAtNs: receivedAtNs.toString(),
      ...entry,
    };
    this.#entries.push(complete);
    return complete;
  }
}

export async function executeRecordedProcess({
  invocation,
  outputRoot,
  runId,
  instrumentationHash,
  validateResponse,
  metadata = {},
  maxStreamBytes = DEFAULT_MAX_STREAM_BYTES,
  nowNs = process.hrtime.bigint,
}) {
  const output = resolve(outputRoot);
  if (existsSync(output)
    || !Number.isSafeInteger(maxStreamBytes)
    || maxStreamBytes < 1
    || maxStreamBytes > 64 * 1024 * 1024) {
    throw new Error("R1_EXECUTION_OUTPUT_INVALID");
  }
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const stdoutPartial = join(output, "stdout.jsonl.partial");
  const stderrPartial = join(output, "stderr.txt.partial");
  const stdoutFd = openSync(stdoutPartial, "wx", 0o600);
  const stderrFd = openSync(stderrPartial, "wx", 0o600);
  const recorder = new RemediatedRunRecorder({
    runId,
    instrumentationHash,
    nowNs,
  });
  let child;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutBuffer = "";
  let captureFailure = null;
  let terminal = null;
  const fail = (code) => {
    if (captureFailure === null) {
      captureFailure = code;
      recorder.recordProtocolFailure(code);
      if (child !== undefined && !child.killed) {
        recorder.recordCancellationRequested(code);
        child.kill("SIGTERM");
      }
    }
  };
  try {
    child = spawn(invocation.executable, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env ?? { PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    recorder.recordProcessSpawned(canonicalSha256(invocation.evidence));
    child.stdout.on("data", (chunk) => {
      try {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > maxStreamBytes) {
          fail("STDOUT_STREAM_LIMIT_EXCEEDED");
          return;
        }
        writeSync(stdoutFd, chunk);
        stdoutBuffer += chunk.toString("utf8");
        let newlineIndex = stdoutBuffer.indexOf("\n");
        while (newlineIndex !== -1) {
          recorder.recordStdoutLine(stdoutBuffer.slice(0, newlineIndex));
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          newlineIndex = stdoutBuffer.indexOf("\n");
        }
      } catch {
        fail("STDOUT_CAPTURE_FAILED");
      }
    });
    child.stderr.on("data", (chunk) => {
      try {
        stderrBytes += chunk.byteLength;
        if (stderrBytes > maxStreamBytes) {
          fail("STDERR_STREAM_LIMIT_EXCEEDED");
          return;
        }
        writeSync(stderrFd, chunk);
        recorder.recordStderrChunk(chunk);
      } catch {
        fail("STDERR_CAPTURE_FAILED");
      }
    });
    const stdoutClosed = new Promise((resolvePromise) => {
      child.stdout.once("close", () => {
        if (stdoutBuffer.length > 0) recorder.recordStdoutLine(stdoutBuffer);
        stdoutBuffer = "";
        resolvePromise();
      });
    });
    const stderrClosed = new Promise((resolvePromise) => {
      child.stderr.once("close", resolvePromise);
    });
    const processClosed = new Promise((resolvePromise) => {
      child.once("error", () => resolvePromise({
        exitCode: null,
        signal: "SIGABRT",
        launchFailed: true,
      }));
      child.once("close", (exitCode, signal) => resolvePromise({
        exitCode,
        signal,
        launchFailed: false,
      }));
    });
    [terminal] = await Promise.all([processClosed, stdoutClosed, stderrClosed]);
    if (terminal.launchFailed) recorder.recordProtocolFailure("PROCESS_LAUNCH_FAILED");
    recorder.recordProcessExited({
      exitCode: terminal.exitCode,
      signal: terminal.signal,
    });
  } catch {
    if (captureFailure === null) captureFailure = "RUNNER_INTERNAL_FAILURE";
    if (terminal === null) {
      recorder.recordProtocolFailure(captureFailure);
      recorder.recordProcessExited({ exitCode: null, signal: "SIGABRT" });
    }
  } finally {
    fsyncSync(stdoutFd);
    fsyncSync(stderrFd);
    closeSync(stdoutFd);
    closeSync(stderrFd);
    renameSync(stdoutPartial, join(output, "stdout.jsonl"));
    renameSync(stderrPartial, join(output, "stderr.txt"));
  }
  const built = recorder.finalize({ validateResponse });
  const ledgerBody = `${built.canonicalJson}\n`;
  const run = {
    schemaVersion: "R1-T2-recorded-run-v1",
    runId,
    ...metadata,
    process: terminal,
    outcome: built.outcome,
    failureCodes: built.failureCodes,
    selectedResponse: built.selectedResponse,
    instrumentationHash,
    ledgerContentHash: built.contentHash,
    stdoutSha256: sha256(readFileSync(join(output, "stdout.jsonl"))),
    stderrSha256: sha256(readFileSync(join(output, "stderr.txt"))),
  };
  writeFileSync(join(output, "receipt-ledger.json"), ledgerBody, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "run.json"), `${canonicalJson(run)}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  if (built.outcome !== "success") {
    writeFileSync(join(output, "failure.json"), `${canonicalJson({
      schemaVersion: "R1-T2-sealed-failure-v1",
      runId,
      outcome: built.outcome,
      failureCodes: built.failureCodes,
      process: terminal,
      rawEvidencePersisted: true,
      ledgerEvidencePersisted: true,
    })}\n`, {
      encoding: "utf8", flag: "wx", mode: 0o600,
    });
  }
  const evidenceFiles = [
    "stdout.jsonl",
    "stderr.txt",
    "receipt-ledger.json",
    "run.json",
    ...(built.outcome === "success" ? [] : ["failure.json"]),
  ];
  writeFileSync(join(output, "SHA256SUMS"), `${evidenceFiles.map((path) => (
    `${sha256(readFileSync(join(output, path)))}  ${path}`
  )).join("\n")}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  return Object.freeze({ ...run, outputRoot: output });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
