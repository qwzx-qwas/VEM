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
  readdirSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJson, canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,63}$/u;
const MANIFEST_LINE = /^([a-f0-9]{64}) {2}([A-Za-z0-9._-]{1,128})$/u;
const DEFAULT_MAX_STREAM_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_FINAL_RESPONSE_BYTES = 1024 * 1024;
const MAX_CONTROL_BYTES = 8 * 1024 * 1024;
const POLL_INTERVAL_MS = 10;

const REQUIRED_EVIDENCE_FILES = Object.freeze([
  "stdout.jsonl",
  "stderr.txt",
  "final-response-observation.json",
  "receipt-ledger.json",
  "boundary-state.json",
  "termination.json",
  "run.json",
]);

export async function executeR5BoundedProcess(options) {
  const normalized = validateOptions(options);
  const output = resolve(normalized.outputRoot);
  mkdirSync(output, { mode: 0o700 });
  const stdoutPartial = join(output, "stdout.jsonl.partial");
  const stderrPartial = join(output, "stderr.txt.partial");
  const stdoutFd = openSync(stdoutPartial, "wx", 0o600);
  const stderrFd = openSync(stderrPartial, "wx", 0o600);
  const receipts = [];
  const failureCodes = [];
  const stdoutChunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let child;
  let processGroupId = null;
  let terminal = null;
  let deadlineExpired = false;
  let cancellationReason = null;
  let trigger = "process-exit";
  let gracefulSignalSent = false;
  let forceSignalSent = false;
  let processTreeTerminated;
  let stdoutClosed = Promise.resolve();
  let stderrClosed = Promise.resolve();
  let deadlineTimer;
  let removeAbortListener = () => {};
  let resolveTerminationRequest;
  const terminationRequested = new Promise((resolvePromise) => {
    resolveTerminationRequest = resolvePromise;
  });
  let terminationRequest = null;
  const requestTermination = (request) => {
    if (terminationRequest === null) {
      terminationRequest = request;
      resolveTerminationRequest(request);
    }
  };
  const appendReceipt = (entry) => {
    receipts.push(Object.freeze({
      sequence: receipts.length,
      receivedAtNs: normalized.nowNs().toString(),
      ...entry,
    }));
  };

  try {
    const spawnedAtNs = normalized.nowNs();
    appendReceipt({
      kind: "spawn-requested",
      invocationHash: canonicalSha256(normalized.invocation.evidence),
    });
    child = spawn(normalized.invocation.executable, normalized.invocation.args, {
      cwd: normalized.invocation.cwd,
      env: normalized.invocation.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    processGroupId = child.pid ?? null;
    appendReceipt({
      kind: "process-spawned",
      processGroupEstablished: processGroupId !== null,
    });

    stdoutClosed = captureStream({
      stream: child.stdout,
      descriptor: stdoutFd,
      kind: "stdout",
      maxBytes: normalized.maxStreamBytes,
      chunks: stdoutChunks,
      onBytes(count, digest) {
        stdoutBytes += count;
        appendReceipt({
          kind: "stdout-chunk-received",
          bytes: String(count),
          rawSha256: digest,
        });
      },
      onLimit() {
        addFailure(failureCodes, "R5_STDOUT_STREAM_LIMIT_EXCEEDED");
        requestTermination({
          trigger: "capture-boundary",
          cancellationReason: "stdout-stream-limit",
        });
      },
      onError() {
        addFailure(failureCodes, "R5_STDOUT_CAPTURE_FAILED");
        requestTermination({
          trigger: "capture-boundary",
          cancellationReason: "stdout-capture-failed",
        });
      },
    });
    stderrClosed = captureStream({
      stream: child.stderr,
      descriptor: stderrFd,
      kind: "stderr",
      maxBytes: normalized.maxStreamBytes,
      onBytes(count, digest) {
        stderrBytes += count;
        appendReceipt({
          kind: "stderr-chunk-received",
          bytes: String(count),
          rawSha256: digest,
        });
      },
      onLimit() {
        addFailure(failureCodes, "R5_STDERR_STREAM_LIMIT_EXCEEDED");
        requestTermination({
          trigger: "capture-boundary",
          cancellationReason: "stderr-stream-limit",
        });
      },
      onError() {
        addFailure(failureCodes, "R5_STDERR_CAPTURE_FAILED");
        requestTermination({
          trigger: "capture-boundary",
          cancellationReason: "stderr-capture-failed",
        });
      },
    });

    const processExited = observeProcessExit(child);
    if (normalized.signal !== null) {
      const onAbort = () => {
        requestTermination({
          trigger: "outer-cancellation",
          cancellationReason: normalizeCancellationReason(normalized.signal.reason),
        });
      };
      if (normalized.signal.aborted) {
        onAbort();
      } else {
        normalized.signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => {
          normalized.signal.removeEventListener("abort", onAbort);
        };
      }
    }
    const elapsedMs = Number(normalized.nowNs() - spawnedAtNs) / 1_000_000;
    deadlineTimer = setTimeout(() => {
      deadlineExpired = true;
      requestTermination({
        trigger: "wall-clock-deadline",
        cancellationReason: null,
      });
    }, Math.max(0, normalized.terminationPolicy.deadlineMs - elapsedMs));

    const first = await Promise.race([
      processExited.then((value) => ({ kind: "process-exit", value })),
      terminationRequested.then((value) => ({ kind: "termination-request", value })),
    ]);
    if (first.kind === "process-exit") {
      terminal = first.value;
      processTreeTerminated = processGroupId === null
        ? true
        : await safeGroupEmpty(normalized.processGroupAdapter, processGroupId);
      if (!processTreeTerminated) {
        trigger = "process-exit-with-live-descendants";
        addFailure(failureCodes, "R5_PROCESS_DESCENDANT_SURVIVED_PARENT");
        const termination = await terminateProcessGroup({
          adapter: normalized.processGroupAdapter,
          groupId: processGroupId,
          policy: normalized.terminationPolicy,
          appendReceipt,
          failureCodes,
        });
        gracefulSignalSent = termination.gracefulSignalSent;
        forceSignalSent = termination.forceSignalSent;
        processTreeTerminated = termination.processTreeTerminated;
      }
    } else {
      trigger = first.value.trigger;
      cancellationReason = first.value.cancellationReason;
      if (trigger === "wall-clock-deadline") {
        addFailure(failureCodes, "R5_WALL_CLOCK_DEADLINE");
      } else if (trigger === "outer-cancellation") {
        addFailure(failureCodes, "R5_OUTER_CANCELLATION");
      } else {
        addFailure(failureCodes, "R5_CAPTURE_BOUNDARY_TERMINATION");
      }
      const termination = processGroupId === null
        ? {
            gracefulSignalSent: false,
            forceSignalSent: false,
            processTreeTerminated: true,
          }
        : await terminateProcessGroup({
            adapter: normalized.processGroupAdapter,
            groupId: processGroupId,
            policy: normalized.terminationPolicy,
            appendReceipt,
            failureCodes,
          });
      gracefulSignalSent = termination.gracefulSignalSent;
      forceSignalSent = termination.forceSignalSent;
      processTreeTerminated = termination.processTreeTerminated;
      terminal = await settleWithTimeout(
        processExited,
        normalized.terminationPolicy.forceKillWaitMs,
      ) ?? {
        exitCode: null,
        signal: null,
        launchFailed: false,
        observationTimedOut: true,
      };
      if (terminal.observationTimedOut === true) {
        addFailure(failureCodes, "R5_PROCESS_EXIT_OBSERVATION_TIMEOUT");
      }
    }
  } catch (error) {
    addFailure(failureCodes, errorCode(error, "R5_RUNNER_INTERNAL_EXCEPTION"));
    trigger = "runner-exception";
    cancellationReason = null;
    if (processGroupId !== null) {
      const termination = await terminateProcessGroup({
        adapter: normalized.processGroupAdapter,
        groupId: processGroupId,
        policy: normalized.terminationPolicy,
        appendReceipt,
        failureCodes,
      });
      gracefulSignalSent ||= termination.gracefulSignalSent;
      forceSignalSent ||= termination.forceSignalSent;
      processTreeTerminated = termination.processTreeTerminated;
    } else {
      processTreeTerminated = true;
    }
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    removeAbortListener();
    const streamsClosed = await settleWithTimeout(
      Promise.all([stdoutClosed, stderrClosed]),
      normalized.terminationPolicy.forceKillWaitMs,
    );
    if (streamsClosed === null) {
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      addFailure(failureCodes, "R5_STREAM_CLOSE_TIMEOUT");
    }
    fsyncSync(stdoutFd);
    fsyncSync(stderrFd);
    closeSync(stdoutFd);
    closeSync(stderrFd);
    renameSync(stdoutPartial, join(output, "stdout.jsonl"));
    renameSync(stderrPartial, join(output, "stderr.txt"));
  }

  if (processGroupId !== null) {
    processTreeTerminated = await safeGroupEmpty(
      normalized.processGroupAdapter,
      processGroupId,
    );
  }
  if (!processTreeTerminated) {
    addFailure(failureCodes, "R5_PROCESS_GROUP_NOT_EMPTY");
  }
  const terminalConsistency = classifyR5TerminalConsistency({
    terminal,
    processGroupEmpty: processTreeTerminated,
  });
  if (terminalConsistency.failureCode !== null) {
    addFailure(failureCodes, terminalConsistency.failureCode);
  }
  if (terminal?.launchFailed === true) {
    addFailure(failureCodes, "R5_PROCESS_LAUNCH_FAILED");
  } else if (trigger === "process-exit"
    && terminal?.exitCode !== 0) {
    addFailure(failureCodes, "R5_PROCESS_EXIT_NONZERO");
  }

  const stdoutText = Buffer.concat(stdoutChunks).toString("utf8");
  const parsed = parseJsonl(stdoutText);
  for (const code of parsed.failureCodes) addFailure(failureCodes, code);
  const providerTurnFailedObserved = parsed.events.some(
    (event) => event?.type === "turn.failed",
  );
  const finalObservation = observeFinalResponse(
    normalized.finalResponsePath,
    normalized.maxFinalResponseBytes,
  );
  if (finalObservation.failureCode !== null) {
    addFailure(failureCodes, finalObservation.failureCode);
  }
  if (finalObservation.text !== null) {
    writeText(join(output, "final-response.txt"), finalObservation.text);
  }
  writeJson(join(output, "final-response-observation.json"), {
    schemaVersion: "R5-T2-final-response-observation-v1",
    status: finalObservation.status,
    bytes: finalObservation.bytes,
    rawSha256: finalObservation.rawSha256,
    failureCode: finalObservation.failureCode,
    source: "runner-owned-final-response-file",
  });

  const audit = runBoundaryStage({
    stage: "audit",
    callback: normalized.audit,
    input: Object.freeze({
      events: Object.freeze(parsed.events),
      stdout: stdoutText,
      stderr: readFileSync(join(output, "stderr.txt"), "utf8"),
    }),
    failureCodes,
  });
  const evaluator = runBoundaryStage({
    stage: "evaluator",
    callback: normalized.evaluate,
    input: Object.freeze({
      events: Object.freeze(parsed.events),
      finalResponse: finalObservation.text,
      termination: Object.freeze({
        trigger,
        terminal,
        processTreeTerminated,
      }),
    }),
    failureCodes,
  });
  writeJson(join(output, "boundary-state.json"), {
    schemaVersion: "R5-T2-boundary-state-v1",
    permission: normalized.permissionState,
    audit,
    evaluator,
    stagesIndependent: true,
  });

  const receiptLedger = {
    schemaVersion: "R5-T2-terminal-receipt-ledger-v1",
    runId: normalized.runId,
    instrumentationHash: normalized.instrumentationHash,
    clock: {
      provider: "trusted-outer-runner",
      domain: "node:process.hrtime.bigint",
      unit: "nanoseconds",
    },
    stdoutBytes: String(stdoutBytes),
    stderrBytes: String(stderrBytes),
    entryCount: receipts.length,
    entries: receipts,
  };
  writeJson(join(output, "receipt-ledger.json"), receiptLedger);

  const providerTerminalInvented = false;
  const termination = {
    schemaVersion: "R5-T2-process-tree-termination-v1",
    runId: normalized.runId,
    trigger,
    deadlineExpired,
    cancellationReason,
    policy: normalized.terminationPolicy,
    process: terminal,
    processGroupEstablished: processGroupId !== null,
    gracefulSignalSent,
    forceSignalSent,
    processGroupEmptyAfterTermination: processTreeTerminated,
    providerTurnFailedObserved,
    providerTerminalInvented,
    terminalConsistency,
  };
  writeJson(join(output, "termination.json"), termination);

  const outcome = chooseOutcome({
    trigger,
    deadlineExpired,
    cancellationReason,
    processTreeTerminated,
    finalObservation,
    audit,
    evaluator,
    terminal,
    failureCodes,
  });
  const run = {
    schemaVersion: "R5-T2-bounded-process-run-v1",
    runId: normalized.runId,
    outcome,
    failureCodes: [...failureCodes].sort(),
    instrumentationHash: normalized.instrumentationHash,
    invocationEvidenceHash: canonicalSha256(normalized.invocation.evidence),
    stdoutSha256: sha256(readFileSync(join(output, "stdout.jsonl"))),
    stderrSha256: sha256(readFileSync(join(output, "stderr.txt"))),
    finalResponseSha256: finalObservation.rawSha256,
    deadlineExpired,
    cancellationReason,
    processTreeTerminated,
    providerTurnFailedObserved,
    providerTerminalInvented,
    permissionProfilePassed: normalized.permissionState.permissionProfilePassed,
    evidenceSealedBeforeReturn: true,
  };
  writeJson(join(output, "run.json"), run);
  if (outcome !== "success") {
    writeJson(join(output, "failure.json"), {
      schemaVersion: "R5-T2-sealed-failure-v1",
      runId: normalized.runId,
      outcome,
      failureCodes: run.failureCodes,
      trigger,
      processTreeTerminated,
      rawEvidencePersisted: true,
      finalResponseEvidencePersisted: true,
      boundaryEvidencePersisted: true,
      terminationEvidencePersisted: true,
      providerTerminalInvented,
      evidenceSealedBeforeReturn: true,
    });
  }
  writeManifest(output);
  const evidenceSealed = verifyR5EvidenceManifest(output);
  if (!evidenceSealed) throw new Error("R5_EVIDENCE_MANIFEST_INVALID");
  return deepFreeze({
    ...run,
    outputRoot: output,
    gracefulSignalSent,
    forceSignalSent,
    evidenceSealed,
  });
}

export function isR5ProcessInvocation(invocation) {
  return typeof invocation?.executable === "string"
    && invocation.executable.length > 0
    && Array.isArray(invocation.args)
    && invocation.args.length <= 256
    && invocation.args.every((arg) => typeof arg === "string")
    && typeof invocation.cwd === "string"
    && isStringRecord(invocation.env)
    && typeof invocation.evidence === "object"
    && invocation.evidence !== null
    && !Array.isArray(invocation.evidence);
}

export function installR5SignalForwarding({ controller, processLike = process }) {
  if (typeof controller?.abort !== "function"
    || typeof processLike?.once !== "function"
    || typeof processLike?.off !== "function") {
    throw new Error("R5_SIGNAL_FORWARDING_OPTIONS_INVALID");
  }
  const listeners = new Map([
    ["SIGINT", () => controller.abort("outer-signal-SIGINT")],
    ["SIGTERM", () => controller.abort("outer-signal-SIGTERM")],
  ]);
  for (const [signal, listener] of listeners) processLike.once(signal, listener);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    for (const [signal, listener] of listeners) processLike.off(signal, listener);
  };
}

export function classifyR5TerminalConsistency({
  terminal,
  processGroupEmpty,
}) {
  const launchFailure = terminal?.launchFailed === true
    && terminal.exitCode === null
    && terminal.signal === null;
  const timedOut = terminal?.observationTimedOut === true
    && terminal.exitCode === null
    && terminal.signal === null;
  const ordinaryExit = terminal?.launchFailed === false
    && terminal.observationTimedOut !== true
    && ((Number.isSafeInteger(terminal.exitCode) && terminal.signal === null)
      || (terminal.exitCode === null
        && typeof terminal.signal === "string"
        && terminal.signal.length > 0));
  const structurallyValid = launchFailure || timedOut || ordinaryExit;
  const contradictory = !structurallyValid
    || (processGroupEmpty === true && timedOut);
  return Object.freeze({
    valid: structurallyValid && !contradictory,
    contradictory,
    failureCode: contradictory
      ? "R5_TERMINAL_OBSERVATION_CONTRADICTION"
      : null,
  });
}

export function verifyR5EvidenceManifest(outputRoot) {
  try {
    const root = resolve(outputRoot);
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return false;
    const body = readBoundedRegularFile(
      join(root, "SHA256SUMS"),
      MAX_CONTROL_BYTES,
    ).toString("utf8");
    const lines = body.trim().split(/\r?\n/u).filter(Boolean);
    const seen = new Set();
    for (const line of lines) {
      const match = MANIFEST_LINE.exec(line);
      if (match === null || seen.has(match[2])) return false;
      seen.add(match[2]);
      if (sha256(readBoundedRegularFile(
        join(root, match[2]),
        evidenceFileLimit(match[2]),
      )) !== match[1]) return false;
    }
    const entries = readdirSync(root, { withFileTypes: true });
    if (entries.some((entry) => (
      entry.isSymbolicLink()
      || !entry.isFile()
      || (entry.name !== "SHA256SUMS" && !seen.has(entry.name))
    ))) return false;
    return entries.length === seen.size + 1
      && REQUIRED_EVIDENCE_FILES.every((name) => seen.has(name));
  } catch {
    return false;
  }
}

function validateOptions(options) {
  const {
    invocation,
    outputRoot,
    runId,
    instrumentationHash,
    finalResponsePath,
    terminationPolicy,
    permissionState,
    audit,
    evaluate,
    signal = null,
    processGroupAdapter = defaultProcessGroupAdapter(),
    maxStreamBytes = DEFAULT_MAX_STREAM_BYTES,
    maxFinalResponseBytes = DEFAULT_MAX_FINAL_RESPONSE_BYTES,
    nowNs = process.hrtime.bigint,
  } = options ?? {};
  const invocationValid = isR5ProcessInvocation(invocation);
  const policyValid = Number.isSafeInteger(terminationPolicy?.deadlineMs)
    && terminationPolicy.deadlineMs >= 50
    && terminationPolicy.deadlineMs <= 30 * 60 * 1_000
    && Number.isSafeInteger(terminationPolicy.graceMs)
    && terminationPolicy.graceMs >= 10
    && terminationPolicy.graceMs <= 10_000
    && Number.isSafeInteger(terminationPolicy.forceKillWaitMs)
    && terminationPolicy.forceKillWaitMs >= 10
    && terminationPolicy.forceKillWaitMs <= 10_000
    && terminationPolicy.gracefulSignal === "SIGTERM"
    && terminationPolicy.forceSignal === "SIGKILL";
  const permissionValid = permissionState?.status === "passed"
    && permissionState.permissionProfilePassed === true
    && permissionState.authReadableToGeneratedCommands === false
    && permissionState.workspaceWritable === false
    && HASH.test(permissionState.evidenceHash ?? "");
  if (typeof outputRoot !== "string"
    || existsSync(resolve(outputRoot))
    || !ID.test(runId ?? "")
    || !HASH.test(instrumentationHash ?? "")
    || typeof finalResponsePath !== "string"
    || !invocationValid
    || !policyValid
    || !permissionValid
    || typeof audit !== "function"
    || typeof evaluate !== "function"
    || (signal !== null
      && (typeof signal.aborted !== "boolean"
        || typeof signal.addEventListener !== "function"
        || typeof signal.removeEventListener !== "function"))
    || typeof processGroupAdapter?.signal !== "function"
    || typeof processGroupAdapter?.isEmpty !== "function"
    || !Number.isSafeInteger(maxStreamBytes)
    || maxStreamBytes < 1
    || maxStreamBytes > 64 * 1024 * 1024
    || !Number.isSafeInteger(maxFinalResponseBytes)
    || maxFinalResponseBytes < 1
    || maxFinalResponseBytes > 16 * 1024 * 1024
    || typeof nowNs !== "function") {
    throw new Error("R5_EXECUTION_OPTIONS_INVALID");
  }
  return {
    invocation,
    outputRoot,
    runId,
    instrumentationHash,
    finalResponsePath,
    terminationPolicy: Object.freeze({ ...terminationPolicy }),
    permissionState: Object.freeze({ ...permissionState }),
    audit,
    evaluate,
    signal,
    processGroupAdapter,
    maxStreamBytes,
    maxFinalResponseBytes,
    nowNs,
  };
}

function captureStream({
  stream,
  descriptor,
  kind,
  maxBytes,
  chunks = null,
  onBytes,
  onLimit,
  onError,
}) {
  if (stream === null) {
    onError();
    return Promise.resolve();
  }
  let total = 0;
  let accepting = true;
  stream.on("data", (chunk) => {
    if (!accepting) return;
    try {
      total += chunk.byteLength;
      if (total > maxBytes) {
        accepting = false;
        onLimit();
        return;
      }
      writeSync(descriptor, chunk);
      chunks?.push(Buffer.from(chunk));
      onBytes(chunk.byteLength, sha256(chunk));
    } catch {
      accepting = false;
      onError();
    }
  });
  return new Promise((resolvePromise) => {
    stream.once("close", resolvePromise);
    stream.once("error", () => {
      onError();
      resolvePromise();
    });
  }).then(() => {
    if (!accepting && kind === "stdout") return;
  });
}

function observeProcessExit(child) {
  return new Promise((resolvePromise) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    };
    child.once("error", () => settle({
      exitCode: null,
      signal: null,
      launchFailed: true,
    }));
    child.once("exit", (exitCode, signal) => settle({
      exitCode,
      signal,
      launchFailed: false,
    }));
  });
}

