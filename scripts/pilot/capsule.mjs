import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._~/-]{1,512}$/u;
const MAX_FILE_BYTES = 1_048_576;
const MAX_FILES = 16;
const CAPSULE_PREFIX = "vem-p0-t17c-capsule-";
const PARTICIPANT_FIXTURE_FILES = Object.freeze([
  "packages/demo-fixture/src/App.tsx",
  "packages/demo-fixture/src/fixtures.ts",
]);
const SYSTEM_READONLY_PATHS = Object.freeze(["/usr", "/bin", "/lib", "/lib64"]);
const SAFE_ABSOLUTE_PREFIXES = Object.freeze([
  "/bin/",
  "/codex-home/",
  "/dev/",
  "/lib/",
  "/lib64/",
  "/opt/codex/",
  "/proc/",
  "/tmp/",
  "/usr/",
  "/work/",
]);

export function createParticipantCapsule({
  sourceRoot,
  taskId,
  arm,
  responseSchemaPath,
  vemContextPath,
  temporaryBase = tmpdir(),
}) {
  if (!TASK_ID.test(taskId) || !["direct-search", "vem-assisted"].includes(arm)) {
    throw new Error("CAPSULE_REQUEST_INVALID");
  }
  if ((arm === "vem-assisted") !== (vemContextPath !== undefined)) {
    throw new Error("CAPSULE_TREATMENT_INPUT_INVALID");
  }
  const resolvedSourceRoot = requireDirectory(sourceRoot, "CAPSULE_SOURCE_ROOT_INVALID");
  const resolvedTemporaryBase = requireDirectory(temporaryBase, "CAPSULE_TEMP_ROOT_INVALID");
  if (isWithin(resolvedSourceRoot, resolvedTemporaryBase)) {
    throw new Error("CAPSULE_TEMP_ROOT_OVERLAP");
  }
  const capsuleRoot = mkdtempSync(join(resolvedTemporaryBase, CAPSULE_PREFIX));
  const workspaceRoot = join(capsuleRoot, "work");
  const controlRoot = join(capsuleRoot, "control");
  mkdirSync(workspaceRoot, { mode: 0o700 });
  mkdirSync(controlRoot, { mode: 0o700 });
  try {
    for (const relativePath of PARTICIPANT_FIXTURE_FILES) {
      copyBoundedInput(resolvedSourceRoot, relativePath, workspaceRoot, relativePath);
    }
    copyExternalInput(responseSchemaPath, workspaceRoot, ".pilot/response-schema.json");
    if (vemContextPath !== undefined) {
      copyExternalInput(vemContextPath, workspaceRoot, "vem-context.json");
    }
    const workspaceFiles = snapshotWorkspace(workspaceRoot);
    if (workspaceFiles.length > MAX_FILES) throw new Error("CAPSULE_FILE_LIMIT_EXCEEDED");
    const baseFiles = workspaceFiles.filter((file) => file.path !== "vem-context.json");
    const manifest = {
      schemaVersion: "P0-T17C-participant-capsule-v1",
      taskId,
      arm,
      workspaceMount: "/work",
      repositoryVisible: false,
      ruleAndSkillDiscovery: "capsule-only",
      authHandling: "runtime-readonly-mount-not-copied-or-recorded",
      networkHandling: "codex-api-required-inner-readonly-sandbox-retained",
      workspaceFiles,
      baseContextHash: canonicalHash(baseFiles),
      treatmentHash: arm === "vem-assisted"
        ? workspaceFiles.find((file) => file.path === "vem-context.json")?.sha256 ?? null
        : null,
      allowedDifference: arm === "vem-assisted" ? ["vem-context.json"] : [],
    };
    writeFileSync(join(controlRoot, "manifest.json"), `${canonicalJson(manifest)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return Object.freeze({
      capsuleRoot,
      workspaceRoot,
      controlRoot,
      manifest: deepFreeze(manifest),
    });
  } catch (error) {
    cleanupParticipantCapsule({ capsuleRoot, workspaceRoot, controlRoot });
    throw error;
  }
}

export function assertIntendedCapsuleDifference(directManifest, vemManifest) {
  if (directManifest.schemaVersion !== "P0-T17C-participant-capsule-v1"
    || vemManifest.schemaVersion !== directManifest.schemaVersion
    || directManifest.arm !== "direct-search"
    || vemManifest.arm !== "vem-assisted"
    || directManifest.taskId !== vemManifest.taskId
    || directManifest.baseContextHash !== vemManifest.baseContextHash
    || directManifest.treatmentHash !== null
    || !Array.isArray(directManifest.allowedDifference)
    || directManifest.allowedDifference.length !== 0
    || canonicalJson(vemManifest.allowedDifference) !== canonicalJson(["vem-context.json"])) {
    throw new Error("CAPSULE_BASE_CONTEXT_MISMATCH");
  }
  const directFiles = new Map(directManifest.workspaceFiles.map((file) => [file.path, file.sha256]));
  const vemFiles = new Map(vemManifest.workspaceFiles.map((file) => [file.path, file.sha256]));
  if (directFiles.has("vem-context.json") || !vemFiles.has("vem-context.json")) {
    throw new Error("CAPSULE_TREATMENT_DIFFERENCE_INVALID");
  }
  vemFiles.delete("vem-context.json");
  if (canonicalJson([...directFiles]) !== canonicalJson([...vemFiles])) {
    throw new Error("CAPSULE_BASE_CONTEXT_MISMATCH");
  }
  return Object.freeze({
    valid: true,
    baseContextHash: directManifest.baseContextHash,
    onlyDifference: "vem-context.json",
    vemContextHash: vemManifest.treatmentHash,
  });
}

export function buildCodexCapsuleInvocation({
  capsule,
  prompt,
  model,
  authFile,
  codexInstallRoot = resolve(dirname(process.execPath), ".."),
}) {
  if (typeof prompt !== "string" || prompt.length === 0 || prompt.length > 8_192) {
    throw new Error("CAPSULE_PROMPT_INVALID");
  }
  if (typeof model !== "string" || !TASK_ID.test(model)) throw new Error("CAPSULE_MODEL_INVALID");
  const workspaceRoot = requireDirectory(capsule.workspaceRoot, "CAPSULE_WORKSPACE_INVALID");
  const installRoot = requireDirectory(codexInstallRoot, "CAPSULE_CODEX_INSTALL_INVALID");
  const auth = requireRegularFile(authFile, "CAPSULE_AUTH_INVALID");
  const authStat = statSync(auth);
  if ((authStat.mode & 0o077) !== 0) throw new Error("CAPSULE_AUTH_PERMISSIONS_INVALID");
  const args = [
    ...bubblewrapBaseArgs(),
    "--tmpfs", "/codex-home",
    "--ro-bind", auth, "/codex-home/auth.json",
    "--ro-bind", installRoot, "/opt/codex",
    "--ro-bind", workspaceRoot, "/work",
    "--chdir", "/work",
    "--setenv", "HOME", "/codex-home",
    "--setenv", "CODEX_HOME", "/codex-home",
    "--setenv", "TMPDIR", "/tmp",
    "--setenv", "PATH", "/opt/codex/bin:/usr/bin:/bin",
    "/opt/codex/bin/codex",
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "-m", model,
    "-s", "read-only",
    "--output-schema", "/work/.pilot/response-schema.json",
    "--json",
    prompt,
  ];
  return Object.freeze({
    executable: "/usr/bin/bwrap",
    args: Object.freeze(args),
    cwd: "/",
    evidence: Object.freeze({
      outerFilesystem: "bubblewrap-readonly-capsule",
      innerCodexSandbox: "read-only",
      home: "tmpfs",
      auth: "readonly-runtime-mount",
      repositoryMount: "absent",
      workspaceMount: "/work:ro",
    }),
  });
}

export function runFilesystemIsolationProbe(capsule) {
  const workspaceRoot = requireDirectory(capsule.workspaceRoot, "CAPSULE_WORKSPACE_INVALID");
  const args = [
    ...bubblewrapBaseArgs(),
    "--ro-bind", workspaceRoot, "/work",
    "--chdir", "/work",
    "/bin/sh",
    "-c",
    [
      "set -eu",
      "test -r packages/demo-fixture/src/App.tsx",
      "test -r packages/demo-fixture/src/fixtures.ts",
      "test -r .pilot/response-schema.json",
      "test ! -e /home",
      "test ! -e /mnt",
      "test ! -e /root",
      "test ! -e AGENTS.md",
      "test ! -e .agents",
      "test ! -e .codex",
      "test ! -e /control",
      "printf P0_T17C_CAPSULE_PROBE=passed",
    ].join("\n"),
  ];
  const result = spawnSync("/usr/bin/bwrap", args, {
    cwd: "/",
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.status !== 0 || result.stdout !== "P0_T17C_CAPSULE_PROBE=passed") {
    throw new Error("CAPSULE_FILESYSTEM_PROBE_FAILED");
  }
  return Object.freeze({
    ok: true,
    stdout: result.stdout,
    repositoryPathVisible: false,
    homeVisible: false,
    fixtureReadable: true,
  });
}

export function runCodexBinaryIsolationProbe(
  capsule,
  codexInstallRoot = resolve(dirname(process.execPath), ".."),
) {
  const workspaceRoot = requireDirectory(capsule.workspaceRoot, "CAPSULE_WORKSPACE_INVALID");
  const installRoot = requireDirectory(codexInstallRoot, "CAPSULE_CODEX_INSTALL_INVALID");
  const args = [
    ...bubblewrapBaseArgs(),
    "--tmpfs", "/codex-home",
    "--ro-bind", installRoot, "/opt/codex",
    "--ro-bind", workspaceRoot, "/work",
    "--chdir", "/work",
    "--setenv", "HOME", "/codex-home",
    "--setenv", "CODEX_HOME", "/codex-home",
    "--setenv", "TMPDIR", "/tmp",
    "--setenv", "PATH", "/opt/codex/bin:/usr/bin:/bin",
    "/opt/codex/bin/codex",
    "--version",
  ];
  const result = spawnSync("/usr/bin/bwrap", args, {
    cwd: "/",
    encoding: "utf8",
    timeout: 10_000,
  });
  const version = result.stdout.trim();
  if (result.status !== 0 || !/^codex-cli \d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(version)) {
    throw new Error("CAPSULE_CODEX_BINARY_PROBE_FAILED");
  }
  return Object.freeze({
    ok: true,
    version,
    repositoryPathVisible: false,
    codexHome: "tmpfs",
  });
}

export function auditCodexJsonl({ jsonl, stderr = "" }) {
  if (typeof jsonl !== "string" || typeof stderr !== "string") {
    throw new Error("CAPSULE_AUDIT_INPUT_INVALID");
  }
  const events = jsonl.split(/\r?\n/u).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error("CAPSULE_AUDIT_JSONL_INVALID");
    }
  });
  const externalPaths = [];
  const forbiddenMarkers = [];
  const inspectText = (text) => {
    if (typeof text !== "string") return;
    for (const marker of ["AGENTS.md", "SKILL.md", "/.agents/", "/.codex/skills/", "/home/", "/mnt/", "/root/"]) {
      if (text.includes(marker)) forbiddenMarkers.push(marker);
    }
    for (const match of text.matchAll(/(?:^|[\s"'=])(?<path>\/[^\s"';)]*)/gu)) {
      const absolutePath = match.groups?.path;
      if (absolutePath === undefined || absolutePath === "/") {
        externalPaths.push(absolutePath ?? "/");
      } else if (!SAFE_ABSOLUTE_PREFIXES.some((prefix) => absolutePath.startsWith(prefix))) {
        externalPaths.push(absolutePath);
      }
    }
  };
  for (const event of events) {
    if (event.type !== "item.started" && event.type !== "item.completed") continue;
    if (event.item?.type !== "command_execution") continue;
    inspectText(event.item.command);
    inspectText(event.item.aggregated_output);
  }
  inspectText(stderr);
  if (externalPaths.length > 0 || forbiddenMarkers.length > 0) {
    throw new Error("CAPSULE_COMMAND_PATH_ESCAPE");
  }
  const threadIds = events
    .filter((event) => event.type === "thread.started" && typeof event.thread_id === "string")
    .map((event) => event.thread_id);
  return Object.freeze({
    valid: true,
    eventCount: events.length,
    threadIds: Object.freeze(threadIds),
    externalPaths: Object.freeze([]),
    forbiddenMarkers: Object.freeze([]),
  });
}

export function cleanupParticipantCapsule(capsule) {
  if (typeof capsule !== "object" || capsule === null) throw new Error("CAPSULE_CLEANUP_INVALID");
  const capsuleRoot = resolve(capsule.capsuleRoot);
  const safeRoot = resolve(tmpdir());
  if (dirname(capsuleRoot) !== safeRoot
    || !capsuleRoot.startsWith(join(safeRoot, CAPSULE_PREFIX))
    || basenameSafe(capsuleRoot).length <= CAPSULE_PREFIX.length
    || lstatSync(capsuleRoot).isSymbolicLink()) {
    throw new Error("CAPSULE_CLEANUP_REFUSED");
  }
  rmSync(capsuleRoot, { recursive: true, force: true, maxRetries: 3 });
  if (existsSync(capsuleRoot)) throw new Error("CAPSULE_CLEANUP_FAILED");
}

function bubblewrapBaseArgs() {
  const args = [
    "--unshare-user",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--die-with-parent",
    "--new-session",
  ];
  for (const path of SYSTEM_READONLY_PATHS) {
    if (!existsSync(path)) throw new Error("CAPSULE_SYSTEM_PATH_MISSING");
    args.push("--ro-bind", path, path);
  }
  for (const path of ["/etc/ssl/certs", "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf"]) {
    if (existsSync(path)) args.push("--ro-bind", path, path);
  }
  args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp");
  return args;
}

function copyBoundedInput(root, sourcePath, destinationRoot, destinationPath) {
  if (!RELATIVE_PATH.test(sourcePath) || !RELATIVE_PATH.test(destinationPath)) {
    throw new Error("CAPSULE_INPUT_PATH_INVALID");
  }
  const source = resolveWithinRoot(root, sourcePath);
  copyRegularFile(source, join(destinationRoot, destinationPath));
}

function copyExternalInput(sourcePath, destinationRoot, destinationPath) {
  if (!RELATIVE_PATH.test(destinationPath)) throw new Error("CAPSULE_INPUT_PATH_INVALID");
  const source = requireRegularFile(sourcePath, "CAPSULE_INPUT_INVALID");
  copyRegularFile(source, join(destinationRoot, destinationPath));
}

function copyRegularFile(source, destination) {
  const stat = statSync(source);
  if (stat.size > MAX_FILE_BYTES) throw new Error("CAPSULE_INPUT_SIZE_EXCEEDED");
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(source, destination);
  chmodSync(destination, 0o400);
}

function resolveWithinRoot(root, relativePath) {
  const segments = relativePath.split("/");
  let cursor = root;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error("CAPSULE_INPUT_SYMLINK_REJECTED");
  }
  const resolved = requireRegularFile(cursor, "CAPSULE_INPUT_INVALID");
  if (!isWithin(root, resolved)) throw new Error("CAPSULE_INPUT_OUTSIDE_ROOT");
  return resolved;
}

function snapshotWorkspace(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("CAPSULE_WORKSPACE_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        const body = readFileSync(absolutePath);
        files.push({
          path: relative(root, absolutePath).split(sep).join("/"),
          sha256: sha256(body),
          bytes: body.byteLength,
          mode: statSync(absolutePath).mode & 0o777,
        });
      } else {
        throw new Error("CAPSULE_WORKSPACE_NON_REGULAR_REJECTED");
      }
    }
  };
  visit(root);
  return files;
}

function requireDirectory(path, code) {
  const resolved = realpathSync(path);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
  return resolved;
}

function requireRegularFile(path, code) {
  const unresolved = resolve(path);
  const stat = lstatSync(unresolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(code);
  return realpathSync(unresolved);
}

function isWithin(root, path) {
  const relativePath = relative(root, path);
  return relativePath === ""
    || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

function basenameSafe(path) {
  return path.slice(path.lastIndexOf(sep) + 1);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalHash(value) {
  return sha256(canonicalJson(value));
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("CAPSULE_CANONICAL_VALUE_INVALID");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("CAPSULE_CANONICAL_VALUE_INVALID");
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
