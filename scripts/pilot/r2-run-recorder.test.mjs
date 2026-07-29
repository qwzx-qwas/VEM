import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  classifyR2ResponseOutcome,
  executeR2RecordedProcess,
} from "./r2-run-recorder.mjs";

const roots = [];
const INSTRUMENTATION_HASH = "e".repeat(64);

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("R2 authoritative final-output recorder", () => {
  test("ignores an early wrong agent message and selects the authoritative final file", async () => {
    const correct = validResponse(7, "vem1_1fca6dac19137a546084bc64ae003bc0");
    const result = await execute({
      events: [
        event("thread.started", { thread_id: "thread-r2" }),
        agentMessage(JSON.stringify(validResponse(1))),
        agentMessage(JSON.stringify(correct)),
        event("turn.completed", {}),
      ],
      finalText: JSON.stringify(correct),
    });
    expect(result).toMatchObject({
      outcome: "success",
      failureCodes: [],
      selectedResponse: correct,
      authoritativeResponseStatus: "valid-consistent",
    });
    const ledger = json(join(result.outputRoot, "receipt-ledger.json"));
    expect(ledger.entries.filter((entry) => entry.kind === "agent-message-observed"))
      .toHaveLength(2);
    expect(ledger.entries.find((entry) => entry.kind === "structured-response-selected"))
      .toMatchObject({ selectionPolicy: "output-last-message-authoritative-file" });
    expect(readFileSync(join(result.outputRoot, "final-response.txt"), "utf8"))
      .toBe(JSON.stringify(correct));
    verifyManifest(result.outputRoot);
  });

  test.each([
    ["missing", undefined, "AUTHORITATIVE_RESPONSE_MISSING"],
    ["empty", "", "AUTHORITATIVE_RESPONSE_EMPTY"],
    ["invalid", "not-json", "AUTHORITATIVE_RESPONSE_INVALID"],
  ])("fails closed and seals %s final-response evidence", async (_name, finalText, code) => {
    const result = await execute({
      events: [agentMessage(JSON.stringify(validResponse(7))), event("turn.completed", {})],
      finalText,
    });
    expect(result).toMatchObject({ outcome: "failed", selectedResponse: null });
    expect(result.failureCodes).toContain(code);
    expect(json(join(result.outputRoot, "failure.json"))).toMatchObject({
      evidenceSealed: true,
      successfulResponseComplete: false,
    });
    verifyManifest(result.outputRoot);
  });

  test("fails when the authoritative file disagrees with the last agent message", async () => {
    const result = await execute({
      events: [agentMessage(JSON.stringify(validResponse(7))), event("turn.completed", {})],
      finalText: JSON.stringify(validResponse(8)),
    });
    expect(result.failureCodes).toContain("AUTHORITATIVE_RESPONSE_AUDIT_MISMATCH");
    expect(result.selectedResponse).toBeNull();
  });

  test("rejects oversized and symlink final-output paths", async () => {
    const oversized = await execute({
      events: [agentMessage(JSON.stringify(validResponse(7))), event("turn.completed", {})],
      finalText: "x".repeat(2_048),
      maxFinalResponseBytes: 128,
    });
    expect(oversized.failureCodes).toContain("AUTHORITATIVE_RESPONSE_LIMIT_EXCEEDED");

    const root = temporaryRoot();
    const target = join(root, "target.txt");
    const link = join(root, "final-link.txt");
    writeFileSync(target, JSON.stringify(validResponse(7)));
    symlinkSync(target, link);
    const symlink = await execute({
      events: [agentMessage(JSON.stringify(validResponse(7))), event("turn.completed", {})],
      authoritativeResponsePath: link,
    });
    expect(symlink.failureCodes).toContain("AUTHORITATIVE_RESPONSE_SYMLINK_REJECTED");
  });

  test("keeps protocol failure separate from wrong attribution", async () => {
    const failed = await execute({
      events: [agentMessage(JSON.stringify(validResponse(7))), event("turn.completed", {})],
      finalText: JSON.stringify(validResponse(8)),
    });
    expect(classifyR2ResponseOutcome({
      recorded: failed,
      responseMatchesGroundTruth: false,
    })).toEqual({
      protocolFailure: true,
      wrongAttribution: false,
      evidenceSealed: true,
      successfulResponseComplete: false,
    });
  });

  test("classifies a selected but incorrect response as wrong attribution", async () => {
    const selected = validResponse(7);
    const result = await execute({
      events: [agentMessage(JSON.stringify(selected)), event("turn.completed", {})],
      finalText: JSON.stringify(selected),
    });
    expect(classifyR2ResponseOutcome({
      recorded: result,
      responseMatchesGroundTruth: false,
    })).toEqual({
      protocolFailure: false,
      wrongAttribution: true,
      evidenceSealed: true,
      successfulResponseComplete: true,
    });
  });

  test("seals bounded stream cancellation before return", async () => {
    const result = await execute({
      events: [agentMessage("x".repeat(2_048)), event("turn.completed", {})],
      finalText: JSON.stringify(validResponse(7)),
      maxStreamBytes: 128,
    });
    expect(result.outcome).toBe("cancelled");
    expect(result.failureCodes).toContain("STDOUT_STREAM_LIMIT_EXCEEDED");
    expect(result.evidenceSealed).toBe(true);
    verifyManifest(result.outputRoot);
  });
});

async function execute({
  events,
  finalText,
  authoritativeResponsePath,
  maxFinalResponseBytes,
  maxStreamBytes,
}) {
  const root = temporaryRoot();
  const finalPath = authoritativeResponsePath ?? join(root, "authoritative.txt");
  const program = [
    `const events=${JSON.stringify(events)};`,
    "for(const value of events)process.stdout.write(`${JSON.stringify(value)}\\n`);",
    finalText === undefined
      ? ""
      : `require("node:fs").writeFileSync(${JSON.stringify(finalPath)},${JSON.stringify(finalText)});`,
  ].join("");
  return executeR2RecordedProcess({
    invocation: {
      executable: process.execPath,
      args: ["-e", program],
      cwd: resolve("."),
      env: { PATH: process.env.PATH ?? "" },
      authoritativeResponsePath: finalPath,
      evidence: { probe: "local-no-network", authoritativeResponse: "runner-owned-file" },
    },
    outputRoot: join(root, "evidence"),
    runId: `r2-run-${roots.length}`,
    instrumentationHash: INSTRUMENTATION_HASH,
    validateResponse,
    metadata: { probe: "local-no-network" },
    ...(maxFinalResponseBytes === undefined ? {} : { maxFinalResponseBytes }),
    ...(maxStreamBytes === undefined ? {} : { maxStreamBytes }),
  });
}

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "vem-r2-recorder-test-"));
  roots.push(root);
  return root;
}

function event(type, extra) { return { type, ...extra }; }
function agentMessage(text) {
  return event("item.completed", { item: { id: "message", type: "agent_message", text } });
}
function validResponse(line, sourceAnchorId = null) {
  return { relativeFile: "packages/demo-fixture/src/App.tsx", line, sourceAnchorId };
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
function json(path) { return JSON.parse(readFileSync(path, "utf8")); }
function verifyManifest(root) {
  for (const line of readFileSync(join(root, "SHA256SUMS"), "utf8").trim().split("\n")) {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._-]+)$/u.exec(line);
    expect(match).not.toBeNull();
    expect(createHash("sha256").update(readFileSync(join(root, match[2]))).digest("hex"))
      .toBe(match[1]);
  }
}
