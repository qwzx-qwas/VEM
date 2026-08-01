import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  proveR8T2Boundary,
  verifyR8T2Evidence,
  writeR8T2Evidence,
} from "./prove-r8-t2.mjs";

const roots = [];
const COMMITTED_EVIDENCE = join(
  process.cwd(),
  "docs/test-evidence/R8-T2/20260801T185500+0800",
);

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("R8-T2 local boundary proof", () => {
  test("proves adapter isolation and one-shot stop rules with zero external calls", async () => {
    const proof = await proveR8T2Boundary();
    expect(proof).toMatchObject({
      taskId: "R8-T2",
      result: "passed",
      modelCallCount: 0,
      participantProcessCount: 0,
      providerRequestCount: 0,
      externalExecutionAuthorized: false,
      productUnlockCount: 0,
      productBoundary: {
        productModelReferences: [],
        providerReachabilityIsMcpCorrectness: false,
      },
      oneShotBoundary: {
        maximumProcessAttempts: 1,
        maximumRetries: 0,
        retryApiExposed: false,
        timeoutDisposition: "stop",
        incompleteDisposition: "stop",
        r9Allowed: false,
      },
    });
  });

  test("writes private self-verifying evidence", async () => {
    const parent = join(process.cwd(), "docs/test-evidence/R8-T2");
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const temporary = mkdtempSync(join(parent, ".test-"));
    roots.push(temporary);
    rmSync(temporary, { recursive: true, force: true });
    await writeR8T2Evidence(temporary);
    expect(verifyR8T2Evidence(temporary)).toBe(true);
  });

  test("verifies the committed zero-call proof", () => {
    expect(verifyR8T2Evidence(COMMITTED_EVIDENCE)).toBe(true);
    const proof = readFileSync(join(COMMITTED_EVIDENCE, "proof.json"));
    expect(proofHash(proof)).toBe(
      "aa9a2bb7795dfdaea87f908a30baf40179d52dffc377934359eebb792010e0b9",
    );
    const parsed = JSON.parse(proof.toString("utf8"));
    for (const [path, expected] of Object.entries(parsed.sourceBindings)) {
      expect(proofHash(readFileSync(join(process.cwd(), path)))).toBe(expected);
    }
  });
});

function proofHash(value) {
  return createHash("sha256").update(value).digest("hex");
}
