import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseYaml, validateRepository } from "./validator-core.mjs";
import {
  assertR0CharterModel,
  buildR0CharterProof,
} from "./prove-r0-t1.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("R0-T1 recovery charter proof", () => {
  test("binds owner authorization while preserving terminal P0 and zero product unlocks", () => {
    expect(buildR0CharterProof(REPO_ROOT)).toMatchObject({
      taskId: "R0-T1",
      outcome: "passed",
      ownerAuthorization: {
        recordedDecisionId: "OWNER-R0-RECOVERY-RESEARCH",
        scope: "independent-recovery-research",
      },
      preservedTerminalState: {
        phase: "P0",
        status: "failed",
        currentAttempt: "P0-T17D",
        verdict: "stop",
      },
      recoveryBoundary: {
        phase: "R0",
        status: "failed",
        doesNotSupersede: "P0-VALUE",
        productUnlockCount: 0,
      },
      validation: {
        phases: 16,
        tasks: 171,
        contracts: 32,
      },
    });
    expect(["in_progress", "done"]).toContain(
      buildR0CharterProof(REPO_ROOT).recoveryBoundary.charterTaskStatus,
    );
  });

  test("fails if the recovery decision is made to supersede P0-VALUE", () => {
    const roadmap = parseYaml(
      readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"),
      "ROADMAP.yaml",
    );
    const decisionInbox = parseYaml(
      readFileSync(join(REPO_ROOT, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
      "OPEN_DECISIONS.yaml",
    );
    roadmap.decisions["R0-RECOVERY"].does_not_supersede = "R0-RECOVERY";
    expect(() => assertR0CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toThrowError("R0_T1_CHARTER_PROOF_FAILED");
  });

  test("remains valid while independently authorized recovery tasks advance", () => {
    const roadmap = parseYaml(
      readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"),
      "ROADMAP.yaml",
    );
    const decisionInbox = parseYaml(
      readFileSync(join(REPO_ROOT, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
      "OPEN_DECISIONS.yaml",
    );
    const r0 = roadmap.phases.find((phase) => phase.id === "R0");
    r0.tasks.find((task) => task.id === "R0-T2").status = "in_progress";
    expect(assertR0CharterModel({
      roadmap,
      decisionInbox,
      validation: validateRepository(REPO_ROOT),
    })).toMatchObject({
      valid: true,
      p0Status: "failed",
      p0ValueVerdict: "stop",
      productUnlockCount: 0,
    });
  });
});
