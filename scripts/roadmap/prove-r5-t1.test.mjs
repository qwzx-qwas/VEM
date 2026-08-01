import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseYaml, validateRepository } from "./validator-core.mjs";
import {
  assertR5CharterModel,
  buildR5CharterProof,
} from "./prove-r5-t1.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("R5-T1 independent process-tree termination remediation charter", () => {
  test("preserves blocked R4 and all five terminal stops with zero product unlocks", () => {
    expect(buildR5CharterProof(REPO_ROOT)).toMatchObject({
      taskId: "R5-T1",
      outcome: "passed",
      preservedBlockedState: {
        phase: "R4",
        status: "blocked",
        task: "R4-T4",
        taskStatus: "blocked",
        decision: "pending",
      },
      preservedTerminalStates: [
        { phase: "P0", status: "failed", verdict: "stop" },
        { phase: "R0", status: "failed", verdict: "stop" },
        { phase: "R1", status: "failed", verdict: "stop" },
        { phase: "R2", status: "failed", verdict: "stop" },
        { phase: "R3", status: "failed", verdict: "stop" },
      ],
      r5Boundary: {
        phase: "R5",
        status: "failed",
        taskStatus: "done",
        phaseDependencies: [],
        taskDependencies: [],
        doesNotSupersede: "R4-RECOVERY",
        alsoDoesNotSupersede: [
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
      validation: { phases: 17, tasks: 181, contracts: 33 },
    });
  });

  test("fails if blocked R4 is converted into a terminal verdict", () => {
    const { roadmap, decisionInbox } = model();
    const r4 = roadmap.phases.find((phase) => phase.id === "R4");
    r4.status = "failed";
    const verdict = r4.tasks.find((task) => task.id === "R4-T4");
    verdict.status = "done";
    verdict.decision = "stop";
    expect(() => assertR5CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R5_T1_CHARTER_PROOF_FAILED");
  });

  test("fails if any prior terminal chain is removed from non-supersession", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.decisions["R5-RECOVERY"].also_does_not_supersede = [
      "R3-RECOVERY",
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
    ];
    expect(() => assertR5CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R5_T1_CHARTER_PROOF_FAILED");
  });

  test("fails if R5 becomes an existing phase or task dependency", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.phases.find((phase) => phase.id === "P1").depends_on = ["R5"];
    expect(() => assertR5CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R5_T1_CHARTER_PROOF_FAILED");
    roadmap.phases.find((phase) => phase.id === "P1").depends_on = ["P0"];
    roadmap.phases.find((phase) => phase.id === "P1").tasks[0]
      .depends_on = ["R5-T1"];
    expect(() => assertR5CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R5_T1_CHARTER_PROOF_FAILED");
  });

  test("requires the exact owner instruction and local-only scope", () => {
    const { roadmap, decisionInbox } = model();
    decisionInbox.decisions.find(
      (decision) => decision.id === "OWNER-R5-PROCESS-TREE-TERMINATION-REMEDIATION",
    ).owner_statement = "changed";
    expect(() => assertR5CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R5_T1_CHARTER_PROOF_FAILED");
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
