export const recoveryCases = [
  { id: "receipt-order", label: "Receipt order", status: "ready" },
  { id: "capsule-boundary", label: "Capsule boundary", status: "ready" },
  { id: "holdout-separation", label: "Holdout separation", status: "ready" },
] as const;

export const recoveryState = {
  syncState: "ledger synchronized",
  ownerPath: "/recovery/:ownerId",
  privateNote: "evaluator-only operator note",
  lastObservation: "bounded diagnostic text",
} as const;
