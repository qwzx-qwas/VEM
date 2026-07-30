export const transportChecks = [
  { id: "local", label: "Local capability", outcome: "passed without model call" },
  { id: "network", label: "Provider reachability", outcome: "not claimed" },
  { id: "evidence", label: "Failed attempt evidence", outcome: "retained" },
] as const;

export const transportState = {
  retryBudget: "one retry per arm; twenty total attempts",
  timeoutCode: "R4_TIMEOUT_BEFORE_RESPONSE",
} as const;
