export type McpRevision = "2025-03-26" | "2025-06-18" | "2025-11-25";

export interface ProjectRevisionContext {
  projectInstanceId: string;
  coordinatorSequence: number;
  buildRevision: string;
  sourceRegistryRevision: string;
}

export interface RevisionContext extends ProjectRevisionContext {
  documentId: string;
  documentGeneration: string;
}

export type EvidenceIntegrity = "claimed" | "directly-observed" | "registry-matched";
export type EvidenceFreshness = "current" | "stale" | "unknown";
export type EvidenceObserver = "page-runtime" | "content-script" | "service-worker" | "coordinator" | "source-registry" | "codex";

export interface EvidenceNode {
  id: string;
  kind: "runtime-target" | "source-anchor" | "registry-membership" | "source-text" | "candidate";
  summary: string;
}

export interface EvidenceEdge {
  from: string;
  to: string;
  kind: "page-claim" | "dom-observation" | "registry-membership" | "source-corroboration" | "candidate-link";
  observedBy: EvidenceObserver;
  observedAt: string;
  documentId?: string;
  revision?: string;
  integrity: EvidenceIntegrity;
  freshness: EvidenceFreshness;
  corroboration: string[];
  conflicts: string[];
  limitations: string[];
}

export interface MinimumEvidenceGraph {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  confidenceBand: "high" | "medium" | "low" | "unresolved";
  conflicts: string[];
  limitations: string[];
}

export type ConfirmedSourceBinding =
  | {
      resolutionKind: "direct";
      sourceAnchorId: string;
      sourceRegistryRevision: string;
      normalizedRelativeFileIdentity: string;
      directEvidenceHash: string;
    }
  | {
      resolutionKind: "degraded-candidate";
      sourceAnchorId?: string;
      sourceRegistryRevision: string;
      normalizedRelativeFileIdentity: string;
      candidateSetHash: string;
      chosenCandidateRank: number;
    };

export type ConfirmationBindingState =
  | "pending-display"
  | "confirmed"
  | "reserved"
  | "consumed"
  | "expired"
  | "invalidated"
  | "cancelled";

export interface ConfirmationBinding {
  confirmationId: string;
  protocolVersion: McpRevision;
  hashNamespace: "vem-confirmation-v1-sha256";
  projectInstanceId: string;
  mcpClientSessionId: string;
  mcpConnectionEpoch: string;
  claimId: string;
  selectionId: string;
  selectionSnapshotHash: string;
  documentId: string;
  documentGeneration: string;
  sourceBinding: ConfirmedSourceBinding;
  allowedActions: ["prepare-source-edit"];
  allowedVerificationSpecHash?: string;
  promptBindingHash: string;
  integrity: "codex-reported-user-confirmation" | "extension-ui-confirmed";
  reportedBy: "codex" | "extension-service-worker";
  issuedAt: string;
  expiresAt: string;
  maxConsumptions: 1;
  state: ConfirmationBindingState;
}

export interface BoundedContextSummary {
  origin: string;
  redactedPath: string;
  targetSummary: string;
  evidenceSummary: string[];
  limitations: string[];
}

export type VemErrorCode =
  | "NO_ACTIVE_PROJECT" | "NO_BROWSER_SESSION" | "AMBIGUOUS_SESSION"
  | "STALE_DOCUMENT" | "STALE_REVISION" | "SELECTION_NOT_FOUND"
  | "SELECTION_CLAIM_CONFLICT" | "SELECTION_CLAIM_EXPIRED"
  | "CONFIRMATION_TARGET_CHANGED" | "CONFIRMATION_SOURCE_CHANGED"
  | "CONFIRMATION_ACTION_NOT_ALLOWED" | "CONFIRMATION_EXPIRED"
  | "CONFIRMATION_ALREADY_USED" | "CONFIRMATION_INVALIDATED"
  | "CONFIRMATION_INTEGRITY_INSUFFICIENT" | "SELECTED_NODE_DETACHED"
  | "SOURCE_UNRESOLVED" | "CAPABILITY_UNAVAILABLE" | "REQUEST_CANCELLED"
  | "CAPTURE_EXPIRED" | "CAPTURE_TARGET_CHANGED" | "CAPTURE_EPOCH_INVALIDATED"
  | "UPDATE_TIMEOUT" | "VERIFICATION_NOT_PREPARED"
  | "VERIFICATION_BARRIER_EXPIRED" | "AMBIGUOUS_UPDATE_TRANSACTION"
  | "UPDATE_SCOPE_UNRESOLVED" | "QUOTA_EXCEEDED" | "BACKPRESSURE_BUSY"
  | "AUTH_FAILED" | "PAIRING_BOOTSTRAP_INVALID" | "ORIGIN_REJECTED";

export interface VemError {
  code: VemErrorCode;
  message: string;
  retryable: boolean;
  suggestedAction?: string;
  currentDocumentId?: string;
  currentRevision?: ProjectRevisionContext | RevisionContext;
  limitations?: string[];
}
