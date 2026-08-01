import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { buildR2CodexCapsuleInvocation } from "./r2-capsule.mjs";

export const R3_PERMISSION_PROFILE_NAME = "r3-capsule";
export const R3_PERMISSION_PROFILE_CONTAINER_PATH =
  `/codex-home/${R3_PERMISSION_PROFILE_NAME}.config.toml`;
export const R3_OUTER_PROCESS_ENV = Object.freeze({
  PATH: "/usr/bin:/bin",
});
const R3_COMMAND_PATH = [
  "/opt/codex/lib/node_modules/@openai/codex/node_modules/@openai/"
    + "codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex-path",
  "/usr/bin",
  "/bin",
].join(":");
export const R3_PERMISSION_PROFILE_TOML = [
  `default_permissions = "${R3_PERMISSION_PROFILE_NAME}"`,
  'approval_policy = "never"',
  "",
  `[permissions.${R3_PERMISSION_PROFILE_NAME}]`,
  'description = "R3 capsule generated-command containment"',
  "",
  `[permissions.${R3_PERMISSION_PROFILE_NAME}.filesystem]`,
  '":root" = "deny"',
  '":minimal" = "read"',
  '"/opt/codex" = "read"',
  '"/work" = "read"',
  '"/codex-home/auth.json" = "deny"',
  '"/proc" = "deny"',
  '":tmpdir" = "deny"',
  '":slash_tmp" = "deny"',
  "",
  `[permissions.${R3_PERMISSION_PROFILE_NAME}.network]`,
  "enabled = false",
  "",
  "[shell_environment_policy]",
  'inherit = "none"',
  `set = { PATH = "${R3_COMMAND_PATH}", HOME = "/work", TMPDIR = "/tmp" }`,
  "ignore_default_excludes = false",
  "",
].join("\n");

const CODEX_CONTAINER_PATH = "/opt/codex/bin/codex";
const DUMMY_AUTH_CONTAINER_PATH = "/codex-home/auth.json";
const PROBE_WORKSPACE_RELATIVE_PATH = ".r3-permission-write-probe";
const PROBE_SUCCESS = "R3_PERMISSION_PROFILE_PROBE=passed";

export function buildR3CodexCapsuleInvocation(options) {
  const profile = prepareR3PermissionProfile(options.capsule);
  const base = buildR2CodexCapsuleInvocation(options);
  const args = [...base.args];

  removeSingleValue(args, "--ignore-user-config", "R3_CAPSULE_BASE_INVOCATION_INVALID");
  removeSinglePair(args, "-s", "read-only", "R3_CAPSULE_BASE_INVOCATION_INVALID");

  const executableIndex = singleIndex(
    args,
    CODEX_CONTAINER_PATH,
    "R3_CAPSULE_BASE_INVOCATION_INVALID",
  );
  if (args[executableIndex + 1] !== "exec") {
    throw new Error("R3_CAPSULE_BASE_INVOCATION_INVALID");
  }
  args.splice(
    executableIndex,
    0,
    "--ro-bind",
    profile.hostPath,
    R3_PERMISSION_PROFILE_CONTAINER_PATH,
  );
  const adjustedExecutableIndex = singleIndex(
    args,
    CODEX_CONTAINER_PATH,
    "R3_CAPSULE_BASE_INVOCATION_INVALID",
  );
  args.splice(
    adjustedExecutableIndex + 2,
    0,
    "--strict-config",
    "--profile",
    R3_PERMISSION_PROFILE_NAME,
  );

  assertR3Invocation(args);
  return Object.freeze({
    ...base,
    args: Object.freeze(args),
    env: R3_OUTER_PROCESS_ENV,
    permissionProfilePath: profile.hostPath,
    evidence: Object.freeze({
      ...base.evidence,
      outerProcessEnvironment: R3_OUTER_PROCESS_ENV,
      outerProcessEnvironmentPolicy: "fixed-path-only-no-host-inheritance",
      innerCodexSandbox: `permission-profile:${R3_PERMISSION_PROFILE_NAME}`,
      legacySandboxMode: "removed",
      userConfigLoading: "isolated-mounted-profile-only",
      permissionProfileMount:
        `${R3_PERMISSION_PROFILE_CONTAINER_PATH}:ro`,
      permissionProfileHostPolicy: "capsule-control-root-0600-file",
      generatedCommandApproval: "never",
      generatedCommandAuthAccess: "deny",
      generatedCommandProcAccess: "deny",
      generatedCommandWorkspaceAccess: "read",
      generatedCommandRuntimeAccess: "/opt/codex:read",
      generatedCommandNetwork: "disabled",
      generatedCommandEnvironment: "clean-fixed-non-secret",
    }),
  });
}

