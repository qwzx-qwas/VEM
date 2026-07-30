export const containmentChecks = [
  { id: "mention", label: "Discovery mention", outcome: "warning recorded" },
  { id: "observation", label: "Observed access", outcome: "fail closed" },
  { id: "exception", label: "Evaluator exception", outcome: "terminal sealed" },
] as const;

export const containmentState = {
  profileStatus: "workspace read only; auth denied",
  sealCode: "R3_EXCEPTION_EVIDENCE_SEALED",
} as const;
