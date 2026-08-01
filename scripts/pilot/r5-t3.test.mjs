import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  prepareR5RecoveryPreregistration,
  preregistrationDigest,
} from "./r5-t3.mjs";
import {
  verifyR5BoundSources,
  verifyR5OwnerAuthorization,
  verifyR5Preregistration,
} from "./r5-t4.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R5-T3 frozen process-termination preregistration", () => {
  test("freezes fresh pairs, exact process bounds and immutable prior states", () => {
    const root = generate();
    const result = verifyR5Preregistration(root, { requireProbes: false });

    expect(result).toMatchObject({
      preregistrationHash: preregistrationDigest(root),
      plan: {
        decisionKey: "R5-RECOVERY",
        taskCount: 5,
        successfulArmCount: 10,
        maxRetriesPerArm: 1,
        maxProcessAttempts: 20,
        terminationPolicy: {
          deadlineMs: 120_000,
          graceMs: 5_000,
          forceKillWaitMs: 5_000,
          gracefulSignal: "SIGTERM",
          forceSignal: "SIGKILL",
        },
        externalExecutionAuthorized: false,
        productUnlockCount: 0,
        groundTruthParticipantVisible: false,
        productHoldoutConsumed: false,
        blockedInput: {
          phase: "R4",
          task: "R4-T4",
          status: "blocked",
          decision: "pending",
        },
      },
      manifest: {
        tasks: expect.arrayContaining([
          expect.objectContaining({
            taskClass:
              "r5-process-termination-only-not-product-holdout",
          }),
        ]),
      },
    });
    expect(result.manifest.tasks).toHaveLength(5);
    expect(new Set(result.manifest.tasks.map((task) => task.taskId)).size)
      .toBe(5);
    const prior = JSON.parse(readFileSync(
      join(root, "private/prior-task-exclusion.json"),
      "utf8",
    ));
    expect(result.manifest.tasks.some((task) => (
      prior.taskIds.includes(task.taskId)
        || prior.promptHashes.includes(task.promptHash)
    ))).toBe(false);
    expect(result.plan.sourceBindings).toHaveProperty(
      "scripts/pilot/r5-t4.mjs",
    );
    expect(result.plan.sourceBindings).toHaveProperty(
      "scripts/pilot/r5-process-terminalizer.mjs",
    );
    expect(result.plan.sourceBindings).not.toHaveProperty(
      "scripts/pilot/r4-t4.mjs",
    );
  });

  test("binds authorization to destination, data, deadline, signals and budget", () => {
    const root = generate();
    const { preregistrationHash, plan } = verifyR5Preregistration(
      root,
      { requireProbes: false },
    );
    const authorization = {
      schemaVersion: "R5-T4-owner-authorization-v1",
      taskId: "R5-T4",
      decisionKey: "R5-RECOVERY",
      authorized: true,
      preregistrationHash,
      destination: "OpenAI Codex service",
      model: "gpt-5.6-sol",
      dataScopeHash: plan.dataScopeHash,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      terminationPolicy: plan.terminationPolicy,
      statement:
        "Owner authorizes this exact R5 destination, data scope, process bounds and at most twenty external attempts.",
      authorizedAt: "2026-07-30T16:00:00+08:00",
    };
    expect(verifyR5OwnerAuthorization({
      authorization,
      preregistrationHash,
      dataScopeHash: plan.dataScopeHash,
      terminationPolicy: plan.terminationPolicy,
    })).toMatchObject({
      valid: true,
      maxProcessAttempts: 20,
      deadlineMs: 120_000,
    });
    expect(() => verifyR5OwnerAuthorization({
      authorization: {
        ...authorization,
        terminationPolicy: {
          ...authorization.terminationPolicy,
          deadlineMs: 120_001,
        },
      },
      preregistrationHash,
      dataScopeHash: plan.dataScopeHash,
      terminationPolicy: plan.terminationPolicy,
    })).toThrowError("R5_T4_OWNER_AUTHORIZATION_INVALID");
  });

  test("fails closed after a termination-policy or preregistration mutation", () => {
    const root = generate();
    const path = join(root, "inputs/termination-policy.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, `${JSON.stringify({
      ...value,
      deadlineMs: value.deadlineMs + 1,
    })}\n`);
    expect(() => verifyR5Preregistration(root, { requireProbes: false }))
      .toThrowError("R5_T4_PREREGISTRATION_CHANGED");
  });

  test("fails closed on any runtime source binding drift", () => {
    const root = generate();
    const { plan } = verifyR5Preregistration(root, { requireProbes: false });
    expect(() => verifyR5BoundSources({
      ...plan.sourceBindings,
      "scripts/pilot/r5-t4.mjs": "0".repeat(64),
    })).toThrowError("R5_T4_BOUND_SOURCE_CHANGED");
  });
});

function generate() {
  const parent = mkdtempSync(join(tmpdir(), "vem-r5-t3-test-"));
  roots.push(parent);
  const root = join(parent, "prereg");
  prepareR5RecoveryPreregistration({
    outputRoot: root,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  return root;
}
