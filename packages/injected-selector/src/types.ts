import type { RevisionContext } from "@vem/protocol";

export type SelectionInteractionKind = "click" | "keyboard" | "programmatic" | "unknown";
export type SelectionKind = "element" | "page-root";
export type ContentTrust = "untrusted-page-data";

export type SelectionRedactionReason =
  | "form-current-value"
  | "private-subtree"
  | "sensitive-text"
  | "text-truncated"
  | "control-characters-removed"
  | "text-unavailable";

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AncestorPreview {
  tagName: string;
  role?: string;
}

export interface InjectedSelectionProvenance {
  provider: "injected-page";
  observedBy: "page-runtime";
  interactionKind: SelectionInteractionKind;
  confirmationIntegrity: "page-untrusted";
  requiresExternalConfirmation: true;
  reportedEventIsTrusted: boolean;
}

export interface InjectedPageSummary {
  origin: string;
  redactedPath: string;
}

export interface InjectedSelectionSummary {
  schemaVersion: "P0-T5-injected-selection-v1";
  protocolVersion: "2025-06-18";
  selectionId: string;
  kind: SelectionKind;
  tagName: string;
  role?: string;
  textPreview?: string;
  textRedactionReasons: SelectionRedactionReason[];
  contentTrust: ContentTrust;
  box: SelectionBox;
  ancestorPreview: AncestorPreview[];
  page: InjectedPageSummary;
  provenance: InjectedSelectionProvenance;
  revision: RevisionContext;
  observedAt: string;
  limitations: [
    "PAGE_UNTRUSTED",
    "EXTERNAL_CONFIRMATION_REQUIRED",
    "NO_SOURCE_RESOLUTION",
  ];
}

export interface InjectedSelectorCapabilityReport {
  provider: "injected-page";
  selection: true;
  overlay: true;
  selectionConfirmationIntegrity: "page-untrusted";
  requiresExternalConfirmation: true;
  trustedUserGesture: false;
  extensionIdentity: false;
  sourceResolution: false;
  screenshot: false;
  preparedEdit: false;
  persistentStorage: false;
  limitations: readonly string[];
}

export type TargetRejectionCode =
  | "OVERLAY_TARGET"
  | "PRIVATE_TARGET"
  | "NON_RENDERABLE_TARGET"
  | "HIDDEN_TARGET"
  | "ZERO_AREA_TARGET"
  | "STALE_DOCUMENT"
  | "STALE_PROJECT"
  | "SUMMARY_SIZE_EXCEEDED";

export interface SafeSelectorError {
  code: TargetRejectionCode;
  message: string;
  retryable: boolean;
}

export type SelectionResult =
  | { ok: true; summary: InjectedSelectionSummary }
  | { ok: false; error: SafeSelectorError };

export interface InjectedSelectorConfig {
  document: Document;
  window: Window;
  revision: RevisionContext;
  routeCandidate?: string;
  privateSelectors?: readonly string[];
  maxTextChars?: number;
  maxSummaryBytes?: number;
  now?: () => string;
  idFactory?: () => string;
  onSelection?: (summary: InjectedSelectionSummary) => void;
}

export interface StrictPreparedEditDecision {
  allowed: false;
  code: "EXTERNAL_CONFIRMATION_REQUIRED";
  message: string;
  requiresExternalConfirmation: true;
}

export interface InjectedSelectorController {
  start(): void;
  stop(): void;
  preview(element: Element): SafeSelectorError | null;
  select(element: Element, interactionKind?: SelectionInteractionKind, reportedEventIsTrusted?: boolean): SelectionResult;
  getSelection(selectionId: string): InjectedSelectionSummary | undefined;
  get activeSelectionId(): string | undefined;
  get selectionCount(): number;
  clear(): void;
  resetDocument(revision: RevisionContext): void;
  resetProject(revision: RevisionContext): void;
}
