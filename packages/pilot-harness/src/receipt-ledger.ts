import { canonicalJson, deepFreeze, sha256Text } from "./canonical.js";

const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const CLOCK_DOMAIN = /^[A-Za-z0-9._:-]{1,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const EVENT_TYPE = /^[a-z][a-z0-9_.-]{0,127}$/u;
const REASON_CODE = /^[A-Z][A-Z0-9_]{1,63}$/u;
const SIGNAL = /^[A-Z][A-Z0-9]{1,31}$/u;

export interface ReceiptLedgerLimits {
  maxEntries: number;
  maxEventBytes: number;
  maxTotalBytes: number;
}

export interface TrustedReceiptLedgerOptions {
  runId: string;
  instrumentationHash: string;
  clockDomain?: string;
  nowNs?: () => bigint;
  limits?: Partial<ReceiptLedgerLimits>;
}

export type ReceiptLedgerEntry =
  | {
    sequence: number;
    receivedAtNs: string;
    kind: "process-spawned";
    invocationHash: string;
  }
  | {
    sequence: number;
    receivedAtNs: string;
    kind: "stdout-event-received";
    rawSha256: string;
    bytes: string;
    eventType: string;
    itemIdHash?: string;
  }
  | {
    sequence: number;
    receivedAtNs: string;
    kind: "stderr-chunk-received";
    rawSha256: string;
    bytes: string;
  }
  | {
    sequence: number;
    receivedAtNs: string;
    kind: "structured-response-received";
    rawSha256: string;
    bytes: string;
  }
  | {
    sequence: number;
    receivedAtNs: string;
    kind: "cancellation-requested";
    reasonCode: string;
  }
  | {
    sequence: number;
    receivedAtNs: string;
    kind: "process-exited";
    exitCode: number | null;
    signal: string | null;
    outcome: "success" | "error" | "cancelled";
  };

type PendingReceiptLedgerEntry = ReceiptLedgerEntry extends infer Entry
  ? Entry extends ReceiptLedgerEntry
    ? Omit<Entry, "sequence" | "receivedAtNs">
    : never
  : never;

export interface TrustedReceiptLedgerEvidence {
  schemaVersion: "R0-T2-trusted-receipt-ledger-v1";
  ledgerVersion: "1.0.0";
  runId: string;
  instrumentationHash: string;
  clock: {
    provider: "trusted-outer-runner";
    domain: string;
    unit: "nanoseconds";
    semantics: "local-receipt-time-not-provider-generation-time";
  };
  entryCount: number;
  totalRawBytes: string;
  firstReceivedAtNs: string;
  lastReceivedAtNs: string;
  terminalOutcome: "success" | "error" | "cancelled";
  entries: ReceiptLedgerEntry[];
  limitations: [
    "NO_MODEL_SERVER_GENERATION_TIME",
    "NO_MODEL_COMPUTE_ATTRIBUTION",
    "NO_SHELL_INTERNAL_TIMING",
  ];
}

export interface TrustedReceiptLedgerBuildResult {
  ledger: TrustedReceiptLedgerEvidence;
  canonicalJson: string;
  contentHash: string;
}

const DEFAULT_LIMITS: ReceiptLedgerLimits = Object.freeze({
  maxEntries: 4_096,
  maxEventBytes: 1_048_576,
  maxTotalBytes: 16_777_216,
});

export class TrustedReceiptLedger {
  readonly #runId: string;
  readonly #instrumentationHash: string;
  readonly #clockDomain: string;
  readonly #nowNs: () => bigint;
  readonly #limits: ReceiptLedgerLimits;
  readonly #entries: ReceiptLedgerEntry[] = [];
  #lastReceivedAtNs: bigint | null = null;
  #totalRawBytes = 0n;
  #spawned = false;
  #responseReceived = false;
  #cancellationRequested = false;
  #exited = false;
  #built: TrustedReceiptLedgerBuildResult | null = null;

  constructor(options: TrustedReceiptLedgerOptions) {
    if (!ID.test(options.runId)
      || !HASH.test(options.instrumentationHash)
      || (options.clockDomain !== undefined && !CLOCK_DOMAIN.test(options.clockDomain))) {
      throw new Error("RECEIPT_LEDGER_OPTIONS_INVALID");
    }
    const limits = {
      ...DEFAULT_LIMITS,
      ...options.limits,
    };
    if (!Number.isSafeInteger(limits.maxEntries)
      || limits.maxEntries < 4
      || limits.maxEntries > 65_536
      || !Number.isSafeInteger(limits.maxEventBytes)
      || limits.maxEventBytes < 1
      || limits.maxEventBytes > 16_777_216
      || !Number.isSafeInteger(limits.maxTotalBytes)
      || limits.maxTotalBytes < limits.maxEventBytes
      || limits.maxTotalBytes > 67_108_864) {
      throw new Error("RECEIPT_LEDGER_LIMITS_INVALID");
    }
    this.#runId = options.runId;
    this.#instrumentationHash = options.instrumentationHash;
    this.#clockDomain = options.clockDomain ?? "node:process.hrtime.bigint";
    this.#nowNs = options.nowNs ?? process.hrtime.bigint;
    this.#limits = Object.freeze(limits);
  }

  recordProcessSpawned(invocationHash: string): void {
    if (!HASH.test(invocationHash)
      || this.#spawned
      || this.#entries.length !== 0
      || this.#exited) {
      throw new Error("RECEIPT_LEDGER_SPAWN_INVALID");
    }
    this.#append({
      kind: "process-spawned",
      invocationHash,
    });
    this.#spawned = true;
  }

  recordStdoutEvent(rawEvent: string): void {
    this.#requireActive();
    const bytes = encodeBounded(rawEvent, this.#limits.maxEventBytes, "RECEIPT_LEDGER_EVENT_INVALID");
    if (rawEvent.includes("\n") || rawEvent.includes("\r")) {
      throw new Error("RECEIPT_LEDGER_EVENT_INVALID");
    }
    let event: unknown;
    try {
      event = JSON.parse(rawEvent);
    } catch {
      throw new Error("RECEIPT_LEDGER_EVENT_INVALID");
    }
    if (typeof event !== "object" || event === null || Array.isArray(event)) {
      throw new Error("RECEIPT_LEDGER_EVENT_INVALID");
    }
    const record = event as Record<string, unknown>;
    if (typeof record.type !== "string" || !EVENT_TYPE.test(record.type)) {
      throw new Error("RECEIPT_LEDGER_EVENT_INVALID");
    }
    const item = record.item;
    const itemId = typeof item === "object" && item !== null && !Array.isArray(item)
      ? (item as Record<string, unknown>).id
      : undefined;
    if (itemId !== undefined && (typeof itemId !== "string" || !ID.test(itemId))) {
      throw new Error("RECEIPT_LEDGER_EVENT_INVALID");
    }
    this.#append({
      kind: "stdout-event-received",
      rawSha256: sha256Text(bytes),
      bytes: bytes.byteLength.toString(),
      eventType: record.type,
      ...(typeof itemId === "string" ? { itemIdHash: sha256Text(itemId) } : {}),
    }, bytes.byteLength);
  }

  recordStderrChunk(rawChunk: string | Uint8Array): void {
    this.#requireActive();
    const bytes = encodeBounded(rawChunk, this.#limits.maxEventBytes, "RECEIPT_LEDGER_STDERR_INVALID");
    this.#append({
      kind: "stderr-chunk-received",
      rawSha256: sha256Text(bytes),
      bytes: bytes.byteLength.toString(),
    }, bytes.byteLength);
  }

  recordStructuredResponse(rawResponse: string | Uint8Array): void {
    this.#requireActive();
    if (this.#responseReceived) throw new Error("RECEIPT_LEDGER_RESPONSE_DUPLICATE");
    const bytes = encodeBounded(
      rawResponse,
      this.#limits.maxEventBytes,
      "RECEIPT_LEDGER_RESPONSE_INVALID",
    );
    this.#append({
      kind: "structured-response-received",
      rawSha256: sha256Text(bytes),
      bytes: bytes.byteLength.toString(),
    }, bytes.byteLength);
    this.#responseReceived = true;
  }

  recordCancellationRequested(reasonCode: string): void {
    this.#requireActive();
    if (this.#cancellationRequested || !REASON_CODE.test(reasonCode)) {
      throw new Error("RECEIPT_LEDGER_CANCELLATION_INVALID");
    }
    this.#append({
      kind: "cancellation-requested",
      reasonCode,
    });
    this.#cancellationRequested = true;
  }

  recordProcessExited({
    exitCode,
    signal = null,
  }: {
    exitCode: number | null;
    signal?: string | null;
  }): void {
    this.#requireActive();
    if ((exitCode !== null && (!Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255))
      || (signal !== null && !SIGNAL.test(signal))
      || (exitCode === null && signal === null)
      || (exitCode === 0 && !this.#responseReceived && !this.#cancellationRequested)) {
      throw new Error("RECEIPT_LEDGER_EXIT_INVALID");
    }
    const outcome = this.#cancellationRequested
      ? "cancelled"
      : exitCode === 0 ? "success" : "error";
    this.#append({
      kind: "process-exited",
      exitCode,
      signal,
      outcome,
    });
    this.#exited = true;
  }

  build(): TrustedReceiptLedgerBuildResult {
    if (!this.#exited) throw new Error("RECEIPT_LEDGER_TERMINAL_MISSING");
    if (this.#built !== null) return this.#built;
    const first = this.#entries[0];
    const last = this.#entries.at(-1);
    if (first?.kind !== "process-spawned" || last?.kind !== "process-exited") {
      throw new Error("RECEIPT_LEDGER_TERMINAL_INVALID");
    }
    const ledger: TrustedReceiptLedgerEvidence = {
      schemaVersion: "R0-T2-trusted-receipt-ledger-v1",
      ledgerVersion: "1.0.0",
      runId: this.#runId,
      instrumentationHash: this.#instrumentationHash,
      clock: {
        provider: "trusted-outer-runner",
        domain: this.#clockDomain,
        unit: "nanoseconds",
        semantics: "local-receipt-time-not-provider-generation-time",
      },
      entryCount: this.#entries.length,
      totalRawBytes: this.#totalRawBytes.toString(),
      firstReceivedAtNs: first.receivedAtNs,
      lastReceivedAtNs: last.receivedAtNs,
      terminalOutcome: last.outcome,
      entries: this.#entries.map((entry) => ({ ...entry })),
      limitations: [
        "NO_MODEL_SERVER_GENERATION_TIME",
        "NO_MODEL_COMPUTE_ATTRIBUTION",
        "NO_SHELL_INTERNAL_TIMING",
      ],
    };
    const frozenLedger = deepFreeze(ledger);
    const serialized = canonicalJson(frozenLedger);
    this.#built = deepFreeze({
      ledger: frozenLedger,
      canonicalJson: serialized,
      contentHash: sha256Text(serialized),
    });
    return this.#built;
  }

  #requireActive(): void {
    if (!this.#spawned || this.#exited || this.#built !== null) {
      throw new Error("RECEIPT_LEDGER_STATE_INVALID");
    }
  }

  #append(entry: PendingReceiptLedgerEntry, rawBytes = 0): void {
    if (this.#entries.length >= this.#limits.maxEntries) {
      throw new Error("RECEIPT_LEDGER_ENTRY_LIMIT_EXCEEDED");
    }
    const nextTotalRawBytes = this.#totalRawBytes + BigInt(rawBytes);
    if (nextTotalRawBytes > BigInt(this.#limits.maxTotalBytes)) {
      throw new Error("RECEIPT_LEDGER_TOTAL_BYTES_EXCEEDED");
    }
    const receivedAtNs = this.#nowNs();
    if (typeof receivedAtNs !== "bigint"
      || receivedAtNs < 0n
      || (this.#lastReceivedAtNs !== null && receivedAtNs < this.#lastReceivedAtNs)) {
      throw new Error("RECEIPT_LEDGER_CLOCK_INVALID");
    }
    this.#lastReceivedAtNs = receivedAtNs;
    this.#totalRawBytes = nextTotalRawBytes;
    this.#entries.push({
      sequence: this.#entries.length,
      receivedAtNs: receivedAtNs.toString(),
      ...entry,
    } as ReceiptLedgerEntry);
  }
}

function encodeBounded(
  value: string | Uint8Array,
  maxBytes: number,
  code: string,
): Uint8Array {
  if ((typeof value !== "string" && !(value instanceof Uint8Array))) {
    throw new Error(code);
  }
  const bytes = typeof value === "string" ? Buffer.from(value) : new Uint8Array(value);
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new Error(code);
  return bytes;
}
