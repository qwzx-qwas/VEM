export const terminalChecks = [
  { id: "horizon", label: "Explicit terminal horizon", outcome: "891774 ms" },
  { id: "margin", label: "Terminal observation margin", outcome: "308226 ms" },
  { id: "retry", label: "Runner termination retry", outcome: "disabled" },
] as const;

export const terminalState = {
  envelope: "version-bound-codex-instrumentation",
  lowerBound: "600000 ms ordered dual-transport evidence",
} as const;
