import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  executeRecordedProcess,
  RemediatedRunRecorder,
} from "./r1-run-recorder.mjs";

const temporaryRoots = [];
const INSTRUMENTATION_HASH = "d".repeat(64);

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R1 remediated run recorder", () => {
  test("records multiple agent messages as events and selects one schema-valid final response", async () => {
    const result = await execute([
      event("thread.started", { thread_id: "thread-1" }),
      agentMessage("Working on the bounded task."),
      agentMessage(JSON.stringify(validResponse(17))),
      event("turn.completed", {}),
    ]);
    expect(result).toMatchObject({
      outcome: "success",
      failureCodes: [],
      selectedResponse: validResponse(17),
    });
    const ledger = readJson(join(result.outputRoot, "receipt-ledger.json"));
    expect(ledger.entries.filter(
      (entry) => entry.kind === "stdout-line-received",
    )).toHaveLength(4);
    expect(ledger.entries.filter(
      (entry) => entry.kind === "structured-response-selected",
    )).toHaveLength(1);
    expect(ledger.entries.find(
      (entry) => entry.kind === "structured-response-selected",
    )).toMatchObject({
      validCandidateCount: 1,
      selectionPolicy: "last-schema-valid-nonconflicting",
    });
    expect(ledger.entries.at(-1)).toMatchObject({
      kind: "run-finalized",
      outcome: "success",
    });
    verifyManifest(result.outputRoot);
  });

  test("selects the last of repeated identical valid responses without duplicate registration", async () => {
    const response = JSON.stringify(validResponse(22));
    const result = await execute([
      agentMessage(response),
      agentMessage(response),
    ]);
    expect(result).toMatchObject({
      outcome: "success",
      selectedResponse: validResponse(22),
    });
    const ledger = readJson(join(result.outputRoot, "receipt-ledger.json"));
    expect(ledger.entries.filter(
      (entry) => entry.kind === "structured-response-selected",
    )).toHaveLength(1);
    expect(ledger.entries.find(
      (entry) => entry.kind === "structured-response-selected",
    )?.validCandidateCount).toBe(2);
  });

  test("fails closed and seals raw terminal ledger and hashes for conflicting valid responses", async () => {
    const result = await execute([
      agentMessage(JSON.stringify(validResponse(10))),
      agentMessage(JSON.stringify(validResponse(11))),
    ]);
    expect(result).toMatchObject({
      outcome: "failed",
      failureCodes: ["STRUCTURED_RESPONSE_CONFLICT"],
      selectedResponse: null,
    });
    expect(readFileSync(join(result.outputRoot, "stdout.jsonl"), "utf8"))
      .toContain("\"agent_message\"");
    expect(readJson(join(result.outputRoot, "failure.json"))).toMatchObject({
      rawEvidencePersisted: true,
      ledgerEvidencePersisted: true,
      failureCodes: ["STRUCTURED_RESPONSE_CONFLICT"],
    });
    const ledger = readJson(join(result.outputRoot, "receipt-ledger.json"));
    expect(ledger.entries.some(
      (entry) => entry.kind === "protocol-failure-detected",
    )).toBe(true);
    expect(ledger.entries.at(-1)).toMatchObject({
      kind: "run-finalized",
      outcome: "failed",
    });
    verifyManifest(result.outputRoot);
  });

  test("seals missing-response and nonzero-process failures instead of throwing first", async () => {
    const missing = await execute([agentMessage("not structured JSON")]);
    expect(missing).toMatchObject({
      outcome: "failed",
      failureCodes: ["STRUCTURED_RESPONSE_MISSING"],
    });
    const nonzero = await execute(
      [event("thread.started", { thread_id: "thread-error" })],
      { stderr: "bounded diagnostic\n", exitCode: 7 },
    );
    expect(nonzero).toMatchObject({
      outcome: "failed",
      failureCodes: ["PROCESS_EXIT_NONZERO"],
    });
    expect(readFileSync(join(nonzero.outputRoot, "stderr.txt"), "utf8"))
      .toBe("bounded diagnostic\n");
    verifyManifest(nonzero.outputRoot);
  });

  test("seals stream-bound cancellation evidence within configured bounds", async () => {
    const result = await execute(
      [agentMessage("x".repeat(2_048))],
      { maxStreamBytes: 128 },
    );
    expect(result.outcome).toBe("cancelled");
    expect(result.failureCodes).toContain("STDOUT_STREAM_LIMIT_EXCEEDED");
    expect(readJson(join(result.outputRoot, "failure.json"))).toMatchObject({
      rawEvidencePersisted: true,
      ledgerEvidencePersisted: true,
      outcome: "cancelled",
    });
    verifyManifest(result.outputRoot);
  });

  test("rejects backward clocks and invalid state without partial state advancement", () => {
    const times = [10n, 9n, 11n, 12n, 13n, 14n];
    const recorder = new RemediatedRunRecorder({
      runId: "clock-probe",
      instrumentationHash: INSTRUMENTATION_HASH,
      nowNs: () => times.shift(),
    });
    recorder.recordProcessSpawned("a".repeat(64));
    expect(() => recorder.recordStdoutLine(JSON.stringify(
      event("thread.started", { thread_id: "thread-clock" }),
    ))).toThrowError("R1_RECORDER_CLOCK_INVALID");
    recorder.recordStdoutLine(JSON.stringify(
      event("thread.started", { thread_id: "thread-clock" }),
    ));
    recorder.recordProcessExited({ exitCode: 1 });
    expect(recorder.finalize({ validateResponse })).toMatchObject({
      outcome: "failed",
      failureCodes: ["PROCESS_EXIT_NONZERO"],
    });
    expect(() => recorder.recordStderrChunk("late"))
      .toThrowError("R1_RECORDER_STATE_INVALID");
  });
});

