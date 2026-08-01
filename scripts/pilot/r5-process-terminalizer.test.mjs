import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  classifyR5TerminalConsistency,
  executeR5BoundedProcess,
  installR5SignalForwarding,
  verifyR5EvidenceManifest,
} from "./r5-process-terminalizer.mjs";

const roots = [];
const HASH = "a".repeat(64);

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R5 process terminalizer", () => {
  test("seals a normal response after process and streams close", async () => {
    const root = makeRoot();
    const finalPath = join(root, "final.json");
    const result = await executeR5BoundedProcess({
      invocation: nodeInvocation(`
        process.stdout.write('{"type":"turn.completed"}\\n');
        process.stderr.write('bounded diagnostic\\n');
        require("node:fs").writeFileSync(
          process.env.R5_FINAL_PATH,
          '{"ok":true}\\n',
          { mode: 0o600 },
        );
      `, { R5_FINAL_PATH: finalPath }),
      outputRoot: join(root, "run"),
      runId: "r5-normal",
      instrumentationHash: HASH,
      finalResponsePath: finalPath,
      terminationPolicy: policy({ deadlineMs: 2_000 }),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
    });

    expect(result).toMatchObject({
      outcome: "success",
      deadlineExpired: false,
      processTreeTerminated: true,
      evidenceSealed: true,
      providerTurnFailedObserved: false,
    });
    expect(readFileSync(join(root, "run/stdout.jsonl"), "utf8"))
      .toContain('"turn.completed"');
    expect(readFileSync(join(root, "run/stderr.txt"), "utf8"))
      .toBe("bounded diagnostic\n");
    expect(readJson(join(root, "run/final-response-observation.json")))
      .toMatchObject({ status: "captured" });
    expect(verifyR5EvidenceManifest(join(root, "run"))).toBe(true);
  });

  test("terminates a child and grandchild process group at the deadline", async () => {
    const root = makeRoot();
    const childPidPath = join(root, "grandchild.pid");
    const result = await executeR5BoundedProcess({
      invocation: nodeInvocation(`
        const { spawn } = require("node:child_process");
        const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
          stdio: ["ignore", "ignore", "ignore"],
        });
        require("node:fs").writeFileSync(process.env.R5_CHILD_PID, String(child.pid));
        process.stdout.write('{"type":"thread.started"}\\n');
        setInterval(() => {}, 1000);
      `, { R5_CHILD_PID: childPidPath }),
      outputRoot: join(root, "run"),
      runId: "r5-deadline",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "missing-final.json"),
      terminationPolicy: policy(),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
    });

    const grandchildPid = Number(readFileSync(childPidPath, "utf8"));
    expect(result).toMatchObject({
      outcome: "terminated",
      deadlineExpired: true,
      processTreeTerminated: true,
      gracefulSignalSent: true,
      evidenceSealed: true,
      providerTurnFailedObserved: false,
    });
    expect(processExists(grandchildPid)).toBe(false);
    expect(readJson(join(root, "run/termination.json"))).toMatchObject({
      trigger: "wall-clock-deadline",
      providerTerminalInvented: false,
      processGroupEmptyAfterTermination: true,
    });
    expect(verifyR5EvidenceManifest(join(root, "run"))).toBe(true);
  });

  test("escalates to force kill when the process ignores SIGTERM", async () => {
    const root = makeRoot();
    const result = await executeR5BoundedProcess({
      invocation: nodeInvocation(`
        process.on("SIGTERM", () => {});
        process.stdout.write('{"type":"thread.started"}\\n');
        setInterval(() => {}, 1000);
      `),
      outputRoot: join(root, "run"),
      runId: "r5-force",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "missing-final.json"),
      terminationPolicy: policy({ graceMs: 30 }),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
    });

    expect(result).toMatchObject({
      outcome: "terminated",
      deadlineExpired: true,
      gracefulSignalSent: true,
      forceSignalSent: true,
      processTreeTerminated: true,
      evidenceSealed: true,
    });
  });

  test("seals AbortSignal cancellation and signal forwarding before return", async () => {
    const root = makeRoot();
    const controller = new globalThis.AbortController();
    const processLike = fakeProcess();
    const removeForwarding = installR5SignalForwarding({
      controller,
      processLike,
    });
    const pending = executeR5BoundedProcess({
      invocation: nodeInvocation("setInterval(() => {}, 1000);"),
      outputRoot: join(root, "run"),
      runId: "r5-cancel",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "missing-final.json"),
      terminationPolicy: policy({ deadlineMs: 2_000 }),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
      signal: controller.signal,
    });
    processLike.emit("SIGINT");
    const result = await pending;
    removeForwarding();

    expect(result).toMatchObject({
      outcome: "cancelled",
      cancellationReason: "outer-signal-SIGINT",
      processTreeTerminated: true,
      evidenceSealed: true,
    });
    expect(processLike.listenerCount("SIGINT")).toBe(0);
    expect(processLike.listenerCount("SIGTERM")).toBe(0);
  });

  test("seals audit and evaluator exceptions as independent failures", async () => {
    const root = makeRoot();
    const result = await executeR5BoundedProcess({
      invocation: nodeInvocation("process.stdout.write('{}\\n');"),
      outputRoot: join(root, "run"),
      runId: "r5-stage-errors",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "missing-final.json"),
      terminationPolicy: policy({ deadlineMs: 2_000 }),
      permissionState: passedPermission(),
      audit() { throw new Error("R5_TEST_AUDIT_THROW"); },
      evaluate() { throw new Error("R5_TEST_EVALUATOR_THROW"); },
    });

    expect(result).toMatchObject({
      outcome: "failed",
      processTreeTerminated: true,
      evidenceSealed: true,
    });
    expect(result.failureCodes).toEqual(expect.arrayContaining([
      "R5_TEST_AUDIT_THROW",
      "R5_TEST_EVALUATOR_THROW",
    ]));
    expect(readJson(join(root, "run/boundary-state.json"))).toMatchObject({
      audit: { status: "exception" },
      evaluator: { status: "exception" },
    });
    expect(verifyR5EvidenceManifest(join(root, "run"))).toBe(true);
  });

  test("seals a missing final response and a launch exception before return", async () => {
    const root = makeRoot();
    const missingFinal = await executeR5BoundedProcess({
      invocation: nodeInvocation("process.stdout.write('{}\\n');"),
      outputRoot: join(root, "missing-final-run"),
      runId: "r5-missing-final",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "missing-final.json"),
      terminationPolicy: policy({ deadlineMs: 2_000 }),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
    });
    const launchFailure = await executeR5BoundedProcess({
      invocation: {
        ...nodeInvocation(""),
        executable: join(root, "does-not-exist"),
      },
      outputRoot: join(root, "launch-failure-run"),
      runId: "r5-launch-failure",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "missing-launch-final.json"),
      terminationPolicy: policy({ deadlineMs: 2_000 }),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
    });

    expect(missingFinal).toMatchObject({
      outcome: "failed",
      processTreeTerminated: true,
      evidenceSealed: true,
    });
    expect(missingFinal.failureCodes).toContain("R5_FINAL_RESPONSE_MISSING");
    expect(readJson(join(
      root,
      "missing-final-run/final-response-observation.json",
    ))).toMatchObject({ status: "missing" });
    expect(launchFailure).toMatchObject({
      outcome: "failed",
      processTreeTerminated: true,
      evidenceSealed: true,
    });
    expect(readJson(join(
      root,
      "launch-failure-run/termination.json",
    ))).toMatchObject({
      process: { launchFailed: true },
    });
    expect(verifyR5EvidenceManifest(
      join(root, "launch-failure-run"),
    )).toBe(true);
  });

  test("fails closed if process-group inspection reports an orphan", async () => {
    const root = makeRoot();
    const result = await executeR5BoundedProcess({
      invocation: nodeInvocation("process.stdout.write('{}\\n');"),
      outputRoot: join(root, "run"),
      runId: "r5-orphan",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "missing-final.json"),
      terminationPolicy: policy({ deadlineMs: 2_000 }),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
      processGroupAdapter: {
        signal(groupId, signal) {
          process.kill(-groupId, signal);
        },
        isEmpty() {
          return false;
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "failed",
      processTreeTerminated: false,
      evidenceSealed: true,
    });
    expect(result.failureCodes).toContain("R5_PROCESS_GROUP_NOT_EMPTY");
    expect(verifyR5EvidenceManifest(join(root, "run"))).toBe(true);
  });

  test("classifies contradictory terminal observations as integrity failures", () => {
    expect(classifyR5TerminalConsistency({
      terminal: {
        exitCode: 0,
        signal: "SIGTERM",
        launchFailed: false,
      },
      processGroupEmpty: true,
    })).toEqual({
      valid: false,
      contradictory: true,
      failureCode: "R5_TERMINAL_OBSERVATION_CONTRADICTION",
    });
    expect(classifyR5TerminalConsistency({
      terminal: {
        exitCode: null,
        signal: null,
        launchFailed: false,
        observationTimedOut: true,
      },
      processGroupEmpty: true,
    })).toMatchObject({
      valid: false,
      contradictory: true,
    });
  });

  test("keeps observed provider turn.failed separate from runner termination", async () => {
    const root = makeRoot();
    const result = await executeR5BoundedProcess({
      invocation: nodeInvocation(`
        process.stdout.write(
          '{"type":"turn.failed","error":{"message":"request timed out"}}\\n',
        );
      `),
      outputRoot: join(root, "run"),
      runId: "r5-provider-terminal",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "missing-final.json"),
      terminationPolicy: policy({ deadlineMs: 2_000 }),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
    });

    expect(result).toMatchObject({
      providerTurnFailedObserved: true,
      providerTerminalInvented: false,
      processTreeTerminated: true,
      evidenceSealed: true,
    });
    expect(readJson(join(root, "run/termination.json"))).toMatchObject({
      providerTurnFailedObserved: true,
      providerTerminalInvented: false,
    });
  });

  test("rejects unsafe bounds and pre-existing output before spawning", async () => {
    const root = makeRoot();
    mkdirSync(join(root, "existing"));
    await expect(executeR5BoundedProcess({
      invocation: nodeInvocation(""),
      outputRoot: join(root, "existing"),
      runId: "r5-invalid",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "final"),
      terminationPolicy: policy(),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
    })).rejects.toThrowError("R5_EXECUTION_OPTIONS_INVALID");
    await expect(executeR5BoundedProcess({
      invocation: nodeInvocation(""),
      outputRoot: join(root, "new"),
      runId: "r5-invalid",
      instrumentationHash: HASH,
      finalResponsePath: join(root, "final"),
      terminationPolicy: policy({ deadlineMs: 10 }),
      permissionState: passedPermission(),
      audit: passedAudit,
      evaluate: passedEvaluation,
    })).rejects.toThrowError("R5_EXECUTION_OPTIONS_INVALID");
  });
});

