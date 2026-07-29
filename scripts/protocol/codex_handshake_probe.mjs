import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const evidencePath = process.env.VEM_MCP_HANDSHAKE_EVIDENCE;
if (!evidencePath) throw new Error("VEM_MCP_HANDSHAKE_EVIDENCE is required");

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function keys(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : [];
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  if (request.method === "initialize") {
    const params = request.params ?? {};
    const responseProtocolVersion = process.env.VEM_MCP_RESPONSE_REVISION ?? params.protocolVersion;
    const evidence = {
      schemaVersion: "P0-T3-codex-handshake-v1",
      protocolVersion: params.protocolVersion ?? null,
      responseProtocolVersion,
      clientInfo: {
        name: params.clientInfo?.name ?? null,
        version: params.clientInfo?.version ?? null,
      },
      capabilityKeys: keys(params.capabilities),
      taskCapabilityAdvertised: keys(params.capabilities).some((key) => key.includes("task")),
    };
    appendFileSync(evidencePath, `${JSON.stringify(evidence)}\n`, { encoding: "utf8", mode: 0o600 });
    write({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: responseProtocolVersion,
        capabilities: {},
        serverInfo: { name: "vem-p0-t3-handshake-probe", version: "0.0.0" },
      },
    });
  } else if (request.method === "tools/list") {
    write({ jsonrpc: "2.0", id: request.id, result: { tools: [] } });
  } else if (request.method === "resources/list") {
    write({ jsonrpc: "2.0", id: request.id, result: { resources: [] } });
  } else if (request.method === "resources/templates/list") {
    write({ jsonrpc: "2.0", id: request.id, result: { resourceTemplates: [] } });
  } else if (request.method === "prompts/list") {
    write({ jsonrpc: "2.0", id: request.id, result: { prompts: [] } });
  } else if (request.method === "ping") {
    write({ jsonrpc: "2.0", id: request.id, result: {} });
  } else if (request.id !== undefined) {
    write({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not implemented by handshake-only probe" } });
  }
});
