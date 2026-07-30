export const terminalChecks = [
  { id: "deadline", label: "Spawn deadline", outcome: "monotonic and bounded" },
  { id: "streams", label: "Stream drain", outcome: "sealed before return" },
  { id: "terminal", label: "Provider terminal", outcome: "never synthesized" },
] as const;

export const terminalState = {
  signalLadder: "SIGTERM then SIGKILL",
  treeState: "verified empty before next arm",
} as const;
