import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import {
  prepareR3RecoveryPreregistration,
  R3_PREREGISTERED_RUNTIME_SOURCE_PATHS,
} from "./r3-t3.mjs";
import {
  buildR3ResponseGroundTruth,
  R3_RUNTIME_SOURCE_PATHS,
  runR3CurrentPermissionPreflight,
  sealR3FrozenBatch,
  verifyR3BoundSources,
  verifyR3InvocationBoundary,
  verifyR3OwnerAuthorization,
  verifyR3Preregistration,
} from "./r3-t4.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R3-T4 frozen future runner", () => {
  test("requires exact hash-bound authorization for exactly ten runs", () => {
    const preregistrationHash = "a".repeat(64);
    const authorization = {
      schemaVersion: "R3-T4-owner-authorization-v1",
      taskId: "R3-T4",
      decisionKey: "R3-RECOVERY",
      authorized: true,
      preregistrationHash,
      runCount: 10,
      statement: "Owner authorizes this exact frozen ten-run R3 batch.",
      authorizedAt: "2026-07-30T01:00:00+08:00",
    };
    expect(verifyR3OwnerAuthorization({
      authorization,
      preregistrationHash,
    })).toEqual({
      valid: true,
      runCount: 10,
      authorizationHash: canonicalSha256(authorization),
    });
    for (const mutation of [
      { preregistrationHash: "b".repeat(64) },
      { runCount: 9 },
      { taskId: "R3-T3" },
      { authorized: false },
    ]) {
      expect(() => verifyR3OwnerAuthorization({
        authorization: { ...authorization, ...mutation },
        preregistrationHash,
      })).toThrowError("R3_T4_OWNER_AUTHORIZATION_INVALID");
    }
  });

  test("requires the exact ten-file transitive source binding set", () => {
    expect(R3_RUNTIME_SOURCE_PATHS).toHaveLength(10);
    expect(R3_RUNTIME_SOURCE_PATHS).toContain("scripts/pilot/r2-capsule.mjs");
    expect([...R3_RUNTIME_SOURCE_PATHS].sort()).toEqual(
      [...R3_PREREGISTERED_RUNTIME_SOURCE_PATHS].sort(),
    );
    const bindings = Object.fromEntries(R3_RUNTIME_SOURCE_PATHS.map((path) => [
      path,
      sha256(readFileSync(resolve(path))),
    ]));
    expect(verifyR3BoundSources(bindings)).toEqual({
      valid: true,
      sourceCount: 10,
      instrumentationHash: canonicalSha256(bindings),
    });
    const missing = { ...bindings };
    delete missing["scripts/pilot/r2-capsule.mjs"];
    expect(() => verifyR3BoundSources(missing))
      .toThrowError("R3_T4_SOURCE_BINDINGS_INVALID");
    expect(() => verifyR3BoundSources({
      ...bindings,
      "scripts/pilot/r3-t4.mjs": "0".repeat(64),
    })).toThrowError("R3_T4_BOUND_SOURCE_CHANGED");
  });

  test("verifies the complete digest and rejects any frozen mutation", () => {
    const preregistration = createUnitPreregistration();
    const hash = readFileSync(
      join(preregistration, "PREREGISTRATION.sha256"),
      "utf8",
    ).trim();
    expect(verifyR3Preregistration(preregistration, {
      requirePermissionProbes: false,
    })).toBe(hash);
    writeFileSync(
      join(
        preregistration,
        "participant/tasks/r3-audit-01-containment-heading/prompt.txt",
      ),
      "mutated after freeze\n",
    );
    expect(() => verifyR3Preregistration(preregistration, {
      requirePermissionProbes: false,
    })).toThrowError("R3_T4_PREREGISTRATION_CHANGED");
  });

  test("fails closed on a legacy or incomplete permission boundary", () => {
    const invocation = {
      executable: "/usr/bin/bwrap",
      args: [
        "--ro-bind", "/private/auth", "/codex-home/auth.json",
        "--ro-bind", "/private/profile", "/codex-home/r3-capsule.config.toml",
        "/opt/codex/bin/codex", "exec",
        "--strict-config", "--profile", "r3-capsule",
        "--output-last-message", "/run/vem/final-response.json",
      ],
      evidence: {
        innerCodexSandbox: "permission-profile:r3-capsule",
        generatedCommandApproval: "never",
        generatedCommandAuthAccess: "deny",
        generatedCommandWorkspaceAccess: "read",
        generatedCommandRuntimeAccess: "/opt/codex:read",
        generatedCommandNetwork: "disabled",
        generatedCommandEnvironment: "clean-fixed-non-secret",
        authoritativeResponseMount:
          "/run/vem/final-response.json:rw-single-file",
      },
    };
    expect(verifyR3InvocationBoundary(invocation)).toMatchObject({
      valid: true,
      permissionProfileBindingPassed: true,
      authBoundaryPassed: true,
    });
    expect(() => verifyR3InvocationBoundary({
      ...invocation,
      args: [...invocation.args, "-s", "read-only"],
    })).toThrowError("R3_T4_PERMISSION_BOUNDARY_UNSUPPORTED");
    expect(() => verifyR3InvocationBoundary({
      ...invocation,
      evidence: {
        ...invocation.evidence,
        generatedCommandAuthAccess: "read",
      },
    })).toThrowError("R3_T4_PERMISSION_BOUNDARY_UNSUPPORTED");
  });

  test("maps direct and VEM ground truth without misclassifying direct null anchors", () => {
    const groundTruth = {
      schemaVersion: "R3-T3-ground-truth-v1",
      taskId: "r3-audit-01-containment-heading",
      expectedRelativeFile: "packages/demo-fixture/src/App.tsx",
      expectedLine: 11,
      expectedSourceAnchorId: `vem1_${"a".repeat(32)}`,
    };
    expect(buildR3ResponseGroundTruth(groundTruth, "direct-search")).toEqual({
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 11,
      sourceAnchorId: null,
    });
    expect(buildR3ResponseGroundTruth(groundTruth, "vem-assisted")).toEqual({
      relativeFile: "packages/demo-fixture/src/App.tsx",
      line: 11,
      sourceAnchorId: `vem1_${"a".repeat(32)}`,
    });
  });

  test("requires a current no-model permission probe before external work", () => {
    const preregistration = createUnitPreregistration();
    const result = runR3CurrentPermissionPreflight({
      preregistrationRoot: preregistration,
      taskId: "r3-audit-01-containment-heading",
      permissionProbeRunner: () => successfulPermissionProbe(),
    });
    expect(result).toMatchObject({
      ok: true,
      modelCall: false,
      networkPolicyConfiguredDisabled: true,
      networkRuntimeProbed: false,
      scope: "current-codex-binary-and-r3-profile-before-external-batch",
    });
    expect(() => runR3CurrentPermissionPreflight({
      preregistrationRoot: preregistration,
      taskId: "r3-audit-01-containment-heading",
      permissionProbeRunner: () => ({
        ...successfulPermissionProbe(),
        authReadable: true,
      }),
    })).toThrowError("R3_T4_PERMISSION_PREFLIGHT_FAILED");
  });

  test("evaluates a normal complete batch with aggregate integrity bound", () => {
    const batchRoot = temporaryRoot("vem-r3-t4-complete-batch-");
    const evaluationRuns = successfulEvaluationRuns();
    const sealed = sealR3FrozenBatch({
      batchRoot,
      finalizedRuns: evaluationRuns.map((run) => ({
        runId: run.runId,
        outcome: "success",
        evidenceSealed: true,
      })),
      evaluationRuns,
      totalSetupDurationNs: "0",
      expectedInstrumentationHash: "c".repeat(64),
      preregistrationCheck: () => true,
    });
    expect(sealed).toMatchObject({
      evaluatorCompleted: true,
      verdict: {
        schemaVersion: "R3-T4-verdict-v1",
        verdict: "continue",
        stopReasons: [],
        adjustReasons: [],
      },
      batch: {
        batchStopped: false,
        evidenceSealed: true,
        completedRunCount: 10,
        remainingRunCount: 0,
      },
    });
  });

  test("contains aggregate evaluator exceptions and returns a sealed stop", () => {
    const batchRoot = temporaryRoot("vem-r3-t4-batch-");
    const sealed = sealR3FrozenBatch({
      batchRoot,
      finalizedRuns: [],
      evaluationRuns: [],
      totalSetupDurationNs: "0",
      expectedInstrumentationHash: "c".repeat(64),
      preregistrationCheck: () => true,
      evaluate() {
        throw new Error("R3_TEST_AGGREGATE_THROW");
      },
    });
    expect(sealed).toMatchObject({
      evaluatorCompleted: false,
      verdict: {
        schemaVersion: "R3-T4-verdict-v1",
        decisionKey: "R3-RECOVERY",
        verdict: "stop",
        stopReasons: ["aggregate-integrity-failed"],
      },
      batch: {
        batchStopped: true,
        evidenceSealed: true,
        completedRunCount: 0,
        remainingRunCount: 10,
      },
    });
    expect(readJson(
      join(batchRoot, "r3-batch-terminal/aggregate-errors.json"),
    )).toMatchObject({
      errorCount: 1,
      rawMessagesPersisted: false,
    });
    expect(readFileSync(join(batchRoot, "R3-BATCH-SHA256SUMS"), "utf8"))
      .toContain("r3-batch-terminal/batch-terminal.json");
  });
});

