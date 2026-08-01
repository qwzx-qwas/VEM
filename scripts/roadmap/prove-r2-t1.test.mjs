import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseYaml, validateRepository } from "./validator-core.mjs";
import {
  assertR2CharterModel,
  buildR2CharterProof,
} from "./prove-r2-t1.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("R2-T1 independent final-output remediation charter", () => {
  test("preserves all three terminal stop chains with zero product unlocks", () => {
    expect(buildR2CharterProof(REPO_ROOT)).toMatchObject({
      taskId: "R2-T1",
      outcome: "passed",
      preservedTerminalStates: [
        { phase: "P0", status: "failed", verdict: "stop" },
        { phase: "R0", status: "failed", verdict: "stop" },
        { phase: "R1", status: "failed", verdict: "stop" },
      ],
      r2Boundary: {
        phase: "R2",
        status: "failed",
        phaseDependencies: [],
        doesNotSupersede: "R1-RECOVERY",
        alsoDoesNotSupersede: ["R0-RECOVERY", "P0-VALUE"],
        productUnlockCount: 0,
        externalExecutionAuthorized: false,
      },
      validation: { phases: 19, tasks: 198, contracts: 35 },
    });
  });

  test("fails if any terminal chain is removed from non-supersession", () => {
    const roadmap = parseYaml(
      readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"),
      "ROADMAP.yaml",
    );
    const decisionInbox = parseYaml(
      readFileSync(join(REPO_ROOT, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
      "OPEN_DECISIONS.yaml",
    );
    roadmap.decisions["R2-RECOVERY"].also_does_not_supersede = ["R0-RECOVERY"];
    expect(() => assertR2CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R2_T1_CHARTER_PROOF_FAILED");
  });

  test("requires the immutable R2 stop attempt when the phase is failed", () => {
    const roadmap = parseYaml(
      readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"),
      "ROADMAP.yaml",
    );
    const decisionInbox = parseYaml(
      readFileSync(join(REPO_ROOT, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
      "OPEN_DECISIONS.yaml",
    );
    roadmap.phases.find((phase) => phase.id === "R2")
      .tasks.find((task) => task.id === "R2-T4").decision = "continue";
    expect(() => assertR2CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R2_T1_CHARTER_PROOF_FAILED");
  });
});