export function buildR3PermissionProfileProbeInvocation({
  capsule,
  codexInstallRoot,
}) {
  const dummyAuthPath = prepareDummyAuth(capsule);
  const invocation = buildR3CodexCapsuleInvocation({
    capsule,
    prompt: "R3 local permission-profile probe; do not run a model.",
    model: "r3-local-probe",
    authFile: dummyAuthPath,
    codexInstallRoot,
  });
  const args = [...invocation.args];
  const executableIndex = singleIndex(
    args,
    CODEX_CONTAINER_PATH,
    "R3_CAPSULE_PROBE_INVOCATION_INVALID",
  );
  args.splice(
    executableIndex + 1,
    args.length - executableIndex - 1,
    "sandbox",
    "--profile",
    R3_PERMISSION_PROFILE_NAME,
    "--permission-profile",
    R3_PERMISSION_PROFILE_NAME,
    "--cd",
    "/work",
    "--",
    "/bin/sh",
    "-c",
    permissionProbeScript(),
  );
  const workspaceProbePath = join(
    requireDirectory(capsule.workspaceRoot, "R3_CAPSULE_WORKSPACE_INVALID"),
    PROBE_WORKSPACE_RELATIVE_PATH,
  );
  if (existsSync(workspaceProbePath)) {
    throw new Error("R3_CAPSULE_PROBE_PRECONDITION_INVALID");
  }
  assertR3ProbeInvocation(args);
  return Object.freeze({
    executable: invocation.executable,
    args: Object.freeze(args),
    cwd: invocation.cwd,
    env: invocation.env,
    workspaceProbePath,
    evidence: Object.freeze({
      outerProcessEnvironment: invocation.env,
      outerProcessEnvironmentPolicy: "fixed-path-only-no-host-inheritance",
      permissionProfile: R3_PERMISSION_PROFILE_NAME,
      permissionProfileMount:
        `${R3_PERMISSION_PROFILE_CONTAINER_PATH}:ro`,
      authInput: "generated-dummy-only",
      modelCall: false,
      expectedWorkspaceAccess: "read-only",
      expectedRuntimeAccess: "/opt/codex:read",
      expectedAuthAccess: "deny",
      expectedProcAccess: "deny",
      expectedProcEnvironment: "readable-only-if-clean-fixed-non-secret",
      expectedNetworkAccess: "disabled",
    }),
  });
}

