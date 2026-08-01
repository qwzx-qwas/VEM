import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertR8CharterModel,
  buildR8CharterProof,
} from "./prove-r8-t1.mjs";
import { parseYaml, validateRepository } from "./validator-core.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("R8-T1 final recovery exit charter", () => {
  test("preserves every terminal stop and R4 blocked pending", () => {
    const proof = buildR8CharterProof(REPO_ROOT);
    expect(proof).toMatchObject({
      taskId: "R8-T1",
      outcome: "passed",
      ownerAuthorization: {
        scope: "final-recovery-exit-charter-first",
        externalExecutionAuthorized: false,
      },
      preservedR4BlockedState: {
        phase: "R4",
        status: "blocked",
        task: "R4-T4",
        taskStatus: "blocked",
        decision: "pending",
      },
      r8Boundary: {
        phase: "R8",
        status: "in_progress",
        taskStatus: "done",
        phaseDependencies: [],
        taskDependencies: [],
        doesNotSupersede: "R7-RECOVERY",
        alsoDoesNotSupersede: [
          "R6-RECOVERY",
          "R5-RECOVERY",
          "R4-RECOVERY",
          "R3-RECOVERY",
          "R2-RECOVERY",
          "R1-RECOVERY",
          "R0-RECOVERY",
          "P0-VALUE",
        ],
        maximumFutureExternalProcesses: 1,
        maximumFutureRetries: 0,
        r9Allowed: false,
        productRouteRequiresR8Continue: false,
        productModelIdentityRequirement: false,
        productModelReferences: [],
        productUnlockCount: 0,
        externalExecutionAuthorized: false,
        currentDecision: "pending",
      },
      validation: { phases: 19, tasks: 198, contracts: 35 },
    });
    expect(proof.preservedTerminalStates.map(({ phase }) => phase))
      .toEqual(["P0", "R0", "R1", "R2", "R3", "R5", "R6", "R7"]);
  });

  test("rejects reopening prior stop or changing R4 blocked pending", () => {
    const first = model();
    first.roadmap.phases.find((phase) => phase.id === "R7").tasks
      .find((task) => task.id === "R7-T4").decision = "continue";
    expectFailure(first);
    const second = model();
    const r4 = second.roadmap.phases.find((phase) => phase.id === "R4");
    r4.status = "failed";
    r4.tasks.find((task) => task.id === "R4-T4").status = "done";
    r4.tasks.find((task) => task.id === "R4-T4").decision = "stop";
    expectFailure(second);
  });

  test("rejects dependency leakage and any R9 route", () => {
    const first = model();
    first.roadmap.phases.find((phase) => phase.id === "P1").depends_on = ["R8"];
    expectFailure(first);
    const second = model();
    second.roadmap.phases.push({ id: "R9", status: "todo", depends_on: [], tasks: [] });
    expectFailure(second);
  });

  test("requires exact one-process no-retry owner direction", () => {
    const first = model();
    owner(first).maximum_future_external_processes = 2;
    expectFailure(first);
    const second = model();
    owner(second).maximum_future_retries = 1;
    expectFailure(second);
    const third = model();
    owner(third).external_execution_authorized = true;
    expectFailure(third);
  });

  test("rejects product model identity coupling", () => {
    const fixture = model();
    expect(() => assertR8CharterModel({
      ...fixture,
      validation: validateRepository(REPO_ROOT),
      productModelReferences: ["coordinator/src/model.ts"],
    })).toThrowError("R8_T1_CHARTER_PROOF_FAILED");
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

function owner(fixture) {
  return fixture.decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-R8-FINAL-RECOVERY-EXIT",
  );
}

function expectFailure(fixture) {
  expect(() => assertR8CharterModel({
    ...fixture,
    validation: validateRepository(REPO_ROOT),
    productModelReferences: [],
  })).toThrowError("R8_T1_CHARTER_PROOF_FAILED");
}
