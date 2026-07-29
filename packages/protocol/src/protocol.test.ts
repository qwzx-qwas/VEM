import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";

import {
  BoundedContextSummarySchema,
  compareRevisionContext,
  ConfirmationBindingSchema,
  MCP_COMPATIBILITY_MATRIX,
  MinimumEvidenceGraphSchema,
  negotiateP0Session,
  PINNED_SDK_LATEST_REVISION,
  PRIMARY_MCP_REVISION,
  ProtocolContractSchema,
  VemErrorSchema,
} from "./index.js";
import { assertPrivacySafe } from "./privacy.js";

const hash = "a".repeat(64);
const revision = {
  projectInstanceId: "project-1",
  coordinatorSequence: 7,
  buildRevision: "build-7",
  sourceRegistryRevision: "registry-7",
  documentId: "document-1",
  documentGeneration: "generation-1",
};
const evidenceEdge = {
  from: "runtime", to: "registry", kind: "page-claim" as const, observedBy: "page-runtime" as const,
  observedAt: "2026-07-29T11:55:00+08:00", documentId: revision.documentId, revision: revision.documentGeneration,
  integrity: "claimed" as const, freshness: "current" as const, corroboration: [], conflicts: [], limitations: ["page-untrusted"],
};
const evidence = {
  nodes: [
    { id: "runtime", kind: "runtime-target" as const, summary: "button" },
    { id: "registry", kind: "registry-membership" as const, summary: "opaque anchor membership" },
  ],
  edges: [evidenceEdge],
  confidenceBand: "medium" as const,
  conflicts: [],
  limitations: ["DOM-to-source is not cryptographic"],
};
const summary = { origin: "http://localhost:5173", redactedPath: "/users/:id", targetSummary: "button", evidenceSummary: ["registry membership"], limitations: [] };
const confirmationBase = {
  confirmationId: "abcdefghijklmnopqrstuv",
  protocolVersion: "2025-06-18",
  hashNamespace: "vem-confirmation-v1-sha256",
  projectInstanceId: revision.projectInstanceId,
  mcpClientSessionId: "mcp-session-1",
  mcpConnectionEpoch: "mcp-epoch-1",
  claimId: "claim-1",
  selectionId: "selection-1",
  selectionSnapshotHash: hash,
  documentId: revision.documentId,
  documentGeneration: revision.documentGeneration,
  allowedActions: ["prepare-source-edit"] as const,
  promptBindingHash: hash,
  integrity: "codex-reported-user-confirmation",
  reportedBy: "codex",
  issuedAt: "2026-07-29T12:00:00+08:00",
  expiresAt: "2026-07-29T12:05:00+08:00",
  maxConsumptions: 1,
  state: "confirmed",
};
const directSourceBinding = {
  resolutionKind: "direct",
  sourceAnchorId: "anchor-1",
  sourceRegistryRevision: revision.sourceRegistryRevision,
  normalizedRelativeFileIdentity: "opaque-file-1",
  directEvidenceHash: hash,
};
const degradedSourceBinding = {
  resolutionKind: "degraded-candidate",
  sourceRegistryRevision: revision.sourceRegistryRevision,
  normalizedRelativeFileIdentity: "opaque-file-1",
  candidateSetHash: hash,
  chosenCandidateRank: 0,
};

describe("MCP compatibility decision", () => {
  test("pins observed Codex primary and SDK-supported compat revisions", () => {
    expect(PRIMARY_MCP_REVISION).toBe("2025-06-18");
    expect(PINNED_SDK_LATEST_REVISION).toBe("2025-11-25");
    expect(MCP_COMPATIBILITY_MATRIX.map((entry) => entry.revision)).toEqual(["2025-03-26", "2025-06-18", "2025-11-25"]);
  });

  test("keeps the checked-in compatibility matrix aligned with code", () => {
    const matrix = JSON.parse(readFileSync(new URL("../compatibility-matrix.json", import.meta.url), "utf8"));
    expect(matrix.primaryRevision).toBe(PRIMARY_MCP_REVISION);
    expect(matrix.compatibleRevisions).toEqual(["2025-03-26", "2025-11-25"]);
    expect(matrix.sdk).toMatchObject({ package: "@modelcontextprotocol/sdk", version: "1.30.0", latestSupportedRevision: PINNED_SDK_LATEST_REVISION });
    expect(matrix.client).toMatchObject({ name: "codex-mcp-client", version: "0.144.5", requestedRevision: PRIMARY_MCP_REVISION, taskCapabilityAdvertised: false });
    expect(matrix.p0TaskMode).toBe("none");
  });

  test("keeps the P0 core path task-free even if a client advertises tasks", () => {
    expect(negotiateP0Session("2025-06-18", ["elicitation"])).toMatchObject({ taskMode: "none", ignoredTaskAdvertisement: false });
    expect(negotiateP0Session("2025-11-25", ["io.modelcontextprotocol/tasks"])).toMatchObject({ taskMode: "none", ignoredTaskAdvertisement: true });
    expect(() => negotiateP0Session("latest", [])).toThrow("UNSUPPORTED_MCP_REVISION");
  });
});

