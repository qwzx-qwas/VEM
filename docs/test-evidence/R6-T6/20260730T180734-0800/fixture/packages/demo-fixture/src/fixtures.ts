export const deadlineChecks = [
  { id: "horizon", label: "Provider observation horizon", outcome: "480000 ms" },
  { id: "margin", label: "Terminal observation margin", outcome: "120000 ms" },
  { id: "retry", label: "Runner termination retry", outcome: "disabled" },
] as const;

export const deadlineState = {
  provenance: "version-bound-codex-instrumentation",
  deadline: "600000 ms from process spawn",
} as const;