function policy(overrides = {}) {
  return {
    deadlineMs: 120,
    graceMs: 60,
    forceKillWaitMs: 200,
    gracefulSignal: "SIGTERM",
    forceSignal: "SIGKILL",
    ...overrides,
  };
}

function passedPermission() {
  return {
    status: "passed",
    permissionProfilePassed: true,
    authReadableToGeneratedCommands: false,
    workspaceWritable: false,
    evidenceHash: "b".repeat(64),
  };
}

function passedAudit({ events }) {
  return {
    status: "passed",
    valid: true,
    eventCount: events.length,
    failureCodes: [],
  };
}

function passedEvaluation() {
  return {
    status: "passed",
    valid: true,
    failureCodes: [],
  };
}

function nodeInvocation(source, extraEnv = {}) {
  return {
    executable: process.execPath,
    args: ["-e", source],
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH ?? "",
      ...extraEnv,
    },
    evidence: {
      executable: "node",
      args: ["-e", "<bounded-test-source>"],
    },
  };
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "vem-r5-terminalizer-"));
  roots.push(root);
  return root;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function fakeProcess() {
  const listeners = new Map();
  return {
    once(event, listener) {
      listeners.set(event, listener);
    },
    off(event, listener) {
      if (listeners.get(event) === listener) listeners.delete(event);
    },
    emit(event) {
      listeners.get(event)?.();
    },
    listenerCount(event) {
      return listeners.has(event) ? 1 : 0;
    },
  };
}