async function terminateProcessGroup({
  adapter,
  groupId,
  policy,
  appendReceipt,
  failureCodes,
}) {
  let gracefulSignalSent = false;
  let forceSignalSent = false;
  try {
    await adapter.signal(groupId, policy.gracefulSignal);
    gracefulSignalSent = true;
    appendReceipt({
      kind: "process-group-signal-sent",
      signal: policy.gracefulSignal,
    });
  } catch (error) {
    if (!isNoSuchProcess(error)) {
      addFailure(failureCodes, "R5_GRACEFUL_SIGNAL_FAILED");
    }
  }
  let processTreeTerminated = await waitForGroupEmpty(
    adapter,
    groupId,
    policy.graceMs,
  );
  if (!processTreeTerminated) {
    try {
      await adapter.signal(groupId, policy.forceSignal);
      forceSignalSent = true;
      appendReceipt({
        kind: "process-group-signal-sent",
        signal: policy.forceSignal,
      });
    } catch (error) {
      if (!isNoSuchProcess(error)) {
        addFailure(failureCodes, "R5_FORCE_SIGNAL_FAILED");
      }
    }
    processTreeTerminated = await waitForGroupEmpty(
      adapter,
      groupId,
      policy.forceKillWaitMs,
    );
  }
  return {
    gracefulSignalSent,
    forceSignalSent,
    processTreeTerminated,
  };
}

