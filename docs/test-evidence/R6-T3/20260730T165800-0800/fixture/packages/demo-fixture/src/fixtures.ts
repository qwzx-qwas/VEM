export const invocationChecks = [
  { id: "environment", label: "Outer environment", outcome: "fixed PATH only" },
  { id: "secrets", label: "Host secrets", outcome: "not inherited" },
  { id: "terminalizer", label: "Terminalizer predicate", outcome: "accepted before spawn" },
] as const;

export const invocationState = {
  predicate: "isR5ProcessInvocation",
  preflight: "passed without model execution",
} as const;