describe("revision identity", () => {
  test("orders only within one project instance", () => {
    expect(compareRevisionContext(revision, { ...revision, coordinatorSequence: 8 })).toBe("before");
    expect(compareRevisionContext(revision, revision)).toBe("equal");
    expect(compareRevisionContext(revision, { ...revision, projectInstanceId: "restarted" })).toBe("different-project-instance");
  });
});

describe("confirmation, evidence and privacy", () => {
  test("binds direct and degraded sources to the trusted session with a hard TTL", () => {
    expect(ConfirmationBindingSchema.safeParse({ ...confirmationBase, sourceBinding: directSourceBinding }).success).toBe(true);
    expect(ConfirmationBindingSchema.safeParse({ ...confirmationBase, sourceBinding: { ...directSourceBinding, candidateSetHash: hash } }).success).toBe(false);
    expect(ConfirmationBindingSchema.safeParse({ ...confirmationBase, sourceBinding: degradedSourceBinding }).success).toBe(true);
    expect(ConfirmationBindingSchema.safeParse({ ...confirmationBase, sourceBinding: { ...degradedSourceBinding, directEvidenceHash: hash } }).success).toBe(false);
    expect(ConfirmationBindingSchema.safeParse({ ...confirmationBase, sourceBinding: directSourceBinding, expiresAt: "2026-07-29T12:15:01+08:00" }).success).toBe(false);
    expect(ConfirmationBindingSchema.safeParse({ ...confirmationBase, sourceBinding: directSourceBinding, integrity: "extension-ui-confirmed" }).success).toBe(false);
  });

  test("rejects trust laundering, dangling edges and high confidence conflicts", () => {
    expect(MinimumEvidenceGraphSchema.safeParse(evidence).success).toBe(true);
    const laundered = { ...evidence, edges: [{ ...evidenceEdge, integrity: "registry-matched" as const }] };
    expect(MinimumEvidenceGraphSchema.safeParse(laundered).success).toBe(false);
    expect(MinimumEvidenceGraphSchema.safeParse({ ...evidence, confidenceBand: "high", conflicts: ["source mismatch"] }).success).toBe(false);
    expect(MinimumEvidenceGraphSchema.safeParse({ ...evidence, edges: [{ ...evidenceEdge, to: "missing" }] }).success).toBe(false);
  });

  test("bounds summaries and rejects raw URL detail or secret-shaped payloads", () => {
    expect(BoundedContextSummarySchema.safeParse(summary).success).toBe(true);
    expect(BoundedContextSummarySchema.safeParse({ ...summary, redactedPath: "/users/1?token=x" }).success).toBe(false);
    expect(BoundedContextSummarySchema.safeParse({ ...summary, origin: "http://user:password@localhost:5173" }).success).toBe(false);
    expect(BoundedContextSummarySchema.safeParse({ ...summary, origin: "http://localhost:5173/private?token=x" }).success).toBe(false);
    expect(() => assertPrivacySafe({ formValue: "private" })).toThrow("PRIVACY_FORBIDDEN_KEY");
    expect(() => assertPrivacySafe({ message: "Bearer abc.def.ghi" })).toThrow("PRIVACY_BEARER_VALUE");
  });
});

describe("closed output and errors", () => {
  test("validates bounded VemError and rejects unknown properties", () => {
    expect(VemErrorSchema.safeParse({ code: "STALE_REVISION", message: "Select again", retryable: true, currentRevision: revision }).success).toBe(true);
    expect(VemErrorSchema.safeParse({ code: "STALE_REVISION", message: "Select again", retryable: true, rawPath: "/private" }).success).toBe(false);
    for (const code of ["CAPTURE_EXPIRED", "CAPTURE_TARGET_CHANGED", "CAPTURE_EPOCH_INVALIDATED", "PAIRING_BOOTSTRAP_INVALID"]) {
      expect(VemErrorSchema.safeParse({ code, message: "Bounded recovery required", retryable: false }).success).toBe(true);
    }
  });

  test("keeps generated Draft 2020-12 schema closed and executable", () => {
    const schema = JSON.parse(readFileSync(new URL("../schemas/protocol.schema.json", import.meta.url), "utf8"));
    const ajv = new Ajv2020({ strict: true, formats: { "date-time": true, uri: true } });
    const validate = ajv.compile(schema);
    const confirmation = { ...confirmationBase, sourceBinding: directSourceBinding };
    const value = { protocolVersion: "2025-06-18", revision, summary, evidence, confirmation };
    expect(ProtocolContractSchema.safeParse(value).success).toBe(true);
    expect(validate(value)).toBe(true);
    expect(validate({ ...value, unknown: true })).toBe(false);
    expect(validate({ ...value, confirmation: { ...confirmation, unknown: true } })).toBe(false);
    expect(validate({ ...value, confirmation: { ...confirmation, sourceBinding: { ...directSourceBinding, candidateSetHash: hash } } })).toBe(false);
    expect(validate({ ...value, summary: { ...summary, redactedPath: "/users/1?token=x" } })).toBe(false);
    expect(validate({ ...value, summary: { ...summary, origin: "http://localhost:5173/private" } })).toBe(false);
    expect(JSON.stringify(schema).length).toBeLessThan(16_384);
  });
});
