import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseYaml, validateRepository } from "./validator-core.mjs";
import {
  assertR4CharterModel,
  buildR4CharterProof,
} from "./prove-r4-t1.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("R4-T1 independent external-transport timeout remediation charter", () => {
  test("preserves all five terminal stop chains with zero product unlocks", () => {
    expect(buildR4CharterProof(REPO_ROOT)).toMatchObject({
      taskId: "R4-T1",
      outcome: "passed",
      preservedTerminalStates: [
        { phase: "P0", status: "failed", verdict: "stop" },
        { phase: "R0", status: "failed", verdict: "stop" },
        { phase: "R1", status: "failed", verdict: "stop" },
        { phase: "R2", status: "failed", verdict: "stop" },
        { phase: "R3", status: "failed", verdict: "stop" },
      ],
      r4Boundary: {
        phase: "R4",
        status: "blocked",
        taskStatus: "done",
        phaseDependencies: [],
        taskDependencies: [],
        doesNotSupersede: "R3-RECOVERY",
        alsoDoesNotSupersede: [
          "R2-RECOVERY",
          "R1-RECOVERY",
          "R0-RECOVERY",
          "P0-VALUE",
        ],
        productUnlockCount: 0,
        externalExecutionAuthorized: false,
      },
      validation: { phases: 16, tasks: 168, contracts: 32 },
    });
  });

  test("fails if any terminal chain is removed from non-supersession", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.decisions["R4-RECOVERY"].also_does_not_supersede = [
      "R2-RECOVERY",
      "R1-RECOVERY",
      "R0-RECOVERY",
    ];
    expect(() => assertR4CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R4_T1_CHARTER_PROOF_FAILED");
  });

  test("fails if R4 becomes a phase or task dependency", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.phases.find((phase) => phase.id === "P1").depends_on = ["R4"];
    expect(() => assertR4CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R4_T1_CHARTER_PROOF_FAILED");
    roadmap.phases.find((phase) => phase.id === "P1").depends_on = ["P0"];
    roadmap.phases.find((phase) => phase.id === "P1").tasks[0]
      .depends_on = ["R4-T1"];
    expect(() => assertR4CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R4_T1_CHARTER_PROOF_FAILED");
  });

  test("requires the immutable R4 stop attempt if the phase is failed", () => {
    const { roadmap, decisionInbox } = model();
    const r4 = roadmap.phases.find((phase) => phase.id === "R4");
    r4.status = "failed";
    r4.tasks.find((task) => task.id === "R4-T1").status = "done";
    expect(() => assertR4CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R4_T1_CHARTER_PROOF_FAILED");
    const verdict = r4.tasks.find((task) => task.id === "R4-T4");
    verdict.status = "done";
    verdict.decision = "stop";
    expect(assertR4CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    }).r4Status).toBe("failed");
  });

  test("requires the pending decision task itself to be blocked", () => {
    const { roadmap, decisionInbox } = model();
    const r4 = roadmap.phases.find((phase) => phase.id === "R4");
    const verdict = r4.tasks.find((task) => task.id === "R4-T4");
    verdict.status = "todo";
    expect(() => assertR4CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R4_T1_CHARTER_PROOF_FAILED");
    verdict.status = "blocked";
    expect(assertR4CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    }).r4Status).toBe("blocked");
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
