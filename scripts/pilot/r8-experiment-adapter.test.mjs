import { describe, expect, test } from "vitest";
import {
  assertR8ProductRuntimeModelAgnostic,
  createR8ExperimentDescriptor,
  createR8ParticipantAdapter,
} from "./r8-experiment-adapter.mjs";

function descriptor() {
  return createR8ExperimentDescriptor({
    client: "fixture-client",
    destination: "fixture-destination",
    model: "fixture-model",
  });
}

describe("R8 experiment-only participant adapter", () => {
  test("keeps client model and destination in experiment metadata", () => {
    const experiment = descriptor();
    const request = createR8ParticipantAdapter({ experiment }).prepare({
      participantPayload: { capsuleId: "capsule-01", promptId: "prompt-01" },
      productRuntime: { capabilityReport: { protocolRevision: "fixture-v1" } },
    });
    expect(request).toMatchObject({
      experiment: {
        boundary: "experiment-only",
        identity: {
          client: "fixture-client",
          destination: "fixture-destination",
          model: "fixture-model",
        },
        productCompatibilityClaim: false,
        productRuntimeInput: false,
      },
      participantPayload: { capsuleId: "capsule-01", promptId: "prompt-01" },
      productRuntimeForwarded: false,
      externalExecutionAuthorized: false,
    });
    expect(Object.isFrozen(request.participantPayload)).toBe(true);
  });

  test.each([
    { model: "fixture-model" },
    { model_id: "fixture-model" },
    { provider: "fixture-provider" },
    { nested: { destination: "fixture-destination" } },
  ])("rejects experiment identity field in product runtime: %j", (productRuntime) => {
    expect(() => assertR8ProductRuntimeModelAgnostic(productRuntime))
      .toThrowError("R8_PRODUCT_MODEL_FIELD_FORBIDDEN");
  });

  test("rejects a concrete model identity hidden in a product string", () => {
    expect(() => assertR8ProductRuntimeModelAgnostic({
      note: "requires gpt-fixture-1",
    })).toThrowError("R8_PRODUCT_MODEL_ID_FORBIDDEN");
  });

  test("accepts model-agnostic MCP capability metadata", () => {
    expect(assertR8ProductRuntimeModelAgnostic({
      protocolRevision: "2025-06-18",
      tools: ["selection.get", "verification.complete"],
      capabilityReport: { tasks: false, resources: true },
    })).toBe(true);
  });

  test("requires an exact minimal experiment descriptor shape", () => {
    expect(() => createR8ExperimentDescriptor({
      client: "fixture-client",
      destination: "fixture-destination",
      model: "fixture-model",
      token: "must-not-be-recorded",
    })).toThrowError("R8_EXPERIMENT_CONFIG_INVALID");
  });
});
