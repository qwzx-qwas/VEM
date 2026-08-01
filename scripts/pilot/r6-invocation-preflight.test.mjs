import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import {
  buildR3CodexCapsuleInvocation,
  R3_OUTER_PROCESS_ENV,
} from "./r3-capsule.mjs";
import { isR5ProcessInvocation } from "./r5-process-terminalizer.mjs";
import { verifyR6InvocationCompatibility } from "./r6-invocation-preflight.mjs";

const FIXTURE_ROOT = resolve(
  "docs/test-evidence/R5-T3/20260730T154956-0800/fixture",
);
const RESPONSE_SCHEMA = resolve(
  "docs/test-evidence/R5-T3/20260730T154956-0800/inputs/response-schema.json",
);
const PROBE_SUCCESS = "R3_PERMISSION_PROFILE_PROBE=passed";
const capsules = [];

afterEach(() => {
  for (const capsule of capsules.splice(0)) cleanupParticipantCapsule(capsule);
});

describe("R6 explicit invocation environment compatibility", () => {
  test("constructs an immutable fixed-PATH invocation accepted by the terminalizer", () => {
    const decision = capsule("r6-unit-decision");
    const probe = capsule("r6-unit-probe");
    const authFile = dummyAuth(decision);
    let spawned;
    const result = verifyR6InvocationCompatibility({
      decisionCapsule: decision,
      probeCapsule: probe,
      authFile,
      spawn(executable, args, options) {
        spawned = { executable, args, options };
        return {
          error: undefined,
          status: 0,
          stdout: PROBE_SUCCESS,
          stderr: "",
        };
      },
    });

    expect(result).toMatchObject({
      ok: true,
      exactDecisionInvocationConstructed: true,
      exactDecisionInvocationExecuted: false,
      terminalizerInvocationPredicatePassed: true,
      outerEnvironment: { PATH: "/usr/bin:/bin" },
      outerEnvironmentInheritedFromHost: false,
      outerEnvironmentSensitiveEntryCount: 0,
      permissionProfilePassed: true,
      workspaceWritable: false,
      authReadableToGeneratedCommands: false,
      providerNetworkProbed: false,
      modelCall: false,
    });
    expect(Object.isFrozen(R3_OUTER_PROCESS_ENV)).toBe(true);
    expect(spawned.options.env).toBe(R3_OUTER_PROCESS_ENV);
    expect(spawned.args).not.toContain("exec");
    expect(spawned.args).not.toContain("--json");
    expect(JSON.stringify(result.outerEnvironment)).not.toMatch(
      /AUTH|KEY|PASSWORD|SECRET|TOKEN/iu,
    );
  });

  test("the exact decision invocation binds env in evidence without host values", () => {
    const decision = capsule("r6-unit-binding");
    const invocation = buildR3CodexCapsuleInvocation({
      capsule: decision,
      prompt: "Construct only.",
      model: "gpt-5.6-sol",
      authFile: dummyAuth(decision),
    });
    expect(isR5ProcessInvocation(invocation)).toBe(true);
    expect(invocation.env).toBe(R3_OUTER_PROCESS_ENV);
    expect(invocation.evidence).toMatchObject({
      outerProcessEnvironment: { PATH: "/usr/bin:/bin" },
      outerProcessEnvironmentPolicy: "fixed-path-only-no-host-inheritance",
    });
    expect(JSON.stringify(invocation.env)).not.toContain(
      process.env.HOME ?? "/home",
    );
    expect(lstatSync(invocation.permissionProfilePath).mode & 0o777).toBe(0o600);
  });

  test("the shared predicate rejects the missing and malformed env shapes", () => {
    const decision = capsule("r6-unit-rejection");
    const invocation = buildR3CodexCapsuleInvocation({
      capsule: decision,
      prompt: "Construct only.",
      model: "gpt-5.6-sol",
      authFile: dummyAuth(decision),
    });
    const missing = { ...invocation };
    Reflect.deleteProperty(missing, "env");
    expect(isR5ProcessInvocation(missing)).toBe(false);
    expect(isR5ProcessInvocation({
      ...invocation,
      env: { PATH: 42 },
    })).toBe(false);
    expect(isR5ProcessInvocation({
      ...invocation,
      env: ["PATH=/usr/bin:/bin"],
    })).toBe(false);
  });
});

function capsule(taskId) {
  const created = createParticipantCapsule({
    sourceRoot: FIXTURE_ROOT,
    taskId,
    arm: "direct-search",
    responseSchemaPath: RESPONSE_SCHEMA,
  });
  capsules.push(created);
  return created;
}

function dummyAuth(capsuleValue) {
  const path = join(capsuleValue.controlRoot, "r6-test-auth.json");
  writeFileSync(path, '{"test_dummy_auth":true}\n', {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  expect(readFileSync(path, "utf8")).toContain("test_dummy_auth");
  return path;
}