async function waitForGroupEmpty(adapter, groupId, timeoutMs) {
  const deadline = process.hrtime.bigint() + BigInt(timeoutMs) * 1_000_000n;
  do {
    if (await safeGroupEmpty(adapter, groupId)) return true;
    await delay(POLL_INTERVAL_MS);
  } while (process.hrtime.bigint() < deadline);
  return safeGroupEmpty(adapter, groupId);
}

async function safeGroupEmpty(adapter, groupId) {
  try {
    return await adapter.isEmpty(groupId) === true;
  } catch {
    return false;
  }
}

function defaultProcessGroupAdapter() {
  return Object.freeze({
    signal(groupId, signal) {
      process.kill(-groupId, signal);
    },
    isEmpty(groupId) {
      try {
        process.kill(-groupId, 0);
        return false;
      } catch (error) {
        return isNoSuchProcess(error);
      }
    },
  });
}

function parseJsonl(text) {
  const events = [];
  const failureCodes = [];
  for (const line of text.split(/\r?\n/u)) {
    if (line.length === 0) continue;
    try {
      const event = JSON.parse(line);
      if (typeof event !== "object" || event === null || Array.isArray(event)) {
        throw new Error("invalid");
      }
      events.push(event);
    } catch {
      addFailure(failureCodes, "R5_STDOUT_JSONL_INVALID");
    }
  }
  return { events, failureCodes };
}