function createUnitPreregistration() {
  const root = temporaryRoot("vem-r3-t4-prereg-");
  const output = join(root, "frozen");
  prepareR3RecoveryPreregistration({
    outputRoot: output,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  return output;
}

function temporaryRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function successfulPermissionProbe() {
  return {
    ok: true,
    modelCall: false,
    workspaceReadable: true,
    workspaceWritable: false,
    authReadable: false,
    procEnvironmentReadable: true,
    procEnvironmentSensitiveValuesAbsent: true,
    networkPolicyConfiguredDisabled: true,
    networkRuntimeProbed: false,
  };
}

function successfulEvaluationRuns() {
  const tasks = [
    "r3-audit-01-containment-heading",
    "r3-audit-02-discovery-warning",
    "r3-audit-03-profile-status",
    "r3-audit-04-seal-code",
    "r3-audit-05-evidence-control",
  ];
  return tasks.flatMap((taskId, taskIndex) => (
    ["direct-search", "vem-assisted"].map((arm, armIndex) => ({
      runId: `${taskId}-${armIndex + 1}-${arm}`,
      taskId,
      arm,
      exitCode: 0,
      threadId: `thread-${taskIndex}-${armIndex}`,
      receiptDurationNs: arm === "direct-search" ? "300" : "100",
      instrumentationHash: "c".repeat(64),
      preregistrationHashChanged: false,
      groundTruthVisible: false,
      holdoutConsumed: false,
      priorTaskOrPromptReused: false,
      capsuleIntegrityPassed: true,
      capsuleAudit: "passed",
      permissionProfileProbePassed: true,
      permissionProfileBindingPassed: true,
      authBoundaryPassed: true,
      protocolFailure: false,
      successfulResponseComplete: true,
      evaluationIntegrityPassed: true,
      recorderEvidenceValid: true,
      evidenceSealed: true,
      evidenceHashesValid: true,
      failureEvidenceSealedBeforeReturn: true,
      exceptionEvidenceSealedBeforeReturn: true,
      attribution: "correct",
      wrongAttribution: false,
      responseMatchesGroundTruth: true,
      vemDirectPrimaryMatch: arm === "vem-assisted" ? true : null,
    }))
  ));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
