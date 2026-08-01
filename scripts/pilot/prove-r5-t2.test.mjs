import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildR5T2Proof } from "./prove-r5-t2.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R5-T2 process-tree termination proof", () => {
  test("seals local deadline, force, cancellation and boundary failures", async () => {
    const root = mkdtempSync(join(tmpdir(), "vem-r5-t2-proof-test-"));
    roots.push(root);
    const proof = await buildR5T2Proof({
      outputRoot: join(root, "evidence"),
      enforceEvidenceParent: false,
    });

    expect(proof).toMatchObject({
      taskId: "R5-T2",
      outcome: "passed",
      externalModelCalls: 0,
      immutableR4Input: {
        preserved: true,
        incidentHash:
          "95021eac99d93d49985ee46d003a4108ff7a524244d83e3521b8edff8ecffd70",
      },
      observations: {
        normal: {
          outcome: "success",
          streamsAndFinalDrained: true,
        },
        deadlineTree: {
          outcome: "terminated",
          descendantStopped: true,
        },
        forced: {
          forceSignalSent: true,
        },
        cancelled: {
          outcome: "cancelled",
        },
        boundaryException: {
          outcome: "failed",
          independentExceptionsSealed: true,
        },
        orphanRefusal: {
          outcome: "failed",
          failClosed: true,
        },
        providerTerminalSeparation: {
          observed: true,
          invented: false,
        },
      },
      allEvidenceManifestsValid: true,
    });
    expect(readFileSync(join(root, "evidence/SHA256SUMS"), "utf8"))
      .toContain("proof.json");
  });
});
