import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { proveR7T2Isolation, verifyR7T2Evidence } from "./prove-r7-t2.mjs";

describe("R7-T2 local proof", () => {
  test("proves retry isolation, exception sealing, budget and no rerun", async () => {
    await expect(proveR7T2Isolation()).resolves.toMatchObject({
      result: "passed",
      modelCallCount: 0,
      externalExecutionAuthorized: false,
      productUnlockCount: 0,
      perAttemptIsolation: {
        distinctCapsuleControlRootCount: 4,
        distinctAuthoritativeFinalFileCount: 4,
      },
      exceptionSealing: {
        processAttemptCount: 1,
        retryAuthorized: true,
        retryProcessStarted: false,
        topLevelManifestValid: true,
      },
      rerunBoundary: {
        sameAuthorizationAlternateRootRejected: true,
      },
    });
  });

  test("verifies the committed private evidence when present", () => {
    const parent = join(import.meta.dirname, "../../docs/test-evidence/R7-T2");
    const current = readFileSync(join(parent, "CURRENT"), "utf8").trim();
    expect(verifyR7T2Evidence(join(parent, current))).toBe(true);
  });

  test("proof source has no external execution primitive", () => {
    const source = readFileSync(join(import.meta.dirname, "prove-r7-t2.mjs"), "utf8");
    expect(source).not.toMatch(/node:child_process|node:https|node:http|fetch\s*\(|\.spawn\s*\(/u);
  });
});
