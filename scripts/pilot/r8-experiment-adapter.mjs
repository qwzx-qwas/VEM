import { createHash } from "node:crypto";

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const PRODUCT_FORBIDDEN_KEYS = new Set([
  "client",
  "clientid",
  "destination",
  "model",
  "modelid",
  "provider",
  "providerid",
]);
const MODEL_ID = /\b(?:gpt-[A-Za-z0-9.-]+|claude-[A-Za-z0-9.-]+|gemini-[A-Za-z0-9.-]+)\b/u;

export function createR8ExperimentDescriptor(input) {
  requirePlainObject(input, "R8_EXPERIMENT_CONFIG_INVALID");
  const keys = Object.keys(input).sort();
  if (canonicalJson(keys) !== canonicalJson(["client", "destination", "model"])) {
    throw new Error("R8_EXPERIMENT_CONFIG_INVALID");
  }
  for (const value of Object.values(input)) {
    if (typeof value !== "string" || !TOKEN.test(value)) {
      throw new Error("R8_EXPERIMENT_CONFIG_INVALID");
    }
  }
  const identity = Object.freeze({
    client: input.client,
    destination: input.destination,
    model: input.model,
  });
  return Object.freeze({
    schemaVersion: "R8-T2-experiment-descriptor-v1",
    boundary: "experiment-only",
    identity,
    identityHash: sha256(canonicalJson(identity)),
    productCompatibilityClaim: false,
    productRuntimeInput: false,
  });
}

export function createR8ParticipantAdapter({ experiment }) {
  const descriptor = requireDescriptor(experiment);
  return Object.freeze({
    schemaVersion: "R8-T2-participant-adapter-v1",
    boundary: "experiment-only",
    prepare({ participantPayload, productRuntime }) {
      assertR8ProductRuntimeModelAgnostic(productRuntime);
      requirePlainObject(participantPayload, "R8_PARTICIPANT_PAYLOAD_INVALID");
      const payload = globalThis.structuredClone(participantPayload);
      return Object.freeze({
        schemaVersion: "R8-T2-participant-request-v1",
        experiment: descriptor,
        participantPayload: deepFreeze(payload),
        productRuntimeForwarded: false,
        externalExecutionAuthorized: false,
      });
    },
  });
}

export function assertR8ProductRuntimeModelAgnostic(value) {
  requirePlainObject(value, "R8_PRODUCT_RUNTIME_CONFIG_INVALID");
  visitProductValue(value, new Set());
  return true;
}

function visitProductValue(value, seen) {
  if (typeof value === "string") {
    if (MODEL_ID.test(value)) throw new Error("R8_PRODUCT_MODEL_ID_FORBIDDEN");
    return;
  }
  if (value === null || ["boolean", "number"].includes(typeof value)) return;
  if (typeof value !== "object" || seen.has(value)) {
    throw new Error("R8_PRODUCT_RUNTIME_CONFIG_INVALID");
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => visitProductValue(entry, seen));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.replace(/[-_]/gu, "").toLowerCase();
    if (PRODUCT_FORBIDDEN_KEYS.has(normalized)) {
      throw new Error("R8_PRODUCT_MODEL_FIELD_FORBIDDEN");
    }
    visitProductValue(entry, seen);
  }
}

function requireDescriptor(value) {
  if (value?.schemaVersion !== "R8-T2-experiment-descriptor-v1"
    || value.boundary !== "experiment-only"
    || value.productCompatibilityClaim !== false
    || value.productRuntimeInput !== false
    || typeof value.identityHash !== "string"
    || value.identityHash !== sha256(canonicalJson(value.identity))) {
    throw new Error("R8_EXPERIMENT_DESCRIPTOR_INVALID");
  }
  return value;
}

function requirePlainObject(value, code) {
  if (typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(code);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
