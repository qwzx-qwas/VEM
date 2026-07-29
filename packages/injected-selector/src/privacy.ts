import type { RevisionContext } from "@vem/protocol";
import type {
  AncestorPreview,
  InjectedPageSummary,
  InjectedSelectionSummary,
  SafeSelectorError,
  SelectionBox,
  SelectionInteractionKind,
  SelectionRedactionReason,
  SelectionResult,
  TargetRejectionCode,
} from "./types.js";

const NON_RENDERABLE_TAGS = new Set(["script", "style", "meta", "link", "template"]);
const FORM_TAGS = new Set(["input", "textarea", "select", "option"]);
// eslint-disable-next-line no-control-regex -- this sanitizer intentionally removes control and bidi characters.
const CONTROL_OR_BIDI = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]", "gu");
const SENSITIVE_TEXT = /(?:\b(?:authorization|bearer|cookie|password|token|secret)\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/iu;
const ROUTE_CANDIDATE = /^\/(?:[A-Za-z0-9._~-]+|:[A-Za-z][A-Za-z0-9]*)(?:\/(?:[A-Za-z0-9._~-]+|:[A-Za-z][A-Za-z0-9]*))*\/?$/u;

const SAFE_ERROR_MESSAGES: Record<TargetRejectionCode, string> = {
  OVERLAY_TARGET: "The selector overlay cannot be selected.",
  PRIVATE_TARGET: "This target is inside a private subtree.",
  NON_RENDERABLE_TARGET: "This element type cannot be selected.",
  HIDDEN_TARGET: "This target is not visibly rendered.",
  ZERO_AREA_TARGET: "This target has no selectable area.",
  STALE_DOCUMENT: "The browser document changed; select again.",
  STALE_PROJECT: "The project instance changed; select again.",
  SUMMARY_SIZE_EXCEEDED: "The bounded selection summary is too large.",
};

export function safeSelectorError(code: TargetRejectionCode): SafeSelectorError {
  return {
    code,
    message: SAFE_ERROR_MESSAGES[code],
    retryable: code !== "PRIVATE_TARGET" && code !== "NON_RENDERABLE_TARGET",
  };
}

export function validatePrivateSelectors(document: Document, selectors: readonly string[]): void {
  for (const selector of selectors) {
    if (selector.length < 1 || selector.length > 128) throw new Error("PRIVATE_SELECTOR_INVALID");
    try {
      document.querySelector(selector);
    } catch {
      throw new Error("PRIVATE_SELECTOR_INVALID");
    }
  }
}

export function isPrivateTarget(element: Element, selectors: readonly string[]): boolean {
  if (element.closest("[data-vem-private]")) return true;
  for (const selector of selectors) if (element.closest(selector)) return true;
  return false;
}

function boxFromRect(rect: DOMRect): SelectionBox {
  return {
    x: finite(rect.x),
    y: finite(rect.y),
    width: finite(rect.width),
    height: finite(rect.height),
  };
}

function finite(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function inspectSelectableTarget(
  element: Element,
  window: Window,
  privateSelectors: readonly string[],
): { box: SelectionBox; kind: "element" | "page-root" } | SafeSelectorError {
  if (element.closest("[data-vem-overlay-root]")) return safeSelectorError("OVERLAY_TARGET");
  if (isPrivateTarget(element, privateSelectors)) return safeSelectorError("PRIVATE_TARGET");
  const tagName = element.tagName.toLowerCase();
  if (NON_RENDERABLE_TAGS.has(tagName)) return safeSelectorError("NON_RENDERABLE_TARGET");
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
    return safeSelectorError("HIDDEN_TARGET");
  }
  const box = boxFromRect(element.getBoundingClientRect());
  if (box.width <= 0 || box.height <= 0) return safeSelectorError("ZERO_AREA_TARGET");
  return { box, kind: tagName === "body" || tagName === "html" ? "page-root" : "element" };
}

export function projectPageSummary(location: Location, routeCandidate?: string): InjectedPageSummary {
  const url = new URL(location.href);
  const redactedPath = routeCandidate && ROUTE_CANDIDATE.test(routeCandidate)
    ? routeCandidate
    : redactEveryPathSegment(url.pathname);
  return {
    origin: url.origin,
    redactedPath,
  };
}

function redactEveryPathSegment(pathname: string): string {
  const segmentCount = pathname.split("/").filter(Boolean).length;
  return segmentCount === 0 ? "/" : `/${Array.from({ length: segmentCount }, () => ":redacted").join("/")}`;
}

function roleOf(element: Element): string | undefined {
  const role = element.getAttribute("role")?.trim().toLowerCase();
  return role && /^[a-z][a-z0-9-]{0,63}$/u.test(role) ? role : undefined;
}

function projectText(
  element: Element,
  maxTextChars: number,
): { textPreview?: string; reasons: SelectionRedactionReason[] } {
  const tagName = element.tagName.toLowerCase();
  if (FORM_TAGS.has(tagName)) return { reasons: ["form-current-value"] };
  const candidates = [
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.textContent,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (candidates.length === 0) return { reasons: ["text-unavailable"] };
  const raw = candidates.join(" ");
  if (SENSITIVE_TEXT.test(raw)) return { reasons: ["sensitive-text"] };
  const reasons: SelectionRedactionReason[] = [];
  let normalized = raw.normalize("NFC");
  if (CONTROL_OR_BIDI.test(normalized)) {
    normalized = normalized.replace(CONTROL_OR_BIDI, " ");
    reasons.push("control-characters-removed");
  }
  normalized = normalized.replace(/\s+/gu, " ").trim();
  const characters = Array.from(normalized);
  if (characters.length > maxTextChars) {
    normalized = characters.slice(0, maxTextChars).join("");
    reasons.push("text-truncated");
  }
  if (!normalized) return { reasons: [...reasons, "text-unavailable"] };
  return { textPreview: normalized, reasons };
}

function ancestorPreview(element: Element, maximum: number): AncestorPreview[] {
  const result: AncestorPreview[] = [];
  let current = element.parentElement;
  while (current && result.length < maximum) {
    const role = roleOf(current);
    result.push({
      tagName: current.tagName.toLowerCase(),
      ...(role ? { role } : {}),
    });
    current = current.parentElement;
  }
  return result;
}

export interface BuildSelectionInput {
  element: Element;
  window: Window;
  revision: RevisionContext;
  routeCandidate?: string;
  privateSelectors: readonly string[];
  maxTextChars: number;
  maxSummaryBytes: number;
  selectionId: string;
  observedAt: string;
  interactionKind: SelectionInteractionKind;
  reportedEventIsTrusted: boolean;
}

export function buildSelectionSummary(input: BuildSelectionInput): SelectionResult {
  const inspected = inspectSelectableTarget(input.element, input.window, input.privateSelectors);
  if ("code" in inspected) return { ok: false, error: inspected };
  const role = roleOf(input.element);
  const text = projectText(input.element, input.maxTextChars);
  const summary: InjectedSelectionSummary = {
    schemaVersion: "P0-T5-injected-selection-v1",
    protocolVersion: "2025-06-18",
    selectionId: input.selectionId,
    kind: inspected.kind,
    tagName: input.element.tagName.toLowerCase(),
    ...(role ? { role } : {}),
    ...(text.textPreview ? { textPreview: text.textPreview } : {}),
    textRedactionReasons: text.reasons,
    contentTrust: "untrusted-page-data",
    box: inspected.box,
    ancestorPreview: ancestorPreview(input.element, 4),
    page: projectPageSummary(input.window.location, input.routeCandidate),
    provenance: {
      provider: "injected-page",
      observedBy: "page-runtime",
      interactionKind: input.interactionKind,
      confirmationIntegrity: "page-untrusted",
      requiresExternalConfirmation: true,
      reportedEventIsTrusted: input.reportedEventIsTrusted,
    },
    revision: { ...input.revision },
    observedAt: input.observedAt,
    limitations: [
      "PAGE_UNTRUSTED",
      "EXTERNAL_CONFIRMATION_REQUIRED",
      "NO_SOURCE_RESOLUTION",
    ],
  };
  if (new TextEncoder().encode(JSON.stringify(summary)).byteLength > input.maxSummaryBytes) {
    return { ok: false, error: safeSelectorError("SUMMARY_SIZE_EXCEEDED") };
  }
  return { ok: true, summary: deepFreezeSummary(summary) };
}

function deepFreezeSummary(summary: InjectedSelectionSummary): InjectedSelectionSummary {
  Object.freeze(summary.box);
  for (const ancestor of summary.ancestorPreview) Object.freeze(ancestor);
  Object.freeze(summary.ancestorPreview);
  Object.freeze(summary.page);
  Object.freeze(summary.provenance);
  Object.freeze(summary.revision);
  Object.freeze(summary.textRedactionReasons);
  Object.freeze(summary.limitations);
  return Object.freeze(summary);
}
