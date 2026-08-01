import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildR3T2Proof } from "./prove-r3-t2.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R3-T2 local capsule-audit containment proof", () => {
  test("replays R2, seals every exception class and uses no model", async () => {
    const root = mkdtempSync(join(tmpdir(), "vem-r3-t2-proof-test-"));
    roots.push(root);
    const proof = await buildR3T2Proof({
      outputRoot: join(root, "evidence"),
      enforceEvidenceParent: false,
      permissionProbeRunner: () => ({
        ok: true,
        modelCall: false,
        workspaceReadable: true,
        workspaceWritable: false,
        authReadable: false,
        procEnvironmentReadable: true,
        procEnvironmentSensitiveValuesAbsent: true,
        networkPolicyConfiguredDisabled: true,
        networkRuntimeProbed: false,
      }),
    });

    expect(proof).toMatchObject({
      taskId: "R3-T2",
      outcome: "passed",
      externalModelCalls: 0,
      r2ImmutableReplay: {
        attemptedDiscoveryWarningCount: 1,
        warningNonAuthorizing: true,
        observedForbiddenRulePathCount: 0,
        observedExternalPathCount: 0,
        immutableR2VerdictPreserved: true,
      },
      containment: {
        rawFinalTerminalLedgerAndHashOnSuccess: true,
        recorderManifestPreservedAcrossAllRuns: true,
        exceptionChecks: {
          audit: true,
          evaluator: true,
          hash: true,
          aggregate: true,
        },
        structuredBatchStop: true,
      },
      markerSemantics: {
        agentsMarkerOnlyWarning: true,
        skillMarkerOnlyWarning: true,
        combinedMarkerWarning: true,
        observedSkillPathFailsClosed: true,
      },
      securityBoundary: {
        realCredentialsUsed: false,
      },
    });
    expect(readFileSync(join(root, "evidence/SHA256SUMS"), "utf8"))
      .toContain("proof.json");
  });
});
