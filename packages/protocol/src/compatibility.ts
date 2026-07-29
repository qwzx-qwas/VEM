import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import type { McpRevision } from "./types.js";

export const PRIMARY_MCP_REVISION = "2025-06-18" as const;
export const COMPATIBLE_MCP_REVISIONS = ["2025-03-26", "2025-11-25"] as const;
export const PINNED_SDK_LATEST_REVISION = LATEST_PROTOCOL_VERSION;

export interface CompatibilityEntry {
  revision: McpRevision;
  role: "primary" | "compat";
  structuredContent: boolean;
  compatibleTextRequired: true;
  p0TaskMode: "none";
  taskBoundary: string;
}

export const MCP_COMPATIBILITY_MATRIX: readonly CompatibilityEntry[] = [
  { revision: "2025-03-26", role: "compat", structuredContent: false, compatibleTextRequired: true, p0TaskMode: "none", taskBoundary: "No Tasks; bounded tool call plus cancellation and journal replay." },
  { revision: "2025-06-18", role: "primary", structuredContent: true, compatibleTextRequired: true, p0TaskMode: "none", taskBoundary: "Observed Codex 0.144.5 initialization; no task capability advertised." },
  { revision: "2025-11-25", role: "compat", structuredContent: true, compatibleTextRequired: true, p0TaskMode: "none", taskBoundary: "Experimental Tasks remain disabled in P0 and cannot be mixed with a later extension wire shape." },
];

export function negotiateP0Session(requestedRevision: string, clientCapabilityKeys: readonly string[]) {
  const entry = MCP_COMPATIBILITY_MATRIX.find((candidate) => candidate.revision === requestedRevision);
  if (!entry) throw new Error(`UNSUPPORTED_MCP_REVISION:${requestedRevision}`);
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(requestedRevision)) throw new Error(`SDK_REVISION_DRIFT:${requestedRevision}`);
  return {
    revision: entry.revision,
    structuredContent: entry.structuredContent,
    compatibleTextRequired: true as const,
    taskMode: "none" as const,
    ignoredTaskAdvertisement: clientCapabilityKeys.some((key) => key.toLowerCase().includes("task")),
  };
}

export function compareRevisionContext(left: { projectInstanceId: string; coordinatorSequence: number }, right: { projectInstanceId: string; coordinatorSequence: number }) {
  if (left.projectInstanceId !== right.projectInstanceId) return "different-project-instance" as const;
  if (left.coordinatorSequence === right.coordinatorSequence) return "equal" as const;
  return left.coordinatorSequence < right.coordinatorSequence ? "before" as const : "after" as const;
}
