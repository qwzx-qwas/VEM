import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildR2T2Proof } from "./prove-r2-t2.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("R2-T2 local final-output authority proof", () => {
  test("proves authoritative selection, single-file bind and sealed evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "vem-r2-t2-proof-test-"));
    roots.push(root);
    const proof = await buildR2T2Proof({
      outputRoot: join(root, "evidence"),
      enforceEvidenceParent: false,
    });
    expect(proof).toMatchObject({
      taskId: "R2-T2",
      outcome: "passed",
      externalModelCalls: 0,
      selectedResponse: { line: 7 },
      protocolFailureSeparatedFromWrongAttribution: true,
      capsuleBoundary: {
        workspaceWritable: false,
        outputSiblingWritable: false,
        authoritativeFileWritable: true,
      },
    });
    expect(readFileSync(join(root, "evidence/SHA256SUMS"), "utf8"))
      .toContain("proof.json");
  });
});