export function runR3PermissionProfileProbe(
  invocation,
  { spawn = spawnSync } = {},
) {
  assertRunnableProbeInvocation(invocation);
  const dummySecrets = readMountedDummySecrets(invocation.args);
  if (existsSync(invocation.workspaceProbePath)) {
    throw new Error("R3_CAPSULE_PROBE_PRECONDITION_INVALID");
  }
  let result;
  try {
    result = spawn(invocation.executable, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      encoding: "utf8",
      timeout: 15_000,
    });
  } catch {
    throw new Error("R3_CAPSULE_PERMISSION_PROFILE_PROBE_FAILED");
  }
  if (result?.error !== undefined
    || result?.status !== 0
    || result?.stdout !== PROBE_SUCCESS
    || typeof result?.stderr !== "string"
    || dummySecrets.some((secret) => (
      result.stdout.includes(secret) || result.stderr.includes(secret)
    ))
    || existsSync(invocation.workspaceProbePath)) {
    throw new Error("R3_CAPSULE_PERMISSION_PROFILE_PROBE_FAILED");
  }
  return Object.freeze({
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
}

function prepareR3PermissionProfile(capsule) {
  const controlRoot = requireDirectory(
    capsule.controlRoot,
    "R3_CAPSULE_CONTROL_ROOT_INVALID",
  );
  const hostPath = join(
    controlRoot,
    `${R3_PERMISSION_PROFILE_NAME}.config.toml`,
  );
  if (!existsSync(hostPath)) {
    writeFileSync(hostPath, R3_PERMISSION_PROFILE_TOML, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }
  requirePrivateRegularFile(hostPath, "R3_CAPSULE_PERMISSION_PROFILE_INVALID");
  if (readFileSync(hostPath, "utf8") !== R3_PERMISSION_PROFILE_TOML) {
    throw new Error("R3_CAPSULE_PERMISSION_PROFILE_INVALID");
  }
  return Object.freeze({ hostPath });
}

function prepareDummyAuth(capsule) {
  const controlRoot = requireDirectory(
    capsule.controlRoot,
    "R3_CAPSULE_CONTROL_ROOT_INVALID",
  );
  const hostPath = join(controlRoot, "r3-probe-dummy-auth.json");
  if (existsSync(hostPath)) {
    throw new Error("R3_CAPSULE_DUMMY_AUTH_ALREADY_PREPARED");
  }
  const dummySecret = `r3-dummy-${randomBytes(32).toString("hex")}`;
  writeFileSync(
    hostPath,
    `${JSON.stringify({ OPENAI_API_KEY: dummySecret })}\n`,
    {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    },
  );
  requirePrivateRegularFile(hostPath, "R3_CAPSULE_DUMMY_AUTH_INVALID");
  return hostPath;
}

function readMountedDummySecrets(args) {
  const targetIndex = args.indexOf(DUMMY_AUTH_CONTAINER_PATH);
  if (targetIndex < 2
    || args[targetIndex - 2] !== "--ro-bind"
    || args.filter((entry) => entry === DUMMY_AUTH_CONTAINER_PATH).length !== 1) {
    throw new Error("R3_CAPSULE_DUMMY_AUTH_INVALID");
  }
  const source = requirePrivateRegularFile(
    args[targetIndex - 1],
    "R3_CAPSULE_DUMMY_AUTH_INVALID",
  );
  if (statSync(source).size > 4_096) {
    throw new Error("R3_CAPSULE_DUMMY_AUTH_INVALID");
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(source, "utf8"));
  } catch {
    throw new Error("R3_CAPSULE_DUMMY_AUTH_INVALID");
  }
  const values = typeof parsed === "object"
    && parsed !== null
    && !Array.isArray(parsed)
    ? Object.values(parsed).filter((value) => (
        typeof value === "string" && value.length >= 8
      ))
    : [];
  if (values.length < 1) throw new Error("R3_CAPSULE_DUMMY_AUTH_INVALID");
  return values;
}

function assertR3Invocation(args) {
  if (args.includes("--ignore-user-config")
    || args.includes("-s")
    || args.includes("--sandbox")
    || args.includes("read-only")) {
    throw new Error("R3_CAPSULE_LEGACY_SANDBOX_RETAINED");
  }
  requireSinglePair(
    args,
    "--ro-bind",
    R3_PERMISSION_PROFILE_CONTAINER_PATH,
    "R3_CAPSULE_PERMISSION_PROFILE_MOUNT_INVALID",
    2,
  );
  requireSinglePair(
    args,
    "--profile",
    R3_PERMISSION_PROFILE_NAME,
    "R3_CAPSULE_PERMISSION_PROFILE_SELECTION_INVALID",
  );
  singleIndex(args, "--strict-config", "R3_CAPSULE_STRICT_CONFIG_INVALID");
  requireSinglePair(
    args,
    "--output-last-message",
    "/run/vem/final-response.json",
    "R3_CAPSULE_FINAL_OUTPUT_INVALID",
  );
  requireSinglePair(
    args,
    "--ro-bind",
    DUMMY_AUTH_CONTAINER_PATH,
    "R3_CAPSULE_AUTH_MOUNT_INVALID",
    2,
  );
}

function assertR3ProbeInvocation(args) {
  assertR3InvocationPrefix(args);
  requireSinglePair(
    args,
    "--profile",
    R3_PERMISSION_PROFILE_NAME,
    "R3_CAPSULE_PROBE_PROFILE_CONFIG_INVALID",
  );
  requireSinglePair(
    args,
    "--permission-profile",
    R3_PERMISSION_PROFILE_NAME,
    "R3_CAPSULE_PROBE_PERMISSION_PROFILE_INVALID",
  );
  requireSinglePair(
    args,
    "--cd",
    "/work",
    "R3_CAPSULE_PROBE_WORKDIR_INVALID",
  );
  if (!args.includes("sandbox")
    || args.includes("exec")
    || args.includes("--json")
    || args.includes("--output-last-message")
    || args.includes("-s")
    || args.includes("read-only")) {
    throw new Error("R3_CAPSULE_PROBE_MODEL_PATH_PRESENT");
  }
}

function assertR3InvocationPrefix(args) {
  requireSinglePair(
    args,
    "--ro-bind",
    R3_PERMISSION_PROFILE_CONTAINER_PATH,
    "R3_CAPSULE_PERMISSION_PROFILE_MOUNT_INVALID",
    2,
  );
  requireSinglePair(
    args,
    "--ro-bind",
    DUMMY_AUTH_CONTAINER_PATH,
    "R3_CAPSULE_AUTH_MOUNT_INVALID",
    2,
  );
  singleIndex(args, CODEX_CONTAINER_PATH, "R3_CAPSULE_CODEX_BINARY_INVALID");
}

function assertRunnableProbeInvocation(invocation) {
  if (typeof invocation !== "object"
    || invocation === null
    || invocation.executable !== "/usr/bin/bwrap"
    || invocation.cwd !== "/"
    || !Array.isArray(invocation.args)
    || invocation.env !== R3_OUTER_PROCESS_ENV
    || typeof invocation.workspaceProbePath !== "string") {
    throw new Error("R3_CAPSULE_PROBE_INVOCATION_INVALID");
  }
  assertR3ProbeInvocation(invocation.args);
}

function permissionProbeScript() {
  return [
    "set -eu",
    "test -r /work/packages/demo-fixture/src/App.tsx",
    "if /bin/cat /codex-home/auth.json >/dev/null 2>&1; then exit 41; fi",
    [
      "if /bin/cat /proc/self/environ 2>/dev/null",
      "| /usr/bin/tr '\\000' '\\n'",
      "| /bin/grep -Eiq '(^|_)(AUTH|KEY|PASSWORD|SECRET|TOKEN)=';",
      "then exit 42; fi",
    ].join(" "),
    `if printf forbidden > /work/${PROBE_WORKSPACE_RELATIVE_PATH} 2>/dev/null; then exit 43; fi`,
    `printf '%s' '${PROBE_SUCCESS}'`,
  ].join("\n");
}

function removeSingleValue(args, value, code) {
  const index = singleIndex(args, value, code);
  args.splice(index, 1);
}

function removeSinglePair(args, name, value, code) {
  const index = singleIndex(args, name, code);
  if (args[index + 1] !== value) throw new Error(code);
  args.splice(index, 2);
}

function requireSinglePair(args, name, value, code, valueOffset = 1) {
  const matches = args
    .map((entry, index) => (
      entry === name && args[index + valueOffset] === value ? index : -1
    ))
    .filter((index) => index >= 0);
  if (matches.length !== 1) throw new Error(code);
}

function singleIndex(args, value, code) {
  const matches = args
    .map((entry, index) => (entry === value ? index : -1))
    .filter((index) => index >= 0);
  if (matches.length !== 1) throw new Error(code);
  return matches[0];
}

function requirePrivateRegularFile(path, code) {
  const fileStat = lstatSync(path);
  const followedStat = statSync(path);
  if (!fileStat.isFile()
    || fileStat.isSymbolicLink()
    || !followedStat.isFile()
    || (fileStat.mode & 0o777) !== 0o600) {
    throw new Error(code);
  }
  return resolve(path);
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  const directoryStat = lstatSync(resolved);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error(code);
  }
  return resolved;
}
