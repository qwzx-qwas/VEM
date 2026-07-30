import {
  chmodSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import {
  buildR3CodexCapsuleInvocation,
  buildR3PermissionProfileProbeInvocation,
  R3_PERMISSION_PROFILE_CONTAINER_PATH,
  R3_PERMISSION_PROFILE_NAME,
  R3_PERMISSION_PROFILE_TOML,
  runR3PermissionProfileProbe,
} from "./r3-capsule.mjs";

const PROBE_SUCCESS = "R3_PERMISSION_PROFILE_PROBE=passed";
const capsules = [];

afterEach(() => {
  for (const capsule of capsules.splice(0)) cleanupParticipantCapsule(capsule);
});

describe("R3 Codex permission-profile capsule", () => {
  test("replaces the legacy sandbox while retaining single-file final output", () => {
    const capsule = fixtureCapsule("r3-main-invocation");
    const authFile = writeDummyTestAuth(capsule);
    const invocation = buildR3CodexCapsuleInvocation({
      capsule,
      prompt: "Return the bounded JSON response.",
      model: "gpt-5.6-sol",
      authFile,
    });

    expect(invocation.args).not.toContain("--ignore-user-config");
    expect(invocation.args).not.toContain("-s");
    expect(invocation.args).not.toContain("--sandbox");
    expect(invocation.args).not.toContain("read-only");
    expect(invocation.args).toContain("--strict-config");
    expect(optionValue(invocation.args, "--profile"))
      .toBe(R3_PERMISSION_PROFILE_NAME);
    expect(optionValue(invocation.args, "--output-last-message"))
      .toBe("/run/vem/final-response.json");
    expect(readOnlyMountSource(
      invocation.args,
      R3_PERMISSION_PROFILE_CONTAINER_PATH,
    )).toBe(invocation.permissionProfilePath);
    expect(lstatSync(invocation.permissionProfilePath).mode & 0o777).toBe(0o600);
    expect(readFileSync(invocation.permissionProfilePath, "utf8"))
      .toBe(R3_PERMISSION_PROFILE_TOML);
    expect(R3_PERMISSION_PROFILE_TOML).toContain('approval_policy = "never"');
    expect(R3_PERMISSION_PROFILE_TOML).not.toContain("sandbox_mode");
    expect(R3_PERMISSION_PROFILE_TOML).toContain('":root" = "deny"');
    expect(R3_PERMISSION_PROFILE_TOML).toContain('":minimal" = "read"');
    expect(R3_PERMISSION_PROFILE_TOML).toContain('"/opt/codex" = "read"');
    expect(R3_PERMISSION_PROFILE_TOML).toContain('"/work" = "read"');
    expect(R3_PERMISSION_PROFILE_TOML)
      .toContain('"/codex-home/auth.json" = "deny"');
    expect(R3_PERMISSION_PROFILE_TOML).toContain('"/proc" = "deny"');
    expect(R3_PERMISSION_PROFILE_TOML).toContain('":tmpdir" = "deny"');
    expect(R3_PERMISSION_PROFILE_TOML).toContain('":slash_tmp" = "deny"');
    expect(R3_PERMISSION_PROFILE_TOML).toContain("enabled = false");
    expect(R3_PERMISSION_PROFILE_TOML)
      .toContain("[shell_environment_policy]");
    expect(R3_PERMISSION_PROFILE_TOML).toContain('inherit = "none"');
    expect(R3_PERMISSION_PROFILE_TOML)
      .toContain('HOME = "/work", TMPDIR = "/tmp"');
    expect(invocation.evidence).toMatchObject({
      workspaceMount: "/work:ro",
      authoritativeResponseMount: "/run/vem/final-response.json:rw-single-file",
      innerCodexSandbox: "permission-profile:r3-capsule",
      generatedCommandApproval: "never",
      generatedCommandAuthAccess: "deny",
      generatedCommandWorkspaceAccess: "read",
      generatedCommandRuntimeAccess: "/opt/codex:read",
      generatedCommandNetwork: "disabled",
      generatedCommandEnvironment: "clean-fixed-non-secret",
    });
  });

  test("rejects profile drift or broadened file permissions", () => {
    const capsule = fixtureCapsule("r3-profile-drift");
    const authFile = writeDummyTestAuth(capsule);
    const invocation = buildR3CodexCapsuleInvocation({
      capsule,
      prompt: "Return the bounded JSON response.",
      model: "gpt-5.6-sol",
      authFile,
    });

    writeFileSync(
      invocation.permissionProfilePath,
      R3_PERMISSION_PROFILE_TOML.replace(
        '"/codex-home/auth.json" = "deny"',
        '"/codex-home/auth.json" = "read"',
      ),
      "utf8",
    );
    expect(() => buildR3CodexCapsuleInvocation({
      capsule,
      prompt: "Do not accept a broadened profile.",
      model: "gpt-5.6-sol",
      authFile,
    })).toThrowError("R3_CAPSULE_PERMISSION_PROFILE_INVALID");

    writeFileSync(
      invocation.permissionProfilePath,
      R3_PERMISSION_PROFILE_TOML,
      "utf8",
    );
    chmodSync(invocation.permissionProfilePath, 0o640);
    expect(() => buildR3CodexCapsuleInvocation({
      capsule,
      prompt: "Do not accept a non-private profile.",
      model: "gpt-5.6-sol",
      authFile,
    })).toThrowError("R3_CAPSULE_PERMISSION_PROFILE_INVALID");
  });

  test("exports a no-model dummy-secret probe and keeps its result secret-free", () => {
    const capsule = fixtureCapsule("r3-local-probe");
    const invocation = buildR3PermissionProfileProbeInvocation({ capsule });
    const authSource = readOnlyMountSource(
      invocation.args,
      "/codex-home/auth.json",
    );
    const script = invocation.args.at(-1);

    expect(lstatSync(authSource).mode & 0o777).toBe(0o600);
    expect(invocation.args).toContain("sandbox");
    expect(invocation.args).not.toContain("exec");
    expect(invocation.args).not.toContain("--json");
    expect(invocation.args).not.toContain("--output-last-message");
    expect(optionValue(invocation.args, "--profile"))
      .toBe(R3_PERMISSION_PROFILE_NAME);
    expect(optionValue(invocation.args, "--permission-profile"))
      .toBe(R3_PERMISSION_PROFILE_NAME);
    expect(script).toContain("test -r /work/packages/demo-fixture/src/App.tsx");
    expect(script).toContain("/codex-home/auth.json >/dev/null 2>&1");
    expect(script).toContain("/proc/self/environ 2>/dev/null");
    expect(script).toContain("(AUTH|KEY|PASSWORD|SECRET|TOKEN)=");
    expect(script).toContain("> /work/.r3-permission-write-probe 2>/dev/null");
    expect(script).not.toContain("OPENAI_API_KEY");

    let spawned;
    const result = runR3PermissionProfileProbe(invocation, {
      spawn(executable, args, options) {
        spawned = { executable, args, options };
        return {
          error: undefined,
          status: 0,
          stdout: PROBE_SUCCESS,
          stderr: "ignored non-sensitive diagnostic",
        };
      },
    });
    expect(spawned).toEqual({
      executable: "/usr/bin/bwrap",
      args: invocation.args,
      options: {
        cwd: "/",
        env: { PATH: process.env.PATH ?? "" },
        encoding: "utf8",
        timeout: 15_000,
      },
    });
    expect(result).toEqual({
      ok: true,
      modelCall: false,
      workspaceReadable: true,
      workspaceWritable: false,
      authReadable: false,
      procEnvironmentReadable: true,
      procEnvironmentSensitiveValuesAbsent: true,
      networkPolicyConfiguredDisabled: true,
      networkRuntimeProbed: false,
    });
    expect(JSON.stringify(result)).not.toContain("OPENAI_API_KEY");
  });

  test("fails closed when the sandbox or permission profile is unsupported", () => {
    const capsule = fixtureCapsule("r3-unsupported-profile");
    const invocation = buildR3PermissionProfileProbeInvocation({ capsule });

    expect(() => runR3PermissionProfileProbe(invocation, {
      spawn() {
        return {
          error: undefined,
          status: 2,
          stdout: "",
          stderr: "unsupported permission profile",
        };
      },
    })).toThrowError("R3_CAPSULE_PERMISSION_PROFILE_PROBE_FAILED");
    expect(() => runR3PermissionProfileProbe(invocation, {
      spawn() {
        return {
          error: undefined,
          status: 0,
          stdout: "unexpected output",
          stderr: "",
        };
      },
    })).toThrowError("R3_CAPSULE_PERMISSION_PROFILE_PROBE_FAILED");
    const authSource = readOnlyMountSource(
      invocation.args,
      "/codex-home/auth.json",
    );
    const dummySecret = JSON.parse(
      readFileSync(authSource, "utf8"),
    ).OPENAI_API_KEY;
    expect(() => runR3PermissionProfileProbe(invocation, {
      spawn() {
        return {
          error: undefined,
          status: 0,
          stdout: PROBE_SUCCESS,
          stderr: `diagnostic accidentally included ${dummySecret}`,
        };
      },
    })).toThrowError("R3_CAPSULE_PERMISSION_PROFILE_PROBE_FAILED");
  });
});

function fixtureCapsule(taskId) {
  const capsule = createParticipantCapsule({
    sourceRoot: resolve("docs/test-evidence/R1-T3/20260729T203631+0800/fixture"),
    taskId,
    arm: "direct-search",
    responseSchemaPath: resolve(
      "docs/test-evidence/R1-T3/20260729T203631+0800/inputs/response-schema.json",
    ),
  });
  capsules.push(capsule);
  return capsule;
}

function writeDummyTestAuth(capsule) {
  const path = join(capsule.controlRoot, "test-dummy-auth.json");
  writeFileSync(path, '{"test_dummy_auth":true}\n', {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return path;
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  expect(index).toBeGreaterThan(-1);
  return args[index + 1];
}

function readOnlyMountSource(args, target) {
  const targetIndex = args.indexOf(target);
  expect(targetIndex).toBeGreaterThan(1);
  expect(args[targetIndex - 2]).toBe("--ro-bind");
  return args[targetIndex - 1];
}
