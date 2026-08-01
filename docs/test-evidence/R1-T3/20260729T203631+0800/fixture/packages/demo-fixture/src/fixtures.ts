export const runnerChecks = [
  { id: "raw-streams", label: "Raw streams", outcome: "sealed" },
  { id: "terminal-event", label: "Terminal event", outcome: "sealed" },
  { id: "receipt-ledger", label: "Receipt ledger", outcome: "sealed" },
] as const;

export const runnerState = {
  streamStatus: "stdout and stderr sealed",
  failureCode: "STRUCTURED_RESPONSE_CONFLICT",
} as const;
