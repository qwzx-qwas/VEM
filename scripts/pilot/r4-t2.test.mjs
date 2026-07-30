import { describe, expect, test } from "vitest";
import {
  buildR4TransportProof,
} from "./r4-t2.mjs";

describe("R4-T2 immutable R3 timeout replay", () => {
  test("classifies the sealed R3 request timeout narrowly and plans one retry", () => {
    const proof = buildR4TransportProof({
      localPreflightRunner: () => ({
        schemaVersion: "R4-T2-local-transport-preflight-v1",
        ok: true,
        modelCall: false,
        networkRuntimeProbed: false,
        providerReachabilityClaimed: false,
        permissionProfilePassed: true,
      }),
    });
    expect(proof).toMatchObject({
      taskId: "R4-T2",
      outcome: "passed",
      externalModelCallCount: 0,
      r3Input: {
        verdictHash:
          "7a3e5b6bf94067e4681258982690afe911c51dc3da0e6cc4af66d069d537d95b",
      },
      replay: {
        classification: {
          kind: "external-transport-timeout-before-response",
          retryable: true,
        },
        sealedAttempt: {
          evidenceSealed: true,
          attemptNumber: 1,
        },
        retryDecision: {
          action: "retry",
          nextAttemptNumber: 2,
          maxRetriesPerArm: 1,
          maxProcessAttempts: 20,
        },
      },
    });
  });

  test("rejects a preflight that claims unperformed network reachability", () => {
    expect(() => buildR4TransportProof({
      localPreflightRunner: () => ({
        modelCall: false,
        networkRuntimeProbed: true,
        providerReachabilityClaimed: true,
      }),
    })).toThrowError("R4_T2_PREFLIGHT_INVALID");
  });
});
