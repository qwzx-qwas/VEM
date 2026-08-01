import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { realpathSync } from "node:fs";
import {
  assertIntendedCapsuleDifference,
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import { buildR3CodexCapsuleInvocation } from "./r3-capsule.mjs";

const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const ARMS = new Set(["direct-search", "vem-assisted"]);
const states = new WeakMap();

export function createR7AttemptFactory({
  sourceRoot,
  responseSchemaPath,
  model,
  authFile,
  codexInstallRoot,
  temporaryBase,
  cleanup = cleanupParticipantCapsule,
}) {
  if (typeof cleanup !== "function") throw new Error("R7_ATTEMPT_FACTORY_INVALID");
  const attemptKeys = new Set();
  const resourcePaths = new Set();
  const taskBoundaries = new Map();

  const prepare = ({ taskId, arm, attemptNumber, prompt, vemContextPath }) => {
    if (!ID.test(taskId ?? "")
      || !ARMS.has(arm)
      || !Number.isSafeInteger(attemptNumber)
      || attemptNumber < 1
      || attemptNumber > 2
      || typeof prompt !== "string"
      || prompt.length < 1
      || prompt.length > 8_192
      || ((arm === "vem-assisted") !== (vemContextPath !== undefined))) {
      throw new Error("R7_ATTEMPT_REQUEST_INVALID");
    }
    const attemptKey = `${taskId}:${arm}:${attemptNumber}`;
    if (attemptKeys.has(attemptKey)) throw new Error("R7_ATTEMPT_ALREADY_PREPARED");

    const capsule = createParticipantCapsule({
      sourceRoot,
      taskId,
      arm,
      responseSchemaPath,
      vemContextPath,
      ...(temporaryBase === undefined ? {} : { temporaryBase }),
    });
    try {
      const invocation = buildR3CodexCapsuleInvocation({
        capsule,
        prompt,
        model,
        authFile,
        codexInstallRoot,
      });
      const resources = Object.freeze({
        capsuleRoot: realpathSync(capsule.capsuleRoot),
        controlRoot: realpathSync(capsule.controlRoot),
        workspaceRoot: realpathSync(capsule.workspaceRoot),
        permissionProfilePath: realpathSync(invocation.permissionProfilePath),
        authoritativeResponsePath: realpathSync(invocation.authoritativeResponsePath),
      });
      for (const path of Object.values(resources)) {
        if (resourcePaths.has(path)) throw new Error("R7_ATTEMPT_RESOURCE_REUSED");
      }
      const boundary = Object.freeze({
        baseContextHash: capsule.manifest.baseContextHash,
        promptHash: sha256(prompt),
        treatmentHash: capsule.manifest.treatmentHash,
      });
      const taskBoundary = taskBoundaries.get(taskId);
      if (taskBoundary === undefined) {
        taskBoundaries.set(taskId, boundary);
      } else if (taskBoundary.baseContextHash !== boundary.baseContextHash
        || taskBoundary.promptHash !== boundary.promptHash
        || (arm === "vem-assisted"
          && taskBoundary.treatmentHash !== null
          && taskBoundary.treatmentHash !== boundary.treatmentHash)) {
        throw new Error("R7_ATTEMPT_BOUNDARY_DRIFT");
      } else if (arm === "vem-assisted" && taskBoundary.treatmentHash === null) {
        taskBoundaries.set(taskId, Object.freeze({
          ...taskBoundary,
          treatmentHash: boundary.treatmentHash,
        }));
      }
      attemptKeys.add(attemptKey);
      Object.values(resources).forEach((path) => resourcePaths.add(path));
      const handle = Object.freeze({
        schemaVersion: "R7-T2-attempt-handle-v1",
        attemptKey,
        taskId,
        arm,
        attemptNumber,
        capsule,
        invocation,
        resources,
        boundary,
      });
      states.set(handle, {
        phase: "prepared",
        processStarted: false,
        evidenceSealed: false,
        cleaned: false,
        cleanupFailed: false,
        terminal: null,
        cleanup,
      });
      return handle;
    } catch (error) {
      cleanup(capsule);
      throw error;
    }
  };

  return Object.freeze({
    schemaVersion: "R7-T2-attempt-factory-v1",
    prepare,
    comparePair: assertR7AttemptPair,
    snapshot: snapshotR7Attempt,
  });
}

export function assertR7AttemptPair(direct, vem) {
  requireHandle(direct);
  requireHandle(vem);
  if (direct.taskId !== vem.taskId
    || direct.attemptNumber !== vem.attemptNumber
    || direct.arm !== "direct-search"
    || vem.arm !== "vem-assisted"
    || direct.boundary.promptHash !== vem.boundary.promptHash) {
    throw new Error("R7_ATTEMPT_PAIR_INVALID");
  }
  const difference = assertIntendedCapsuleDifference(
    direct.capsule.manifest,
    vem.capsule.manifest,
  );
  return Object.freeze({
    valid: true,
    taskId: direct.taskId,
    attemptNumber: direct.attemptNumber,
    baseContextHash: difference.baseContextHash,
    promptHash: direct.boundary.promptHash,
    onlyDifference: difference.onlyDifference,
    treatmentHash: difference.vemContextHash,
  });
}

export function markR7AttemptProcessStarted(handle) {
  const state = requireHandle(handle);
  if (state.phase !== "prepared" || state.processStarted) {
    throw new Error("R7_ATTEMPT_START_INVALID");
  }
  state.phase = "running";
  state.processStarted = true;
  return snapshotR7Attempt(handle);
}

export function sealR7Attempt(handle, terminal) {
  const state = requireHandle(handle);
  if (state.phase !== "running"
    || state.evidenceSealed
    || !validTerminal(terminal)) {
    throw new Error("R7_ATTEMPT_SEAL_INVALID");
  }
  state.phase = "sealed";
  state.evidenceSealed = true;
  state.terminal = Object.freeze({ ...terminal });
  return snapshotR7Attempt(handle);
}

export function containR7UnspawnedAttempt(handle, failureCode) {
  const state = requireHandle(handle);
  if (state.phase !== "prepared"
    || state.processStarted
    || !/^[A-Z][A-Z0-9_]{1,63}$/u.test(failureCode ?? "")) {
    throw new Error("R7_UNSPAWNED_CONTAINMENT_INVALID");
  }
  state.phase = "sealed-unspawned";
  state.evidenceSealed = true;
  state.terminal = Object.freeze({
    runId: null,
    classification: "not-spawned",
    failureCode,
    processTreeTerminated: true,
    streamsSealed: true,
    finalObservationSealed: true,
    ledgerSealed: true,
    boundarySealed: true,
    manifestsSealed: true,
  });
  return snapshotR7Attempt(handle);
}

export function cleanupR7Attempt(handle) {
  const state = requireHandle(handle);
  if (!state.evidenceSealed || state.cleaned || state.cleanupFailed) {
    throw new Error("R7_ATTEMPT_CLEANUP_INVALID");
  }
  try {
    state.cleanup(handle.capsule);
    if (existsSync(handle.resources.capsuleRoot)) {
      throw new Error("R7_ATTEMPT_CAPSULE_REMAINS");
    }
    state.phase = "cleaned";
    state.cleaned = true;
  } catch {
    state.phase = "cleanup-failed";
    state.cleanupFailed = true;
    throw new Error("R7_ATTEMPT_CLEANUP_FAILED");
  }
  return snapshotR7Attempt(handle);
}

export function snapshotR7Attempt(handle) {
  const state = requireHandle(handle);
  return Object.freeze({
    schemaVersion: "R7-T2-attempt-lifecycle-v1",
    attemptKey: handle.attemptKey,
    taskId: handle.taskId,
    arm: handle.arm,
    attemptNumber: handle.attemptNumber,
    phase: state.phase,
    processStarted: state.processStarted,
    evidenceSealed: state.evidenceSealed,
    cleaned: state.cleaned,
    cleanupFailed: state.cleanupFailed,
    resourceIdentityHash: sha256(canonicalJson(handle.resources)),
    baseContextHash: handle.boundary.baseContextHash,
    promptHash: handle.boundary.promptHash,
    treatmentHash: handle.boundary.treatmentHash,
    terminal: state.terminal,
  });
}

function validTerminal(value) {
  return typeof value === "object"
    && value !== null
    && ID.test(value.runId ?? "")
    && typeof value.classification === "string"
    && value.classification.length > 0
    && /^[A-Z][A-Z0-9_]{1,63}$/u.test(value.failureCode ?? "")
    && value.processTreeTerminated === true
    && value.streamsSealed === true
    && value.finalObservationSealed === true
    && value.ledgerSealed === true
    && value.boundarySealed === true
    && value.manifestsSealed === true;
}

function requireHandle(handle) {
  const state = states.get(handle);
  if (state === undefined) throw new Error("R7_ATTEMPT_HANDLE_INVALID");
  return state;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
