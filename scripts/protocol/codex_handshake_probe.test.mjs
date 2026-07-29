import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const evidenceRoot = resolve(root, "docs/test-evidence/P0-T3/20260729T120836+0800");

function evidence(name) {
  const lines = readFileSync(resolve(evidenceRoot, name), "utf8").trim().split("\n");
  expect(lines).toHaveLength(1);
  const value = JSON.parse(lines[0]);
  expect(Object.keys(value).sort()).toEqual(["capabilityKeys", "clientInfo", "protocolVersion", "responseProtocolVersion", "schemaVersion", "taskCapabilityAdvertised"].sort());
  return value;
}

describe("real Codex MCP initialization evidence", () => {
  test("records the observed primary without retaining sensitive initialization data", () => {
    expect(evidence("codex-primary.jsonl")).toEqual({
      schemaVersion: "P0-T3-codex-handshake-v1",
      protocolVersion: "2025-06-18",
      responseProtocolVersion: "2025-06-18",
      clientInfo: { name: "codex-mcp-client", version: "0.144.5" },
      capabilityKeys: ["elicitation"],
      taskCapabilityAdvertised: false,
    });
  });

  test("records both accepted compatibility responses", () => {
    expect(evidence("codex-compat-2025-03-26.jsonl").responseProtocolVersion).toBe("2025-03-26");
    expect(evidence("codex-compat-2025-11-25.jsonl").responseProtocolVersion).toBe("2025-11-25");
  });

  test("keeps ADR contracts and accepted owner decision explicit", () => {
    const adr = readFileSync(resolve(root, "docs/adr/0004-mcp-protocol-compatibility.md"), "utf8");
    for (const id of ["CORE-BOUND-001", "REV-ID-001", "EVIDENCE-TRUST-001", "PRIV-MIN-001", "MCP-COMPAT-001", "CONF-BIND-001"]) expect(adr).toContain(id);
    expect(adr).toContain("Status: Accepted");
    const decision = JSON.parse(readFileSync(resolve(evidenceRoot, "owner-decision.json"), "utf8"));
    expect(decision).toMatchObject({
      accepted: true,
      ownerStatement: "接受",
      primaryRevision: "2025-06-18",
      p0TaskMode: "none",
    });
  });

  test("probe output remains bounded to an allowlist", () => {
    const source = readFileSync(resolve(root, "scripts/protocol/codex_handshake_probe.mjs"), "utf8");
    expect(source).not.toContain("JSON.stringify(params)");
    expect(source).not.toContain("process.env)");
    expect(source).not.toContain("authorization");
    expect(source).toContain("taskCapabilityAdvertised");
  });
});
