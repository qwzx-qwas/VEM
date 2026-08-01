import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertR7CharterModel,
  buildR7CharterProof,
} from "./prove-r7-t1.mjs";
import { parseYaml, validateRepository } from "./validator-core.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("R7-T1 independent retry-capsule isolation charter", () => {
  test("preserves R6/R5 stops, R4 blocked/pending and all earlier stops", () => {
    const proof = buildR7CharterProof(REPO_ROOT);
    expect(proof).toMatchObject({
      taskId: "R7-T1",
      outcome: "passed",
      ownerAuthorization: {
        scope: "r7-t1-through-r7-t3-local-zero-call-only",
        externalExecutionAuthorized: false,
      },
      preservedR4BlockedState: {
        phase: "R4",
        status: "blocked",
        task: "R4-T4",
        taskStatus: "blocked",
        decision: "pending",
      },
      r7Boundary: {
        phase: "R7",
        status: "failed",
        phaseDependencies: [],
        taskDependencies: [],
        doesNotSupersede: "R6-RECOVERY",
        alsoDoesNotSupersede: [
          "R5-RECOVERY",
          "R4-RECOVERY",
          "R3-RECOVERY",
          "R2-RECOVERY",
          "R1-RECOVERY",
          "R0-RECOVERY",
          "P0-VALUE",
        ],
        productUnlockCount: 0,
        externalExecutionAuthorized: false,
        currentDecision: "stop",
      },
      validation: { phases: 18, tasks: 185, contracts: 34 },
    });
    expect(proof.preservedTerminalStates.map(({ phase }) => phase))
      .toEqual(["P0", "R0", "R1", "R2", "R3", "R5", "R6"]);
  });

  test("rejects reopening R6 stop or changing R4 blocked/pending", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.phases.find((phase) => phase.id === "R6").tasks
      .find((task) => task.id === "R6-T13").decision = "continue";
    expectFailure(roadmap, decisionInbox);
    const restored = model();
    const r4 = restored.roadmap.phases.find((phase) => phase.id === "R4");
    r4.status = "failed";
    r4.tasks.find((task) => task.id === "R4-T4").status = "done";
    r4.tasks.find((task) => task.id === "R4-T4").decision = "stop";
    expectFailure(restored.roadmap, restored.decisionInbox);
  });

  test("rejects decision-chain or dependency leakage", () => {
    const { roadmap, decisionInbox } = model();
    roadmap.decisions["R7-RECOVERY"].also_does_not_supersede.shift();
    expectFailure(roadmap, decisionInbox);
    const restored = model();
    restored.roadmap.phases.find((phase) => phase.id === "P1")
      .depends_on = ["R7"];
    expectFailure(restored.roadmap, restored.decisionInbox);
  });

  test("requires the exact owner grant and keeps external execution false", () => {
    const { roadmap, decisionInbox } = model();
    const owner = decisionInbox.decisions.find(
      (decision) => (
        decision.id === "OWNER-R7-RETRY-CAPSULE-ISOLATION-REMEDIATION"
      ),
    );
    owner.external_execution_authorized = true;
    expectFailure(roadmap, decisionInbox);
    const restored = model();
    restored.decisionInbox.decisions.find(
      (decision) => (
        decision.id === "OWNER-R7-RETRY-CAPSULE-ISOLATION-REMEDIATION"
      ),
    ).owner_statement = "changed";
    expectFailure(restored.roadmap, restored.decisionInbox);
  });

  test("rejects reopening terminal R7 or changing its stop verdict", () => {
    const { roadmap, decisionInbox } = model();
    const r7 = roadmap.phases.find((phase) => phase.id === "R7");
    r7.tasks.find((task) => task.id === "R7-T4").status = "todo";
    expectFailure(roadmap, decisionInbox);
    const restored = model();
    const attempt = restored.roadmap.phases.find((phase) => phase.id === "R7")
      .tasks.find((task) => task.id === "R7-T4");
    attempt.decision = "continue";
    expectFailure(restored.roadmap, restored.decisionInbox);
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

function expectFailure(roadmap, decisionInbox) {
  expect(() => assertR7CharterModel({
    roadmap,
    decisionInbox,
    validation: validateRepository(REPO_ROOT),
  })).toThrowError("R7_T1_CHARTER_PROOF_FAILED");
}
