export const isolationChecks = [
  { id: "capsule", label: "Capsule root", outcome: "unique per attempt" },
  { id: "budget", label: "Process budget", outcome: "charged on observed start" },
  { id: "history", label: "Prior evidence", outcome: "immutable" },
] as const;

export const isolationState = {
  batchSealing: "exception-safe terminal manifest",
  finalOutput: "runner-owned and unique per attempt",
} as const;
