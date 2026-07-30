import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseYaml, validateRepository } from "./validator-core.mjs";
import {
  assertR3CharterModel,
  buildR3CharterProof,
} from "./prove-r3-t1.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("R3-T1 independent capsule-audit containment charter", () => {
  test("preserves all four terminal stop chains with zero product unlocks", () => {
    expect(buildR3CharterProof(REPO_ROOT)).toMatchObject({
      taskId: "R3-T1",
      outcome: "passed",
      preservedTerminalStates: [
        { phase: "P0", status: "failed", verdict: "stop" },
        { phase: "R0", status: "failed", verdict: "stop" },
        { phase: "R1", status: "failed", verdict: "stop" },
        { phase: "R2", status: "failed", verdict: "stop" },
      ],
      r3Boundary: {
        phase: "R3",
        status: "failed",
        taskStatus: "done",
        phaseDependencies: [],
        taskDependencies: [],
        doesNotSupersede: "R2-RECOVERY",
        alsoDoesNotSupersede: ["R1-RECOVERY", "R0-RECOVERY", "P0-VALUE"],
        productUnlockCount: 0,
        externalExecutionAuthorized: false,
      },
      validation: { phases: 16, tasks: 174, contracts: 32 },
    });
  });

  test("fails if any terminal chain is removed from non-supersession", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.decisions["R3-RECOVERY"].also_does_not_supersede = [
      "R1-RECOVERY",
      "R0-RECOVERY",
    ];
    expect(() => assertR3CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R3_T1_CHARTER_PROOF_FAILED");
  });

  test("fails if R3 becomes a phase or task dependency", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.phases.find((phase) => phase.id === "P1").depends_on = ["R3"];
    expect(() => assertR3CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R3_T1_CHARTER_PROOF_FAILED");
    roadmap.phases.find((phase) => phase.id === "P1").depends_on = ["P0"];
    roadmap.phases.find((phase) => phase.id === "P1").tasks[0]
      .depends_on = ["R3-T1"];
    expect(() => assertR3CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R3_T1_CHARTER_PROOF_FAILED");
  });

  test("requires the immutable R3 stop attempt when the phase is failed", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.phases.find((phase) => phase.id === "R3")
      .tasks.find((task) => task.id === "R3-T4").decision = "continue";
    expect(() => assertR3CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R3_T1_CHARTER_PROOF_FAILED");
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
