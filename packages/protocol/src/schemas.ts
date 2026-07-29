import { z } from "zod";

const Id = z.string().min(1).max(128);
const ConfirmationId = z.string().regex(/^[A-Za-z0-9_-]{22,128}$/u, "confirmation ID must encode at least 128 bits of unpredictable entropy");
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Origin = z.string().url().max(256).regex(/^https?:\/\/(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::[0-9]{1,5})?$/u);
const RedactedPath = z.string().min(1).max(256).regex(/^\/[^?#]*$/u);
const Short = z.string().min(1).max(512);
const Strings = z.array(Short).max(16);

export const ProjectRevisionContextSchema = z.strictObject({
  projectInstanceId: Id,
  coordinatorSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  buildRevision: Id,
  sourceRegistryRevision: Id,
});

export const RevisionContextSchema = ProjectRevisionContextSchema.extend({
  documentId: Id,
  documentGeneration: Id,
});

export const EvidenceNodeSchema = z.strictObject({
  id: Id,
  kind: z.enum(["runtime-target", "source-anchor", "registry-membership", "source-text", "candidate"]),
  summary: Short,
});

export const EvidenceEdgeSchema = z.strictObject({
  from: Id,
  to: Id,
  kind: z.enum(["page-claim", "dom-observation", "registry-membership", "source-corroboration", "candidate-link"]),
  observedBy: z.enum(["page-runtime", "content-script", "service-worker", "coordinator", "source-registry", "codex"]),
  observedAt: z.iso.datetime({ offset: true }),
  documentId: Id.optional(),
  revision: Id.optional(),
  integrity: z.enum(["claimed", "directly-observed", "registry-matched"]),
  freshness: z.enum(["current", "stale", "unknown"]),
  corroboration: Strings,
  conflicts: Strings,
  limitations: Strings,
}).superRefine((edge, context) => {
  if (edge.integrity === "registry-matched" && edge.kind !== "registry-membership" && edge.kind !== "source-corroboration") {
    context.addIssue({ code: "custom", message: "registry membership cannot launder a page/DOM binding" });
  }
});

export const MinimumEvidenceGraphSchema = z.strictObject({
  nodes: z.array(EvidenceNodeSchema).min(1).max(32),
  edges: z.array(EvidenceEdgeSchema).max(64),
  confidenceBand: z.enum(["high", "medium", "low", "unresolved"]),
  conflicts: Strings,
  limitations: Strings,
}).superRefine((graph, context) => {
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length) context.addIssue({ code: "custom", message: "evidence node IDs must be unique" });
  for (const edge of graph.edges) if (!ids.has(edge.from) || !ids.has(edge.to)) context.addIssue({ code: "custom", message: "evidence edge endpoint is missing" });
  if (graph.conflicts.length > 0 && graph.confidenceBand === "high") context.addIssue({ code: "custom", message: "conflicts take priority over high confidence" });
});

const DirectSourceBindingSchema = z.strictObject({
  resolutionKind: z.literal("direct"),
  sourceAnchorId: Id,
  sourceRegistryRevision: Id,
  normalizedRelativeFileIdentity: Id,
  directEvidenceHash: Hash,
});

const DegradedSourceBindingSchema = z.strictObject({
  resolutionKind: z.literal("degraded-candidate"),
  sourceAnchorId: Id.optional(),
  sourceRegistryRevision: Id,
  normalizedRelativeFileIdentity: Id,
  candidateSetHash: Hash,
  chosenCandidateRank: z.number().int().nonnegative().max(31),
});

export const ConfirmationBindingSchema = z.strictObject({
  confirmationId: ConfirmationId,
  protocolVersion: z.enum(["2025-03-26", "2025-06-18", "2025-11-25"]),
  hashNamespace: z.literal("vem-confirmation-v1-sha256"),
  projectInstanceId: Id,
  mcpClientSessionId: Id,
  mcpConnectionEpoch: Id,
  claimId: Id,
  selectionId: Id,
  selectionSnapshotHash: Hash,
  documentId: Id,
  documentGeneration: Id,
  sourceBinding: z.discriminatedUnion("resolutionKind", [DirectSourceBindingSchema, DegradedSourceBindingSchema]),
  allowedActions: z.array(z.literal("prepare-source-edit")).length(1),
  allowedVerificationSpecHash: Hash.optional(),
  promptBindingHash: Hash,
  integrity: z.enum(["codex-reported-user-confirmation", "extension-ui-confirmed"]),
  reportedBy: z.enum(["codex", "extension-service-worker"]),
  issuedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  maxConsumptions: z.literal(1),
  state: z.enum(["pending-display", "confirmed", "reserved", "consumed", "expired", "invalidated", "cancelled"]),
}).superRefine((binding, context) => {
  const expectedReporter = binding.integrity === "codex-reported-user-confirmation" ? "codex" : "extension-service-worker";
  if (binding.reportedBy !== expectedReporter) context.addIssue({ code: "custom", message: "confirmation integrity and reporter must identify the same trusted channel" });
  const ttlMilliseconds = Date.parse(binding.expiresAt) - Date.parse(binding.issuedAt);
  if (ttlMilliseconds <= 0) context.addIssue({ code: "custom", message: "confirmation must expire after it is issued" });
  if (ttlMilliseconds > 15 * 60 * 1000) context.addIssue({ code: "custom", message: "confirmation TTL exceeds the 15 minute hard limit" });
});

export const BoundedContextSummarySchema = z.strictObject({
  origin: Origin,
  redactedPath: RedactedPath,
  targetSummary: Short,
  evidenceSummary: z.array(Short).max(8),
  limitations: Strings,
});

export const VemErrorCodeSchema = z.enum([
  "NO_ACTIVE_PROJECT", "NO_BROWSER_SESSION", "AMBIGUOUS_SESSION", "STALE_DOCUMENT", "STALE_REVISION",
  "SELECTION_NOT_FOUND", "SELECTION_CLAIM_CONFLICT", "SELECTION_CLAIM_EXPIRED", "CONFIRMATION_TARGET_CHANGED",
  "CONFIRMATION_SOURCE_CHANGED", "CONFIRMATION_ACTION_NOT_ALLOWED", "CONFIRMATION_EXPIRED", "CONFIRMATION_ALREADY_USED",
  "CONFIRMATION_INVALIDATED", "CONFIRMATION_INTEGRITY_INSUFFICIENT", "SELECTED_NODE_DETACHED", "SOURCE_UNRESOLVED",
  "CAPABILITY_UNAVAILABLE", "CAPTURE_EXPIRED", "CAPTURE_TARGET_CHANGED", "CAPTURE_EPOCH_INVALIDATED",
  "REQUEST_CANCELLED", "UPDATE_TIMEOUT", "VERIFICATION_NOT_PREPARED",
  "VERIFICATION_BARRIER_EXPIRED", "AMBIGUOUS_UPDATE_TRANSACTION", "UPDATE_SCOPE_UNRESOLVED", "QUOTA_EXCEEDED",
  "BACKPRESSURE_BUSY", "AUTH_FAILED", "PAIRING_BOOTSTRAP_INVALID", "ORIGIN_REJECTED",
]);

export const VemErrorSchema = z.strictObject({
  code: VemErrorCodeSchema,
  message: Short,
  retryable: z.boolean(),
  suggestedAction: Short.optional(),
  currentDocumentId: Id.optional(),
  currentRevision: z.union([ProjectRevisionContextSchema, RevisionContextSchema]).optional(),
  limitations: Strings.optional(),
});

export const ProtocolContractSchema = z.strictObject({
  protocolVersion: z.enum(["2025-03-26", "2025-06-18", "2025-11-25"]),
  revision: RevisionContextSchema,
  summary: BoundedContextSummarySchema,
  evidence: MinimumEvidenceGraphSchema,
  confirmation: ConfirmationBindingSchema.optional(),
  error: VemErrorSchema.optional(),
}).refine((value) => !(value.confirmation && value.error), "success confirmation and error are mutually exclusive");

export const protocolJsonSchema = z.toJSONSchema(ProtocolContractSchema, { target: "draft-2020-12", reused: "ref" });
