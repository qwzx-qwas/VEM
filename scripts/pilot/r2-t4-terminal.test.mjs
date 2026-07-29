import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseYaml } from "../roadmap/validator-core.mjs";
import { verifyR2Preregistration } from "./r2-t4.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PREREGISTRATION_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R2-T3/20260729T225128+0800",
);
const RESULT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R2-T4/20260729T230343+0800",
);
const EXPECTED_PREREGISTRATION_HASH = (
  "dddd48ade2a92b2e12ec7600c9cdc0bd65eee6d47023d01d70b8bd71b47c273a"
);

describe("R2-T4 immutable terminal evidence", () => {
  test("binds authorization and every aggregate result hash", () => {
    const authorization = json(join(
      REPO_ROOT,
      "docs/test-evidence/R2-T4/OWNER_AUTHORIZATION_20260729.json",
    ));
    expect(authorization).toMatchObject({
      taskId: "R2-T4",
      authorized: true,
      preregistrationHash: EXPECTED_PREREGISTRATION_HASH,
    });
    expect(verifyR2Preregistration(PREREGISTRATION_ROOT))
      .toBe(EXPECTED_PREREGISTRATION_HASH);
    const results = readFileSync(join(RESULT_ROOT, "RESULTS.sha256"), "utf8")
      .trim().split("\n");
    expect(results.length).toBeGreaterThan(70);
    for (const line of results) {
      const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/u.exec(line);
      expect(match).not.toBeNull();
      expect(sha256(readFileSync(join(RESULT_ROOT, match[2])))).toBe(match[1]);
    }
  });

  test("records the ninth-run audit escape without retry or false attribution", () => {
    const verdict = json(join(RESULT_ROOT, "results/verdict.json"));
    const stopped = json(join(RESULT_ROOT, "results/batch-stopped.json"));
    const auditFailure = json(join(RESULT_ROOT, "results/audit-failure.json"));
    const index = json(join(RESULT_ROOT, "results/run-index.json"));
    expect(verdict).toMatchObject({
      decisionKey: "R2-RECOVERY",
      decisionAttempt: 1,
      verdict: "stop",
      stopReasons: [
        "capsule-integrity-failed",
        "failure-evidence-not-sealed-before-return",
      ],
      adjustReasons: ["external-run-did-not-produce-ten-fresh-complete-processes"],
      metrics: {
        runCount: 9,
        uniqueThreadCount: 9,
        exactResponseCount: 9,
        protocolFailureCount: 0,
        wrongAttributionCount: 0,
      },
    });
    expect(stopped).toMatchObject({
      completedRunCount: 9,
      remainingRunCount: 1,
      failureCodes: ["CAPSULE_AUDIT_V2_ESCAPE"],
      externalRetryPerformed: false,
      failureEvidenceSealedBeforeReturn: false,
      postAbortEvidenceSealed: true,
    });
    expect(auditFailure).toMatchObject({
      forbiddenMarkers: ["AGENTS.md"],
      commandEventLines: [3, 4],
      externalRetryPerformed: false,
    });
    expect(index.runIds).toHaveLength(9);
    expect(new Set(index.threadIds).size).toBe(9);
  });

  test("preserves all prior stops and leaves zero product dependency edges", () => {
    const roadmap = parseYaml(
      readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"),
      "ROADMAP.yaml",
    );
    const expectedTerminal = [
      ["P0", "P0-T17D"],
      ["R0", "R0-T4"],
      ["R1", "R1-T4"],
      ["R2", "R2-T4"],
    ];
    for (const [phaseId, taskId] of expectedTerminal) {
      const phase = roadmap.phases.find((candidate) => candidate.id === phaseId);
      const task = phase.tasks.find((candidate) => candidate.id === taskId);
      expect({ phase: phase.status, task: task.status, decision: task.decision })
        .toEqual({ phase: "failed", task: "done", decision: "stop" });
    }
    const r2TaskIds = new Set(
      roadmap.phases.find((phase) => phase.id === "R2").tasks.map((task) => task.id),
    );
    const otherPhases = roadmap.phases.filter((phase) => phase.id !== "R2");
    expect(otherPhases.some((phase) => phase.depends_on.includes("R2"))).toBe(false);
    expect(otherPhases.flatMap((phase) => phase.tasks).some((task) => (
      task.depends_on ?? []
    ).some((dependency) => r2TaskIds.has(dependency)))).toBe(false);
  });

  test("keeps all preregistered runtime source bindings unchanged", () => {
    const plan = json(join(PREREGISTRATION_ROOT, "PREREGISTRATION.json"));
    expect(Object.keys(plan.sourceBindings)).toHaveLength(8);
    for (const [path, expectedHash] of Object.entries(plan.sourceBindings)) {
      expect(sha256(readFileSync(join(REPO_ROOT, path)))).toBe(expectedHash);
    }
  });
});

function json(path) { return JSON.parse(readFileSync(path, "utf8")); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
