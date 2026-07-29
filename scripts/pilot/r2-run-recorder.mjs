import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
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
const DEFAULT_MAX_FINAL_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 4_096;

class R2RunRecorder {
  #runId;
  #instrumentationHash;
  #nowNs;
  #maxLineBytes;
  #maxEntries;
  #entries = [];
  #lastAgentMessage = null;
  #lastNs = null;
  #spawned = false;
  #exited = false;
  #cancelled = false;
  #turnCompleted = false;
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
      throw new Error("R2_RECORDER_OPTIONS_INVALID");
    }
    this.#runId = runId;
    this.#instrumentationHash = instrumentationHash;
    this.#nowNs = nowNs;
    this.#maxLineBytes = maxLineBytes;
    this.#maxEntries = maxEntries;
  }

  recordProcessSpawned(invocationHash) {
    if (this.#spawned || !HASH.test(invocationHash)) {
      throw new Error("R2_RECORDER_SPAWN_INVALID");
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
    if (this.#turnCompleted) this.recordProtocolFailure("EVENT_AFTER_TURN_COMPLETED");
    if (event?.type === "item.completed"
      && event.item?.type === "agent_message"
      && typeof event.item.text === "string") {
      const messageBytes = Buffer.from(event.item.text, "utf8");
      if (messageBytes.byteLength > this.#maxLineBytes) {
        this.recordProtocolFailure("AGENT_MESSAGE_LIMIT_EXCEEDED");
        return;
      }
      const observed = this.#append({
        kind: "agent-message-observed",
        bytes: String(messageBytes.byteLength),
        rawSha256: sha256(messageBytes),
        sourceReceiptSequence: receipt.sequence,
      });
      this.#lastAgentMessage = {
        text: event.item.text,
        receiptSequence: observed.sequence,
        rawSha256: sha256(messageBytes),
      };
    }
    if (event?.type === "turn.completed") {
      if (this.#turnCompleted) this.recordProtocolFailure("TURN_COMPLETED_DUPLICATE");
      this.#turnCompleted = true;
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
      throw new Error("R2_RECORDER_CANCELLATION_INVALID");
    }
    this.#append({ kind: "cancellation-requested", reasonCode });
    this.#cancelled = true;
  }

  recordProtocolFailure(code) {
    this.#requireActive();
    if (!ERROR_CODE.test(code)) throw new Error("R2_RECORDER_FAILURE_CODE_INVALID");
    if (!this.#failureCodes.includes(code)) this.#failureCodes.push(code);
  }

  recordProcessExited({ exitCode, signal = null }) {
    this.#requireActive();
    if ((exitCode !== null && (!Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255))
      || (signal !== null && !SIGNAL.test(signal))
      || (exitCode === null && signal === null)) {
      throw new Error("R2_RECORDER_EXIT_INVALID");
    }
    const entry = this.#append({ kind: "process-exited", exitCode, signal });
    this.#terminal = { exitCode, signal, receiptSequence: entry.sequence };
    this.#exited = true;
  }

  finalize({ validateResponse, authoritativeObservation }) {
    if (this.#finalized !== null) return this.#finalized;
    if (!this.#spawned
      || !this.#exited
      || typeof validateResponse !== "function"
      || typeof authoritativeObservation !== "object"
      || authoritativeObservation === null) {
      throw new Error("R2_RECORDER_FINALIZE_INVALID");
    }
    this.#append({
      kind: "authoritative-response-observed",
      status: authoritativeObservation.status,
      bytes: authoritativeObservation.bytes,
      rawSha256: authoritativeObservation.rawSha256,
    });
    if (authoritativeObservation.failureCode !== null) {
      this.#failureCodes.push(authoritativeObservation.failureCode);
    }
    if (!this.#turnCompleted) this.#failureCodes.push("TURN_COMPLETED_MISSING");
    if (this.#terminal?.exitCode !== 0 && !this.#cancelled) {
      this.#failureCodes.push("PROCESS_EXIT_NONZERO");
    }

    let authoritativeParsed = null;
    if (authoritativeObservation.text !== null
      && authoritativeObservation.failureCode === null) {
      try {
        authoritativeParsed = validateResponse(authoritativeObservation.text);
      } catch {
        authoritativeParsed = null;
      }
      if (authoritativeParsed === null || authoritativeParsed === undefined) {
        this.#failureCodes.push("AUTHORITATIVE_RESPONSE_INVALID");
        authoritativeParsed = null;
      }
    }
    if (authoritativeParsed !== null) {
      let auditParsed;
      try {
        auditParsed = this.#lastAgentMessage === null
          ? null
          : validateResponse(this.#lastAgentMessage.text);
      } catch {
        auditParsed = null;
      }
      if (auditParsed === null
        || auditParsed === undefined
        || canonicalJson(auditParsed) !== canonicalJson(authoritativeParsed)) {
        this.#failureCodes.push("AUTHORITATIVE_RESPONSE_AUDIT_MISMATCH");
      }
    }
    this.#failureCodes = [...new Set(this.#failureCodes)];

    let selectedResponse = null;
    if (this.#failureCodes.length === 0 && !this.#cancelled) {
      selectedResponse = authoritativeParsed;
      this.#append({
        kind: "structured-response-selected",
        bytes: authoritativeObservation.bytes,
        rawSha256: authoritativeObservation.rawSha256,
        auditSourceReceiptSequence: this.#lastAgentMessage.receiptSequence,
        selectionPolicy: "output-last-message-authoritative-file",
      });
    } else {
      this.#append({ kind: "protocol-failure-detected", codes: [...this.#failureCodes] });
    }
    const outcome = this.#cancelled
      ? "cancelled"
      : this.#failureCodes.length > 0 ? "failed" : "success";
    this.#append({ kind: "run-finalized", outcome });
    const ledger = {
      schemaVersion: "R2-T2-authoritative-final-receipt-ledger-v1",
      runId: this.#runId,
      instrumentationHash: this.#instrumentationHash,
      clock: {
        provider: "trusted-outer-runner",
        domain: "node:process.hrtime.bigint",
        unit: "nanoseconds",
        semantics: "receipt-and-final-file-selection-time-not-provider-generation-time",
      },
      responseAuthority: "codex-output-last-message-runner-owned-file",
      jsonlRole: "audit-events-not-final-response-candidates",
      entryCount: this.#entries.length,
      totalRawBytes: this.#totalRawBytes.toString(),
      firstReceivedAtNs: this.#entries[0].receivedAtNs,
      lastReceivedAtNs: this.#entries.at(-1).receivedAtNs,
      outcome,
      failureCodes: [...this.#failureCodes],
      selectedResponseHash: selectedResponse === null ? null : canonicalSha256(selectedResponse),
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
      throw new Error("R2_RECORDER_STATE_INVALID");
    }
  }

  #append(entry, rawBytes = 0) {
    if (this.#entries.length >= this.#maxEntries) {
      throw new Error("R2_RECORDER_ENTRY_LIMIT_EXCEEDED");
    }
    const receivedAtNs = this.#nowNs();
    if (typeof receivedAtNs !== "bigint"
      || receivedAtNs < 0n
      || (this.#lastNs !== null && receivedAtNs < this.#lastNs)) {
      throw new Error("R2_RECORDER_CLOCK_INVALID");
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

export async function executeR2RecordedProcess({
  invocation,
  outputRoot,
  runId,
  instrumentationHash,
  validateResponse,
  metadata = {},
  maxStreamBytes = DEFAULT_MAX_STREAM_BYTES,
  maxFinalResponseBytes = DEFAULT_MAX_FINAL_RESPONSE_BYTES,
  nowNs = process.hrtime.bigint,
}) {
  const output = resolve(outputRoot);
  if (existsSync(output)
    || typeof invocation?.authoritativeResponsePath !== "string"
    || !Number.isSafeInteger(maxStreamBytes)
    || maxStreamBytes < 1
    || maxStreamBytes > 64 * 1024 * 1024
    || !Number.isSafeInteger(maxFinalResponseBytes)
    || maxFinalResponseBytes < 1
    || maxFinalResponseBytes > 16 * 1024 * 1024) {
    throw new Error("R2_EXECUTION_OPTIONS_INVALID");
  }
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const stdoutPartial = join(output, "stdout.jsonl.partial");
  const stderrPartial = join(output, "stderr.txt.partial");
  const stdoutFd = openSync(stdoutPartial, "wx", 0o600);
  const stderrFd = openSync(stderrPartial, "wx", 0o600);
  const recorder = new R2RunRecorder({ runId, instrumentationHash, nowNs });
  let child;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutBuffer = "";
  let captureFailure = null;
  let terminal = null;
  const failCapture = (code) => {
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
          failCapture("STDOUT_STREAM_LIMIT_EXCEEDED");
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
        failCapture("STDOUT_CAPTURE_FAILED");
      }
    });
    child.stderr.on("data", (chunk) => {
      try {
        stderrBytes += chunk.byteLength;
        if (stderrBytes > maxStreamBytes) {
          failCapture("STDERR_STREAM_LIMIT_EXCEEDED");
          return;
        }
        writeSync(stderrFd, chunk);
        recorder.recordStderrChunk(chunk);
      } catch {
        failCapture("STDERR_CAPTURE_FAILED");
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
    recorder.recordProcessExited({ exitCode: terminal.exitCode, signal: terminal.signal });
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

  const authoritativeObservation = observeAuthoritativeResponse(
    invocation.authoritativeResponsePath,
    maxFinalResponseBytes,
  );
  if (authoritativeObservation.text !== null) {
    writeFileSync(join(output, "final-response.txt"), authoritativeObservation.text, {
      encoding: "utf8", flag: "wx", mode: 0o600,
    });
  }
  writeFileSync(join(output, "final-response-observation.json"), `${canonicalJson({
    schemaVersion: "R2-T2-final-response-observation-v1",
    status: authoritativeObservation.status,
    bytes: authoritativeObservation.bytes,
    rawSha256: authoritativeObservation.rawSha256,
    failureCode: authoritativeObservation.failureCode,
    authoritativeSource: "codex-output-last-message-runner-owned-file",
  })}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  const built = recorder.finalize({ validateResponse, authoritativeObservation });
  const ledgerBody = `${built.canonicalJson}\n`;
  const successfulResponseComplete = built.outcome === "success"
    && built.selectedResponse !== null;
  const run = {
    schemaVersion: "R2-T2-recorded-run-v1",
    runId,
    ...metadata,
    process: terminal,
    outcome: built.outcome,
    failureCodes: built.failureCodes,
    selectedResponse: built.selectedResponse,
    authoritativeResponseStatus: built.outcome === "success"
      ? "valid-consistent"
      : authoritativeObservation.status,
    instrumentationHash,
    ledgerContentHash: built.contentHash,
    stdoutSha256: sha256(readFileSync(join(output, "stdout.jsonl"))),
    stderrSha256: sha256(readFileSync(join(output, "stderr.txt"))),
    finalResponseSha256: authoritativeObservation.rawSha256,
    successfulResponseComplete,
  };
  writeFileSync(join(output, "receipt-ledger.json"), ledgerBody, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  writeFileSync(join(output, "run.json"), `${canonicalJson(run)}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  if (built.outcome !== "success") {
    writeFileSync(join(output, "failure.json"), `${canonicalJson({
      schemaVersion: "R2-T2-sealed-failure-v1",
      runId,
      outcome: built.outcome,
      failureCodes: built.failureCodes,
      process: terminal,
      rawEvidencePersisted: true,
      finalResponseEvidencePersisted: true,
      ledgerEvidencePersisted: true,
      evidenceSealed: true,
      successfulResponseComplete: false,
    })}\n`, {
      encoding: "utf8", flag: "wx", mode: 0o600,
    });
  }
  const evidenceFiles = [
    "stdout.jsonl",
    "stderr.txt",
    ...(authoritativeObservation.text === null ? [] : ["final-response.txt"]),
    "final-response-observation.json",
    "receipt-ledger.json",
    "run.json",
    ...(built.outcome === "success" ? [] : ["failure.json"]),
  ];
  writeFileSync(join(output, "SHA256SUMS"), `${evidenceFiles.map((path) => (
    `${sha256(readFileSync(join(output, path)))}  ${path}`
  )).join("\n")}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  return Object.freeze({
    ...run,
    outputRoot: output,
    evidenceSealed: true,
  });
}

export function classifyR2ResponseOutcome({
  recorded,
  responseMatchesGroundTruth,
}) {
  const evidenceSealed = recorded?.evidenceSealed === true;
  const successfulResponseComplete = recorded?.outcome === "success"
    && recorded?.selectedResponse !== null
    && evidenceSealed;
  const protocolFailure = !successfulResponseComplete;
  return Object.freeze({
    protocolFailure,
    wrongAttribution: !protocolFailure && responseMatchesGroundTruth === false,
    evidenceSealed,
    successfulResponseComplete,
  });
}

function observeAuthoritativeResponse(path, maxBytes) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return observation("missing", null, null, "AUTHORITATIVE_RESPONSE_MISSING");
  }
  if (stat.isSymbolicLink()) {
    return observation("symlink-rejected", null, null, "AUTHORITATIVE_RESPONSE_SYMLINK_REJECTED");
  }
  if (!stat.isFile()) {
    return observation("non-regular-rejected", null, null, "AUTHORITATIVE_RESPONSE_NON_REGULAR");
  }
  if (stat.size > maxBytes) {
    return observation(
      "limit-exceeded",
      String(stat.size),
      null,
      "AUTHORITATIVE_RESPONSE_LIMIT_EXCEEDED",
    );
  }
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) {
      return observation("identity-mismatch", null, null, "AUTHORITATIVE_RESPONSE_IDENTITY_CHANGED");
    }
    const body = readFileSync(descriptor);
    if (body.byteLength === 0) {
      return observation("empty", "0", sha256(body), "AUTHORITATIVE_RESPONSE_EMPTY");
    }
    return {
      status: "captured",
      text: body.toString("utf8"),
      bytes: String(body.byteLength),
      rawSha256: sha256(body),
      failureCode: null,
    };
  } catch {
    return observation("read-failed", null, null, "AUTHORITATIVE_RESPONSE_READ_FAILED");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function observation(status, bytes, rawSha256, failureCode) {
  return { status, text: null, bytes, rawSha256, failureCode };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
