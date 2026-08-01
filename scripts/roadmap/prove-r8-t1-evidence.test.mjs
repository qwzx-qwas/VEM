import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const EVIDENCE_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R8-T1/20260801T180544+0800",
);

describe("committed R8-T1 charter evidence", () => {
  test("verifies manifest and final recovery exit boundary", () => {
    const proofBody = readFileSync(join(EVIDENCE_ROOT, "charter-proof.json"));
    const summaryBody = readFileSync(join(EVIDENCE_ROOT, "summary.md"));
    const manifest = readFileSync(join(EVIDENCE_ROOT, "SHA256SUMS"), "utf8")
      .trim().split("\n");
    expect(manifest).toEqual([
      `${sha256(proofBody)}  charter-proof.json`,
      `${sha256(summaryBody)}  summary.md`,
    ]);
    expect(sha256(proofBody)).toBe(
      "0d5e8651fb8fa03834f212f023b6119eee981add926e792716ea14aab202222d",
    );
    const proof = JSON.parse(proofBody.toString("utf8"));
    expect(proof).toMatchObject({
      taskId: "R8-T1",
      outcome: "passed",
      ownerAuthorization: { externalExecutionAuthorized: false },
      r8Boundary: {
        taskStatus: "done",
        maximumFutureExternalProcesses: 1,
        maximumFutureRetries: 0,
        r9Allowed: false,
        productRouteRequiresR8Continue: false,
        productModelIdentityRequirement: false,
        productModelReferences: [],
        productUnlockCount: 0,
        externalExecutionAuthorized: false,
      },
      validation: { phases: 18, tasks: 185, contracts: 34 },
    });
  });

  test("matches every bound source without external execution evidence", () => {
    const proof = JSON.parse(readFileSync(
      join(EVIDENCE_ROOT, "charter-proof.json"),
      "utf8",
    ));
    for (const [path, expected] of Object.entries(proof.sourceBindings)) {
      expect(sha256(readFileSync(join(REPO_ROOT, path)))).toBe(expected);
    }
    const summary = readFileSync(join(EVIDENCE_ROOT, "summary.md"), "utf8");
    expect(summary).toContain(
      "Participant processes, provider probes and external model calls: 0.",
    );
  });
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
