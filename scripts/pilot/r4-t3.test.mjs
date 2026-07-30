import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import {
  prepareR4RecoveryPreregistration,
  preregistrationDigest,
} from "./r4-t3.mjs";
import {
  verifyR4BoundSources,
  verifyR4OwnerAuthorization,
  verifyR4Preregistration,
} from "./r4-t4.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R4-T3 frozen transport preregistration", () => {
  test("freezes five fresh pairs and a twenty-process bounded attempt plan", () => {
    const root = generate();
    const result = verifyR4Preregistration(root, { requireProbes: false });
    expect(result).toMatchObject({
      preregistrationHash: preregistrationDigest(root),
      plan: {
        decisionKey: "R4-RECOVERY",
        taskCount: 5,
        successfulArmCount: 10,
        maxRetriesPerArm: 1,
        maxProcessAttempts: 20,
        externalExecutionAuthorized: false,
        productUnlockCount: 0,
        groundTruthParticipantVisible: false,
        productHoldoutConsumed: false,
      },
      manifest: {
        tasks: expect.arrayContaining([
          expect.objectContaining({
            taskClass:
              "r4-external-transport-timeout-only-not-product-holdout",
          }),
        ]),
      },
    });
    expect(result.manifest.tasks).toHaveLength(5);
    expect(new Set(result.manifest.tasks.map((task) => task.taskId)).size)
      .toBe(5);
    expect(result.plan.sourceBindings).toHaveProperty(
      "scripts/pilot/r4-t4.mjs",
    );
    expect(result.plan.sourceBindings).toHaveProperty(
      "scripts/pilot/r4-transport.mjs",
    );
  });

  test("binds exact destination, data scope and process budget authorization", () => {
    const root = generate();
    const { preregistrationHash, plan } = verifyR4Preregistration(
      root,
      { requireProbes: false },
    );
    const authorization = {
      schemaVersion: "R4-T4-owner-authorization-v1",
      taskId: "R4-T4",
      decisionKey: "R4-RECOVERY",
      authorized: true,
      preregistrationHash,
      destination: "OpenAI Codex service",
      model: "gpt-5.6-sol",
      dataScopeHash: plan.dataScopeHash,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      statement:
        "Owner authorizes the frozen R4 destination, participant data scope, ten successful arms and at most twenty external process attempts.",
      authorizedAt: "2026-07-30T15:00:00+08:00",
    };
    expect(verifyR4OwnerAuthorization({
      authorization,
      preregistrationHash,
      dataScopeHash: plan.dataScopeHash,
    })).toMatchObject({ valid: true, maxProcessAttempts: 20 });
    expect(() => verifyR4OwnerAuthorization({
      authorization: { ...authorization, maxProcessAttempts: 21 },
      preregistrationHash,
      dataScopeHash: plan.dataScopeHash,
    })).toThrowError("R4_T4_OWNER_AUTHORIZATION_INVALID");
    expect(() => verifyR4OwnerAuthorization({
      authorization: { ...authorization, dataScopeHash: "f".repeat(64) },
      preregistrationHash,
      dataScopeHash: plan.dataScopeHash,
    })).toThrowError("R4_T4_OWNER_AUTHORIZATION_INVALID");
  });

  test("fails closed after preregistration mutation", () => {
    const root = generate();
    const path = join(root, "inputs/retry-policy.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, `${JSON.stringify({
      ...value,
      maxProcessAttempts: 21,
    })}\n`);
    expect(() => verifyR4Preregistration(root, { requireProbes: false }))
      .toThrowError("R4_T4_PREREGISTRATION_CHANGED");
  });

  test("fails closed on any runtime source binding drift", () => {
    const root = generate();
    const { plan } = verifyR4Preregistration(root, { requireProbes: false });
    expect(() => verifyR4BoundSources({
      ...plan.sourceBindings,
      "scripts/pilot/r4-t4.mjs": "0".repeat(64),
    })).toThrowError("R4_T4_BOUND_SOURCE_CHANGED");
  });
});

function generate() {
  const parent = mkdtempSync(join(tmpdir(), "vem-r4-t3-test-"));
  roots.push(parent);
  const root = join(parent, "prereg");
  prepareR4RecoveryPreregistration({
    outputRoot: root,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  return root;
}
