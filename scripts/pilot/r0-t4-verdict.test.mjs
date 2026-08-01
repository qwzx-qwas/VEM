import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseYaml } from "../roadmap/validator-core.mjs";
import { preregistrationDigest } from "./r0-t3.mjs";
import { verifyR0OwnerAuthorization } from "./r0-t4.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PREREG_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R0-T3/20260729T193158+0800",
);
const RESULT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R0-T4/20260729T194719+0800",
);
const AUTHORIZATION_PATH = join(
  REPO_ROOT,
  "docs/test-evidence/R0-T4/OWNER_AUTHORIZATION_20260729.json",
);

describe("R0-T4 immutable fail-closed verdict", () => {
  test("binds the authorized frozen preregistration and runtime sources", () => {
    const expectedHash = readFileSync(
      join(PREREG_ROOT, "PREREGISTRATION.sha256"),
      "utf8",
    ).trim();
    const plan = readJson(join(PREREG_ROOT, "PREREGISTRATION.json"));
    expect(expectedHash).toBe(
      "57fb4b9b033e61eb4e0b4b9a0f14ced28064b6fb17d73f5e7ae60552d0f37359",
    );
    expect(preregistrationDigest(PREREG_ROOT)).toBe(expectedHash);
    for (const [path, expectedSourceHash] of Object.entries(plan.sourceBindings)) {
      expect(sha256(readFileSync(join(REPO_ROOT, path)))).toBe(expectedSourceHash);
    }
    expect(verifyR0OwnerAuthorization({
      authorization: readJson(AUTHORIZATION_PATH),
      preregistrationHash: expectedHash,
    })).toMatchObject({
      valid: true,
      authorizationHash: "49968901f3c5353797e7af8e29838f244a974b22ef8c07b4114cff7a6aac73b7",
    });
  });

  test("records stop precedence for the first-arm ledger-integrity failure", () => {
    const failure = readJson(join(RESULT_ROOT, "failure.json"));
    const verdict = readJson(join(RESULT_ROOT, "verdict.json"));
    expect(failure).toMatchObject({
      attemptedExternalProcessCount: 1,
      persistedCompletedRunCount: 0,
      remainingAuthorizedCallsNotExecuted: 9,
      failedTaskId: "r0-ux-01-sync-state",
      failedArm: "direct-search",
      errorCode: "RECEIPT_LEDGER_RESPONSE_DUPLICATE",
      stopTrigger: "event-ledger-integrity-failed",
    });
    expect(verdict).toMatchObject({
      decisionKey: "R0-RECOVERY",
      decisionAttempt: 1,
      verdict: "stop",
      stopReasons: ["event-ledger-integrity-failed"],
      adjustReasons: ["external-run-did-not-produce-ten-fresh-complete-processes"],
      metrics: {
        attemptedExternalProcessCount: 1,
        completedRunCount: 0,
        remainingAuthorizedCallsNotExecuted: 9,
      },
    });
    expect(readdirSync(
      join(RESULT_ROOT, "results/runs/r0-ux-01-sync-state-1-direct-search"),
    )).toEqual([]);
  });

  test("preserves terminal P0 while marking only independent R0 failed", () => {
    const roadmap = parseYaml(
      readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"),
      "ROADMAP.yaml",
    );
    const p0 = roadmap.phases.find((phase) => phase.id === "P0");
    const r0 = roadmap.phases.find((phase) => phase.id === "R0");
    expect(p0).toMatchObject({ status: "failed" });
    expect(p0.tasks.find((task) => task.id === "P0-T17D")).toMatchObject({
      status: "done",
      decision: "stop",
    });
    expect(r0).toMatchObject({ status: "failed" });
    expect(r0.tasks.find((task) => task.id === "R0-T4")).toMatchObject({
      status: "done",
      decision: "stop",
      decision_attempt: 1,
    });
    expect(roadmap.decisions["R0-RECOVERY"]).toMatchObject({
      does_not_supersede: "P0-VALUE",
    });
  });
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
