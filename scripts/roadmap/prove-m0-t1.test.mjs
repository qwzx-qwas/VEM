import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { assertM0CharterModel, buildM0CharterProof } from "./prove-m0-t1.mjs";
import { parseYaml, validateRepository } from "./validator-core.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const COMMITTED_EVIDENCE = join(
  REPO_ROOT,
  "docs/test-evidence/M0-T1/20260801T191800+0800",
);

describe("M0-T1 model-agnostic usable MCP charter", () => {
  test("preserves prior decisions and records the exact product route", () => {
    const proof = buildM0CharterProof();
    expect(proof).toMatchObject({
      taskId: "M0-T1",
      outcome: "passed",
      ownerAuthorization: {
        externalModelExecutionAuthorized: false,
        localEdgeViteMcpProcessTestsAuthorized: true,
      },
      preservedR4BlockedState: {
        phase: "R4",
        phaseStatus: "blocked",
        task: "R4-T4",
        taskStatus: "blocked",
        verdict: "pending",
      },
      productRoute: {
        phase: "M0",
        status: "in_progress",
        dependencies: [],
        requiredDecisions: {},
        p0OrRecoveryVerdictRequired: false,
        r8CompletionRequired: false,
        participantModelIdentityRequired: false,
        providerReachabilityRequired: false,
        productModelReferences: [],
        productUnlockClaimCount: 0,
      },
      executionBoundary: {
        externalModelCallCount: 0,
        participantProcessCount: 0,
        providerRequestCount: 0,
        edgeProcessCount: 0,
      },
      validation: { phases: 19, tasks: 198, contracts: 35 },
    });
    expect(proof.preservedTerminalStates.map(({ phase }) => phase))
      .toEqual(["P0", "R0", "R1", "R2", "R3", "R5", "R6", "R7"]);
    expect(proof.productRoute.atomicTaskIds).toEqual(
      Array.from({ length: 13 }, (_, index) => `M0-T${index + 1}`),
    );
  });

  test("rejects changing a prior verdict or blocked state", () => {
    const first = fixture();
    first.roadmap.phases.find((phase) => phase.id === "P0").tasks
      .find((task) => task.id === "P0-T17D").decision = "continue";
    expectFailure(first);
    const second = fixture();
    const r4 = second.roadmap.phases.find((phase) => phase.id === "R4");
    r4.status = "failed";
    r4.tasks.find((task) => task.id === "R4-T4").status = "done";
    r4.tasks.find((task) => task.id === "R4-T4").decision = "stop";
    expectFailure(second);
  });

  test("rejects a recovery gate or reordered product task", () => {
    const first = fixture();
    first.roadmap.phases.find((phase) => phase.id === "M0")
      .gate.requires_decisions = { "R8-RECOVERY": "continue" };
    expectFailure(first);
    const second = fixture();
    second.roadmap.phases.find((phase) => phase.id === "M0").tasks
      .find((task) => task.id === "M0-T5").depends_on = ["M0-T3"];
    expectFailure(second);
  });

  test("requires exact owner scope and model independence", () => {
    const first = fixture();
    owner(first).authorized_scope.pop();
    expectFailure(first);
    const second = fixture();
    owner(second).external_model_execution_authorized = true;
    expectFailure(second);
    const third = fixture();
    expect(() => assertM0CharterModel({
      ...third,
      validation: validateRepository(REPO_ROOT),
      productModelReferences: ["coordinator/src/model.ts"],
    })).toThrowError("M0_T1_CHARTER_PROOF_FAILED");
  });

  test("verifies committed evidence manifest and current source bindings", () => {
    const proofBody = readFileSync(join(COMMITTED_EVIDENCE, "charter-proof.json"));
    const summaryBody = readFileSync(join(COMMITTED_EVIDENCE, "SUMMARY.md"));
    const manifest = readFileSync(join(COMMITTED_EVIDENCE, "SHA256SUMS"), "utf8")
      .trim().split("\n");
    expect(manifest).toEqual([
      `${sha256(proofBody)}  charter-proof.json`,
      `${sha256(summaryBody)}  SUMMARY.md`,
    ]);
    expect(sha256(proofBody)).toBe(
      "8f0bb214d60cab886a0b19e06c53da1d8b367f1769e454e0ab3d62d909481e6e",
    );
    const proof = JSON.parse(proofBody.toString("utf8"));
    for (const [path, expected] of Object.entries(proof.sourceBindings)) {
      expect(sha256(readFileSync(join(REPO_ROOT, path)))).toBe(expected);
    }
    expect(proof.executionBoundary).toMatchObject({
      externalModelCallCount: 0,
      participantProcessCount: 0,
      providerRequestCount: 0,
      edgeProcessCount: 0,
      viteProcessCount: 0,
      mcpProcessCount: 0,
    });
  });
});

function fixture() {
  return {
    roadmap: parseYaml(readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"), "ROADMAP.yaml"),
    decisionInbox: parseYaml(
      readFileSync(join(REPO_ROOT, "docs/decisions/OPEN_DECISIONS.yaml"), "utf8"),
      "OPEN_DECISIONS.yaml",
    ),
  };
}

function owner(value) {
  return value.decisionInbox.decisions.find(
    (decision) => decision.id === "OWNER-M0-USABLE-MCP-PRIORITY",
  );
}

function expectFailure(value) {
  expect(() => assertM0CharterModel({
    ...value,
    validation: validateRepository(REPO_ROOT),
    productModelReferences: [],
  })).toThrowError("M0_T1_CHARTER_PROOF_FAILED");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
