import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertR6CharterModel,
  buildR6CharterProof,
} from "./prove-r6-t1.mjs";
import { parseYaml, validateRepository } from "./validator-core.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("R6-T1 independent pre-spawn invocation remediation charter", () => {
  test("preserves R5 stop, R4 blocked/pending and all prior stops", () => {
    expect(buildR6CharterProof(REPO_ROOT)).toMatchObject({
      taskId: "R6-T1",
      outcome: "passed",
      preservedR5TerminalState: {
        phase: "R5",
        status: "failed",
        verdict: "stop",
      },
      preservedR4BlockedState: {
        phase: "R4",
        status: "blocked",
        task: "R4-T4",
        taskStatus: "blocked",
        decision: "pending",
      },
      preservedPriorTerminalStates: [
        { phase: "P0", status: "failed", verdict: "stop" },
        { phase: "R0", status: "failed", verdict: "stop" },
        { phase: "R1", status: "failed", verdict: "stop" },
        { phase: "R2", status: "failed", verdict: "stop" },
        { phase: "R3", status: "failed", verdict: "stop" },
      ],
      r6Boundary: {
        phase: "R6",
        status: "failed",
        taskStatus: "done",
        doesNotSupersede: "R5-RECOVERY",
        alsoDoesNotSupersede: [
          "R4-RECOVERY",
          "R3-RECOVERY",
          "R2-RECOVERY",
          "R1-RECOVERY",
          "R0-RECOVERY",
          "P0-VALUE",
        ],
        productUnlockCount: 0,
        charterExternalExecutionAuthorized: false,
        currentDecision: "stop",
      },
      validation: { phases: 16, tasks: 177, contracts: 32 },
    });
  });

  test("fails if R5 stop is changed", () => {
    const { roadmap, decisionInbox } = model();
    const r5 = roadmap.phases.find((phase) => phase.id === "R5");
    r5.tasks.find((task) => task.id === "R5-T4").decision = "continue";
    expect(() => assertR6CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R6_T1_CHARTER_PROOF_FAILED");
  });

  test("fails if R4 blocked/pending is rewritten", () => {
    const { roadmap, decisionInbox } = model();
    const r4 = roadmap.phases.find((phase) => phase.id === "R4");
    r4.status = "failed";
    const attempt = r4.tasks.find((task) => task.id === "R4-T4");
    attempt.status = "done";
    attempt.decision = "stop";
    expect(() => assertR6CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R6_T1_CHARTER_PROOF_FAILED");
  });

  test("fails on decision-chain or dependency leakage", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.decisions["R6-RECOVERY"].also_does_not_supersede = [
      "R3-RECOVERY",
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
      "P0-VALUE",
    ];
    expect(() => assertR6CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R6_T1_CHARTER_PROOF_FAILED");
    roadmap.decisions["R6-RECOVERY"].also_does_not_supersede = [
      "R4-RECOVERY",
      "R3-RECOVERY",
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
      "P0-VALUE",
    ];
    roadmap.phases.find((phase) => phase.id === "P1").depends_on = ["R6"];
    expect(() => assertR6CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R6_T1_CHARTER_PROOF_FAILED");
  });

  test("fails if terminal attempt four is reopened or prior adjusts change", () => {
    const { roadmap, decisionInbox } = model();
    const r6 = roadmap.phases.find((phase) => phase.id === "R6");
    const attemptFour = r6.tasks.find((task) => task.id === "R6-T13");
    attemptFour.status = "todo";
    attemptFour.decision = "pending";
    expect(() => assertR6CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R6_T1_CHARTER_PROOF_FAILED");
    attemptFour.status = "done";
    attemptFour.decision = "stop";
    r6.tasks.find((task) => task.id === "R6-T10").decision = "continue";
    expect(() => assertR6CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R6_T1_CHARTER_PROOF_FAILED");
  });

  test("requires the exact local-only owner authorization", () => {
    const { roadmap, decisionInbox } = model();
    decisionInbox.decisions.find(
      (decision) => decision.id === "OWNER-R6-PRESPAWN-INVOCATION-REMEDIATION",
    ).owner_statement = "changed";
    expect(() => assertR6CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R6_T1_CHARTER_PROOF_FAILED");
  });
});

function model() {
  return {
    roadmap: parseYaml(
      readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"),
      "ROADMAP.yaml",
    ),
    decisionInbox: parseYaml(
      readFileSync(join(REPO_ROOT, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
      "OPEN_DECISIONS.yaml",
    ),
  };
}
