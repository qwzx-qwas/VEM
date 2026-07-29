import type {
  InjectedSelectionSummary,
  InjectedSelectorCapabilityReport,
  StrictPreparedEditDecision,
} from "./types.js";

export const INJECTED_SELECTOR_CAPABILITIES: InjectedSelectorCapabilityReport = Object.freeze({
  provider: "injected-page",
  selection: true,
  overlay: true,
  selectionConfirmationIntegrity: "page-untrusted",
  requiresExternalConfirmation: true,
  trustedUserGesture: false,
  extensionIdentity: false,
  sourceResolution: false,
  screenshot: false,
  preparedEdit: false,
  persistentStorage: false,
  limitations: Object.freeze([
    "PAGE_UNTRUSTED",
    "EXTERNAL_CONFIRMATION_REQUIRED",
    "NO_EXTENSION_IDENTITY",
    "NO_SOURCE_RESOLUTION",
    "NO_SCREENSHOT",
    "EPHEMERAL_MEMORY_ONLY",
  ]),
});

export function evaluateStrictPreparedEdit(
  selection: InjectedSelectionSummary,
): StrictPreparedEditDecision {
  void selection;
  return {
    allowed: false,
    code: "EXTERNAL_CONFIRMATION_REQUIRED",
    message: "Display the immutable selection and source summary in a trusted Codex session, then obtain a ConfirmationBinding.",
    requiresExternalConfirmation: true,
  };
}
