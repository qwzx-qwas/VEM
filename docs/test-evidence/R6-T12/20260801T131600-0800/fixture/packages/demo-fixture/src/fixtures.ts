export const failureChecks = [
  { id: "fallback", label: "Network fallback", outcome: "required" },
  { id: "terminal", label: "Non-timeout turn.failed", outcome: "required" },
  { id: "sealing", label: "Boundary sealing", outcome: "required" },
] as const;

export const failureState = {
  selectedClass: "sealed network fallback plus non-timeout terminal",
  timeoutSeparation: "provider timeout unchanged",
} as const;
