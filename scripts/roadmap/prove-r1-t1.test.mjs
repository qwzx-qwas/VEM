import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseYaml, validateRepository } from "./validator-core.mjs";
import {
  assertR1CharterModel,
  buildR1CharterProof,
} from "./prove-r1-t1.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("R1-T1 independent runner-remediation charter", () => {
  test("preserves both terminal stop chains with zero product unlocks", () => {
    expect(buildR1CharterProof(REPO_ROOT)).toMatchObject({
      taskId: "R1-T1",
      outcome: "passed",
      preservedTerminalStates: [
        { phase: "P0", status: "failed", verdict: "stop" },
        { phase: "R0", status: "failed", verdict: "stop" },
      ],
      r1Boundary: {
        phase: "R1",
        status: "failed",
        phaseDependencies: [],
        doesNotSupersede: "R0-RECOVERY",
        alsoDoesNotSupersede: ["P0-VALUE"],
        productUnlockCount: 0,
        externalExecutionAuthorized: false,
      },
      validation: { phases: 11, tasks: 148, contracts: 27 },
    });
  });

  test("fails if either terminal chain is removed from non-supersession", () => {
    const roadmap = parseYaml(
      readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"),
      "ROADMAP.yaml",
    );
    const decisionInbox = parseYaml(
      readFileSync(join(REPO_ROOT, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
      "OPEN_DECISIONS.yaml",
    );
    roadmap.decisions["R1-RECOVERY"].also_does_not_supersede = [];
    expect(() => assertR1CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R1_T1_CHARTER_PROOF_FAILED");
  });
});
