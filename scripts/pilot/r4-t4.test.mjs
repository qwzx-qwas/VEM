import { describe, expect, test } from "vitest";
import {
  runR4RecoveryPilot,
  verifyR4OwnerAuthorization,
} from "./r4-t4.mjs";

describe("R4-T4 frozen runner boundary", () => {
  test("rejects incomplete authorization before any executor can run", async () => {
    let called = false;
    await expect(runR4RecoveryPilot({
      preregistrationRoot: "/tmp/not-a-frozen-r4-root",
      resultRoot: "/tmp/not-a-result-root",
      authorizationPath: "/tmp/not-an-authorization",
      executeAttempt: async () => {
        called = true;
      },
    })).rejects.toThrow();
    expect(called).toBe(false);
  });

  test("requires a full hash, destination, data scope and attempt cap", () => {
    const hash = "a".repeat(64);
    const dataScopeHash = "b".repeat(64);
    const base = {
      schemaVersion: "R4-T4-owner-authorization-v1",
      taskId: "R4-T4",
      decisionKey: "R4-RECOVERY",
      authorized: true,
      preregistrationHash: hash,
      destination: "OpenAI Codex service",
      model: "gpt-5.6-sol",
      dataScopeHash,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      statement:
        "Authorize this frozen destination and participant data scope for at most twenty process attempts.",
      authorizedAt: "2026-07-30T15:00:00+08:00",
    };
    expect(verifyR4OwnerAuthorization({
      authorization: base,
      preregistrationHash: hash,
      dataScopeHash,
    })).toMatchObject({ valid: true });
    for (const mutation of [
      { destination: "other" },
      { model: "other" },
      { successfulArmCount: 9 },
      { maxProcessAttempts: 19 },
      { authorized: false },
    ]) {
      expect(() => verifyR4OwnerAuthorization({
        authorization: { ...base, ...mutation },
        preregistrationHash: hash,
        dataScopeHash,
      })).toThrowError("R4_T4_OWNER_AUTHORIZATION_INVALID");
    }
  });
});
