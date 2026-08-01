import { describe, expect, test } from "vitest";
import { sha256Text, TrustedReceiptLedger } from "./index.js";

const HASH = "a".repeat(64);
const INVOCATION_HASH = "b".repeat(64);

function clock(...values: bigint[]): () => bigint {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error("TEST_CLOCK_EXHAUSTED");
    index += 1;
    return value;
  };
}

function successfulLedger(): TrustedReceiptLedger {
  const ledger = new TrustedReceiptLedger({
    runId: "recovery-task-1-direct",
    instrumentationHash: HASH,
    clockDomain: "test.monotonic",
    nowNs: clock(100n, 110n, 120n, 130n),
  });
  ledger.recordProcessSpawned(INVOCATION_HASH);
  ledger.recordStdoutEvent('{"type":"thread.started","thread_id":"secret-thread"}');
  ledger.recordStructuredResponse('{"relativeFile":"src/App.tsx"}');
  ledger.recordProcessExited({ exitCode: 0 });
  return ledger;
}

describe("R0-T2 TrustedReceiptLedger", () => {
  test("builds deterministic canonical evidence from trusted receipt points without raw bodies", () => {
    const result = successfulLedger().build();
    expect(result.contentHash).toBe(sha256Text(result.canonicalJson));
    expect(result.ledger).toMatchObject({
      schemaVersion: "R0-T2-trusted-receipt-ledger-v1",
      ledgerVersion: "1.0.0",
      runId: "recovery-task-1-direct",
      instrumentationHash: HASH,
      clock: {
        provider: "trusted-outer-runner",
        domain: "test.monotonic",
        unit: "nanoseconds",
        semantics: "local-receipt-time-not-provider-generation-time",
      },
      entryCount: 4,
      totalRawBytes: (
        Buffer.byteLength('{"type":"thread.started","thread_id":"secret-thread"}')
        + Buffer.byteLength('{"relativeFile":"src/App.tsx"}')
      ).toString(),
      firstReceivedAtNs: "100",
      lastReceivedAtNs: "130",
      terminalOutcome: "success",
    });
    expect(result.ledger.entries.map((entry) => entry.sequence)).toEqual([0, 1, 2, 3]);
    expect(result.canonicalJson).not.toContain("secret-thread");
    expect(result.canonicalJson).not.toContain("src/App.tsx");
    expect(Object.isFrozen(result.ledger.entries)).toBe(true);
    expect(successfulLedger().build()).toEqual(result);
  });

  test("fails closed on backward or invalid clock readings", () => {
    const backward = new TrustedReceiptLedger({
      runId: "run",
      instrumentationHash: HASH,
      nowNs: clock(20n, 19n, 21n, 22n, 23n),
    });
    backward.recordProcessSpawned(INVOCATION_HASH);
    expect(() => backward.recordStdoutEvent('{"type":"turn.started"}'))
      .toThrowError("RECEIPT_LEDGER_CLOCK_INVALID");
    backward.recordStdoutEvent('{"type":"turn.started"}');
    backward.recordStructuredResponse("{}");
    backward.recordProcessExited({ exitCode: 0 });
    expect(backward.build().ledger.totalRawBytes).toBe(
      (
        Buffer.byteLength('{"type":"turn.started"}')
        + Buffer.byteLength("{}")
      ).toString(),
    );
    expect(() => new TrustedReceiptLedger({
      runId: "run",
      instrumentationHash: HASH,
      nowNs: () => -1n,
    }).recordProcessSpawned(INVOCATION_HASH)).toThrowError("RECEIPT_LEDGER_CLOCK_INVALID");
  });

  test("enforces spawn response exit ordering and single terminal events", () => {
    const beforeSpawn = new TrustedReceiptLedger({
      runId: "run",
      instrumentationHash: HASH,
    });
    expect(() => beforeSpawn.recordStdoutEvent('{"type":"turn.started"}'))
      .toThrowError("RECEIPT_LEDGER_STATE_INVALID");

    const missingResponse = new TrustedReceiptLedger({
      runId: "run",
      instrumentationHash: HASH,
    });
    missingResponse.recordProcessSpawned(INVOCATION_HASH);
    expect(() => missingResponse.recordProcessExited({ exitCode: 0 }))
      .toThrowError("RECEIPT_LEDGER_EXIT_INVALID");
    expect(() => missingResponse.build()).toThrowError("RECEIPT_LEDGER_TERMINAL_MISSING");

    const duplicate = successfulLedger();
    expect(() => duplicate.recordStructuredResponse("{}"))
      .toThrowError("RECEIPT_LEDGER_STATE_INVALID");
    expect(() => duplicate.recordProcessExited({ exitCode: 0 }))
      .toThrowError("RECEIPT_LEDGER_STATE_INVALID");
  });

  test("records nonzero and cancelled terminal outcomes without requiring a response", () => {
    const errored = new TrustedReceiptLedger({
      runId: "error-run",
      instrumentationHash: HASH,
      nowNs: clock(1n, 2n),
    });
    errored.recordProcessSpawned(INVOCATION_HASH);
    errored.recordProcessExited({ exitCode: 2 });
    expect(errored.build().ledger.terminalOutcome).toBe("error");

    const cancelled = new TrustedReceiptLedger({
      runId: "cancelled-run",
      instrumentationHash: HASH,
      nowNs: clock(1n, 2n, 3n),
    });
    cancelled.recordProcessSpawned(INVOCATION_HASH);
    cancelled.recordCancellationRequested("OWNER_CANCELLED");
    cancelled.recordProcessExited({ exitCode: null, signal: "SIGTERM" });
    expect(cancelled.build().ledger.terminalOutcome).toBe("cancelled");
  });

  test("rejects malformed JSONL events, duplicate responses and unsafe identifiers", () => {
    const malformed = new TrustedReceiptLedger({
      runId: "run",
      instrumentationHash: HASH,
    });
    malformed.recordProcessSpawned(INVOCATION_HASH);
    expect(() => malformed.recordStdoutEvent("not-json"))
      .toThrowError("RECEIPT_LEDGER_EVENT_INVALID");
    expect(() => malformed.recordStdoutEvent('{"type":"turn.started"}\n'))
      .toThrowError("RECEIPT_LEDGER_EVENT_INVALID");

    const duplicate = new TrustedReceiptLedger({
      runId: "run",
      instrumentationHash: HASH,
    });
    duplicate.recordProcessSpawned(INVOCATION_HASH);
    duplicate.recordStructuredResponse("{}");
    expect(() => duplicate.recordStructuredResponse("{}"))
      .toThrowError("RECEIPT_LEDGER_RESPONSE_DUPLICATE");
    expect(() => new TrustedReceiptLedger({
      runId: "../escape",
      instrumentationHash: HASH,
    })).toThrowError("RECEIPT_LEDGER_OPTIONS_INVALID");
  });

  test("enforces per-event total-byte and entry bounds before retaining evidence", () => {
    const perEvent = new TrustedReceiptLedger({
      runId: "run",
      instrumentationHash: HASH,
      limits: { maxEventBytes: 8, maxTotalBytes: 16 },
    });
    perEvent.recordProcessSpawned(INVOCATION_HASH);
    expect(() => perEvent.recordStderrChunk("123456789"))
      .toThrowError("RECEIPT_LEDGER_STDERR_INVALID");

    const total = new TrustedReceiptLedger({
      runId: "run",
      instrumentationHash: HASH,
      limits: { maxEventBytes: 8, maxTotalBytes: 8 },
    });
    total.recordProcessSpawned(INVOCATION_HASH);
    total.recordStderrChunk("12345678");
    expect(() => total.recordStderrChunk("1"))
      .toThrowError("RECEIPT_LEDGER_TOTAL_BYTES_EXCEEDED");

    const entries = new TrustedReceiptLedger({
      runId: "run",
      instrumentationHash: HASH,
      limits: { maxEntries: 4 },
    });
    entries.recordProcessSpawned(INVOCATION_HASH);
    entries.recordStderrChunk("1");
    entries.recordStderrChunk("2");
    entries.recordStderrChunk("3");
    expect(() => entries.recordStderrChunk("4"))
      .toThrowError("RECEIPT_LEDGER_ENTRY_LIMIT_EXCEEDED");
  });

  test("returns the same immutable result after finalization", () => {
    const ledger = successfulLedger();
    const first = ledger.build();
    const second = ledger.build();
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => ledger.recordStderrChunk("late"))
      .toThrowError("RECEIPT_LEDGER_STATE_INVALID");
  });
});
