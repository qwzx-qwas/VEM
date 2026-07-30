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
  prepareR6RecoveryPreregistration,
  preregistrationDigest,
} from "./r6-t3.mjs";
import {
  verifyR6BoundSources,
  verifyR6OwnerAuthorization,
  verifyR6Preregistration,
} from "./r6-t4.mjs";

const roots = [];
const FROZEN_PREREGISTRATION =
  "docs/test-evidence/R6-T3/20260730T165800-0800";

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R6-T3 frozen process-termination preregistration", () => {
  test("verifies the exact frozen no-model preregistration and all probes", () => {
    expect(verifyR6Preregistration(FROZEN_PREREGISTRATION)).toMatchObject({
      preregistrationHash:
        "935c7b8c8880d6439238096b99c3ada3338a7c4c94fec192a7d4c8806f9610c9",
      plan: {
        instrumentationHash:
          "a6ac0651d8258c83da0db47accb216c41682df0a1d075768c407b8cfdc939072",
        dataScopeHash:
          "e89a0a77f6f2ef099f4f68a1838f39574a1caf2747dccf95494d91d7e3153d10",
        terminationPolicyHash:
          "99e34c03e6b15a1bbeedc3040ccd6332d01f2ab6059cce111f978a51e937a7cd",
        outerEnvironmentHash:
          "cf24c3c5e349e230a9c04223dceb4854bd377915e21f46d830134b085bc3579d",
        externalExecutionAuthorized: false,
      },
    });
  });

  test("freezes fresh pairs, exact process bounds and immutable prior states", () => {
    const root = generate();
    const result = verifyR6Preregistration(root, { requireProbes: false });

    expect(result).toMatchObject({
      preregistrationHash: preregistrationDigest(root),
      plan: {
        decisionKey: "R6-RECOVERY",
        doesNotSupersede: "R5-RECOVERY",
        alsoDoesNotSupersede: [
          "R4-RECOVERY",
          "R3-RECOVERY",
          "R2-RECOVERY",
          "R1-RECOVERY",
          "R0-RECOVERY",
          "P0-VALUE",
        ],
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
        outerEnvironment: { PATH: "/usr/bin:/bin" },
        outerEnvironmentHash:
          "cf24c3c5e349e230a9c04223dceb4854bd377915e21f46d830134b085bc3579d",
        compatibilityPreflight: {
          proofHash:
            "2fe69ddf81f1a6a6a15b84ae144cdbf20dd67706cd4722ae3f91358b0086b8fa",
          predicatePassed: true,
          modelCall: false,
          providerNetworkProbed: false,
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
              "r6-invocation-compatible-only-not-product-holdout",
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
      "scripts/pilot/r6-t4.mjs",
    );
    expect(result.plan.sourceBindings).toHaveProperty(
      "scripts/pilot/r5-process-terminalizer.mjs",
    );
    expect(result.plan.sourceBindings).not.toHaveProperty(
      "scripts/pilot/r4-t4.mjs",
    );
    expect(result.plan.sourceBindings).toHaveProperty(
      "scripts/pilot/r6-invocation-preflight.mjs",
    );
  });

  test("binds authorization to destination, data, deadline, signals and budget", () => {
    const root = generate();
    const { preregistrationHash, plan } = verifyR6Preregistration(
      root,
      { requireProbes: false },
    );
    const authorization = {
      schemaVersion: "R6-T4-owner-authorization-v1",
      taskId: "R6-T4",
      decisionKey: "R6-RECOVERY",
      authorized: true,
      preregistrationHash,
      destination: "OpenAI Codex service",
      model: "gpt-5.6-sol",
      dataScopeHash: plan.dataScopeHash,
      outerEnvironmentHash: plan.outerEnvironmentHash,
      successfulArmCount: 10,
      maxProcessAttempts: 20,
      terminationPolicy: plan.terminationPolicy,
      statement:
        "Owner authorizes this exact R6 destination, data scope, process bounds and at most twenty external attempts.",
      authorizedAt: "2026-07-30T16:00:00+08:00",
    };
    expect(verifyR6OwnerAuthorization({
      authorization,
      preregistrationHash,
      dataScopeHash: plan.dataScopeHash,
      terminationPolicy: plan.terminationPolicy,
      outerEnvironmentHash: plan.outerEnvironmentHash,
    })).toMatchObject({
      valid: true,
      maxProcessAttempts: 20,
      deadlineMs: 120_000,
    });
    expect(() => verifyR6OwnerAuthorization({
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
      outerEnvironmentHash: plan.outerEnvironmentHash,
    })).toThrowError("R6_T4_OWNER_AUTHORIZATION_INVALID");
  });

  test("fails closed after a termination-policy or preregistration mutation", () => {
    const root = generate();
    const path = join(root, "inputs/termination-policy.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, `${JSON.stringify({
      ...value,
      deadlineMs: value.deadlineMs + 1,
    })}\n`);
    expect(() => verifyR6Preregistration(root, { requireProbes: false }))
      .toThrowError("R6_T4_PREREGISTRATION_CHANGED");
  });

  test("fails closed on any runtime source binding drift", () => {
    const root = generate();
    const { plan } = verifyR6Preregistration(root, { requireProbes: false });
    expect(() => verifyR6BoundSources({
      ...plan.sourceBindings,
      "scripts/pilot/r6-t4.mjs": "0".repeat(64),
    })).toThrowError("R6_T4_BOUND_SOURCE_CHANGED");
  });
});

function generate() {
  const parent = mkdtempSync(join(tmpdir(), "vem-r6-t3-test-"));
  roots.push(parent);
  const root = join(parent, "prereg");
  prepareR6RecoveryPreregistration({
    outputRoot: root,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  return root;
}