function observeFinalResponse(path, maxBytes) {
  let descriptor;
  try {
    const before = lstatSync(path);
    if (before.isSymbolicLink()) {
      return finalObservation(
        "symlink-rejected",
        null,
        null,
        "R5_FINAL_RESPONSE_SYMLINK_REJECTED",
      );
    }
    if (!before.isFile()) {
      return finalObservation(
        "non-regular-rejected",
        null,
        null,
        "R5_FINAL_RESPONSE_NON_REGULAR",
      );
    }
    if (before.size > maxBytes) {
      return finalObservation(
        "limit-exceeded",
        String(before.size),
        null,
        "R5_FINAL_RESPONSE_LIMIT_EXCEEDED",
      );
    }
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      return finalObservation(
        "identity-mismatch",
        null,
        null,
        "R5_FINAL_RESPONSE_IDENTITY_CHANGED",
      );
    }
    const body = readFileSync(descriptor);
    if (body.byteLength === 0) {
      return finalObservation(
        "empty",
        "0",
        sha256(body),
        "R5_FINAL_RESPONSE_EMPTY",
      );
    }
    return {
      status: "captured",
      text: body.toString("utf8"),
      bytes: String(body.byteLength),
      rawSha256: sha256(body),
      failureCode: null,
    };
  } catch {
    return finalObservation(
      "missing",
      null,
      null,
      "R5_FINAL_RESPONSE_MISSING",
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function finalObservation(status, bytes, rawSha256, failureCode) {
  return { status, text: null, bytes, rawSha256, failureCode };
}

function runBoundaryStage({
  stage,
  callback,
  input,
  failureCodes,
}) {
  try {
    const result = callback(input);
    if (!isBoundaryResult(result)) {
      throw new Error(`R5_${stage.toUpperCase()}_RESULT_INVALID`);
    }
    for (const code of result.failureCodes) addFailure(failureCodes, code);
    if (result.valid !== true) {
      addFailure(failureCodes, `R5_${stage.toUpperCase()}_FAILED`);
    }
    return {
      ...result,
      status: result.valid ? "passed" : "failed",
    };
  } catch (error) {
    const code = errorCode(error, "R5_INTERNAL_EXCEPTION");
    addFailure(failureCodes, code);
    return {
      status: "exception",
      valid: false,
      failureCodes: [code],
      errorFingerprint: sha256(errorFingerprintSource(error)),
      rawMessagePersisted: false,
    };
  }
}

function isBoundaryResult(value) {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && typeof value.valid === "boolean"
    && Array.isArray(value.failureCodes)
    && value.failureCodes.every((code) => ERROR_CODE.test(code));
}

function chooseOutcome({
  trigger,
  deadlineExpired,
  cancellationReason,
  processTreeTerminated,
  finalObservation,
  audit,
  evaluator,
  terminal,
  failureCodes,
}) {
  if (!processTreeTerminated) return "failed";
  if (deadlineExpired && trigger === "wall-clock-deadline") return "terminated";
  if (trigger === "outer-cancellation" && cancellationReason !== null) {
    return "cancelled";
  }
  const success = failureCodes.length === 0
    && finalObservation.status === "captured"
    && audit.valid === true
    && evaluator.valid === true
    && terminal?.launchFailed === false
    && terminal.exitCode === 0;
  return success ? "success" : "failed";
}

function writeManifest(root) {
  const files = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();
  const body = `${files.map((name) => (
    `${sha256(readFileSync(join(root, name)))}  ${name}`
  )).join("\n")}\n`;
  writeText(join(root, "SHA256SUMS"), body);
}

function readBoundedRegularFile(path, maxBytes) {
  let descriptor;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) {
      throw new Error("R5_EVIDENCE_FILE_INVALID");
    }
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error("R5_EVIDENCE_FILE_INVALID");
    }
    return readFileSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function evidenceFileLimit(name) {
  if (name === "stdout.jsonl" || name === "stderr.txt") {
    return 64 * 1024 * 1024;
  }
  if (name === "final-response.txt") return 16 * 1024 * 1024;
  return MAX_CONTROL_BYTES;
}

function writeJson(path, value) {
  writeText(path, `${canonicalJson(value)}\n`);
}

function writeText(path, value) {
  writeFileSync(path, value, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function addFailure(failureCodes, code) {
  if (ERROR_CODE.test(code) && !failureCodes.includes(code)) {
    failureCodes.push(code);
  }
}

function errorCode(error, fallback) {
  const message = error instanceof Error ? error.message : "";
  return ERROR_CODE.test(message) ? message : fallback;
}

function errorFingerprintSource(error) {
  return error instanceof Error
    ? `${error.name}:${error.message}`
    : typeof error;
}

function normalizeCancellationReason(reason) {
  if (typeof reason !== "string") return "abort-signal";
  return /^[A-Za-z0-9._:-]{1,128}$/u.test(reason)
    ? reason
    : "abort-signal";
}

function isStringRecord(value) {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "string");
}

function isNoSuchProcess(error) {
  return error?.code === "ESRCH";
}

async function settleWithTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((resolvePromise) => {
    timer = setTimeout(() => resolvePromise(null), timeoutMs);
  });
  const settled = await Promise.race([
    promise.then((value) => ({ value })),
    timeout,
  ]);
  clearTimeout(timer);
  return settled === null ? null : settled.value;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
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