async function execute(events, {
  stderr = "",
  exitCode = 0,
  maxStreamBytes,
} = {}) {
  const parent = mkdtempSync(join(tmpdir(), "vem-r1-recorder-test-"));
  temporaryRoots.push(parent);
  const program = [
    `const events=${JSON.stringify(events)};`,
    "for(const value of events)process.stdout.write(`${JSON.stringify(value)}\\n`);",
    `process.stderr.write(${JSON.stringify(stderr)});`,
    `process.exitCode=${exitCode};`,
  ].join("");
  return executeRecordedProcess({
    invocation: {
      executable: process.execPath,
      args: ["--input-type=module", "-e", program],
      cwd: resolve("."),
      env: { PATH: process.env.PATH ?? "" },
      evidence: {
        executable: "<current-node>",
        args: ["--input-type=module", "-e", "<bounded-local-probe>"],
      },
    },
    outputRoot: join(parent, "evidence"),
    runId: `run-${temporaryRoots.length}`,
    instrumentationHash: INSTRUMENTATION_HASH,
    validateResponse,
    metadata: { probe: "local-no-network" },
    ...(maxStreamBytes === undefined ? {} : { maxStreamBytes }),
  });
}

function event(type, extra) {
  return { type, ...extra };
}

function agentMessage(text) {
  return event("item.completed", {
    item: { id: "item-message", type: "agent_message", text },
  });
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
  if (typeof parsed !== "object"
    || parsed === null
    || Array.isArray(parsed)
    || Object.keys(parsed).sort().join(",") !== "line,relativeFile,sourceAnchorId"
    || parsed.relativeFile !== "packages/demo-fixture/src/App.tsx"
    || !Number.isSafeInteger(parsed.line)
    || parsed.line < 1
    || (parsed.sourceAnchorId !== null
      && !/^vem1_[a-f0-9]{32}$/u.test(parsed.sourceAnchorId))) {
    return null;
  }
  return parsed;
}

function verifyManifest(root) {
  const lines = readFileSync(join(root, "SHA256SUMS"), "utf8").trim().split("\n");
  expect(lines.length).toBeGreaterThanOrEqual(4);
  for (const line of lines) {
    const match = /^(?<hash>[a-f0-9]{64}) {2}(?<path>[A-Za-z0-9._-]+)$/u.exec(line);
    expect(match?.groups).toBeDefined();
    expect(sha256(readFileSync(join(root, match.groups.path))))
      .toBe(match.groups.hash);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
