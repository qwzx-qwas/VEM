import { describe, expect, test } from "vitest";
import { buildR6T2Proof } from "./prove-r6-t2.mjs";

const PROBE_SUCCESS = "R3_PERMISSION_PROFILE_PROBE=passed";

describe("R6-T2 local invocation compatibility proof", () => {
  test("binds fixed env, shared predicate and zero-model permission evidence", () => {
    let processCalls = 0;
    const proof = buildR6T2Proof(undefined, {
      spawn(_executable, args, options) {
        processCalls += 1;
        expect(args).not.toContain("exec");
        expect(args).not.toContain("--json");
        expect(options.env).toEqual({ PATH: "/usr/bin:/bin" });
        return {
          error: undefined,
          status: 0,
          stdout: PROBE_SUCCESS,
          stderr: "",
        };
      },
    });
    expect(processCalls).toBe(1);
    expect(proof).toMatchObject({
      taskId: "R6-T2",
      outcome: "passed",
      compatibility: {
        ok: true,
        terminalizerInvocationPredicatePassed: true,
        outerEnvironment: { PATH: "/usr/bin:/bin" },
        outerEnvironmentHash:
          "cf24c3c5e349e230a9c04223dceb4854bd377915e21f46d830134b085bc3579d",
        outerEnvironmentInheritedFromHost: false,
        outerEnvironmentSensitiveEntryCount: 0,
        permissionProfilePassed: true,
        workspaceWritable: false,
        authReadableToGeneratedCommands: false,
        providerNetworkProbed: false,
        modelCall: false,
      },
      executionBoundary: {
        participantProcessSpawned: false,
        providerRequestSent: false,
        providerNetworkProbed: false,
        externalProcessCount: 0,
        externalModelCall: false,
      },
      preservedEvidence: {
        r4InterruptionHash:
          "95021eac99d93d49985ee46d003a4108ff7a524244d83e3521b8edff8ecffd70",
        r5VerdictHash:
          "c04a6631b6285735fa3ff1da0d576e31b1a85b3fbc981a69c25aa4cb27b0a016",
        r4BlockedPendingPreserved: true,
        r5StopPreserved: true,
      },
    });
    expect(Object.keys(proof.sourceBindings)).toEqual([
      "scripts/pilot/capsule.mjs",
      "scripts/pilot/r2-capsule.mjs",
      "scripts/pilot/r3-capsule.mjs",
      "scripts/pilot/r5-process-terminalizer.mjs",
      "scripts/pilot/r6-invocation-preflight.mjs",
    ]);
  });

  test("fails closed when permission/auth isolation does not pass", () => {
    expect(() => buildR6T2Proof(undefined, {
      spawn() {
        return {
          error: undefined,
          status: 2,
          stdout: "",
          stderr: "permission profile unsupported",
        };
      },
    })).toThrowError("R3_CAPSULE_PERMISSION_PROFILE_PROBE_FAILED");
  });
});
