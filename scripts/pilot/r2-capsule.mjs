import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { buildCodexCapsuleInvocation } from "./capsule.mjs";

const CAPSULE_FINAL_PATH = "/run/vem/final-response.json";
const SYSTEM_READONLY_PATHS = Object.freeze(["/usr", "/bin", "/lib", "/lib64"]);

export function buildR2CodexCapsuleInvocation(options) {
  const output = prepareR2FinalOutputFile(options.capsule);
  const base = buildCodexCapsuleInvocation(options);
  const args = [...base.args];
  const executableIndex = args.indexOf("/opt/codex/bin/codex");
  const jsonIndex = args.indexOf("--json");
  if (executableIndex < 0 || jsonIndex < executableIndex) {
    throw new Error("R2_CAPSULE_BASE_INVOCATION_INVALID");
  }
  args.splice(
    executableIndex,
    0,
    "--ro-bind", output.outputRoot, "/run/vem",
    "--bind", output.hostOutputPath, CAPSULE_FINAL_PATH,
  );
  const adjustedJsonIndex = args.indexOf("--json");
  args.splice(
    adjustedJsonIndex,
    0,
    "--output-last-message", CAPSULE_FINAL_PATH,
  );
  return Object.freeze({
    ...base,
    args: Object.freeze(args),
    authoritativeResponsePath: output.hostOutputPath,
    evidence: Object.freeze({
      ...base.evidence,
      authoritativeResponseMount: `${CAPSULE_FINAL_PATH}:rw-single-file`,
      authoritativeResponseHostPolicy: "runner-owned-0700-root-0600-file",
      outputDirectoryMount: "/run/vem:ro",
    }),
  });
}

export function runR2FinalOutputIsolationProbe(capsule) {
  const workspaceRoot = requireDirectory(capsule.workspaceRoot, "R2_CAPSULE_WORKSPACE_INVALID");
  const output = prepareR2FinalOutputFile(capsule);
  const args = [
    "--unshare-user",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--die-with-parent",
    "--new-session",
  ];
  for (const path of SYSTEM_READONLY_PATHS) {
    if (!existsSync(path)) throw new Error("R2_CAPSULE_SYSTEM_PATH_MISSING");
    args.push("--ro-bind", path, path);
  }
  args.push(
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    "--ro-bind", workspaceRoot, "/work",
    "--ro-bind", output.outputRoot, "/run/vem",
    "--bind", output.hostOutputPath, CAPSULE_FINAL_PATH,
    "--chdir", "/work",
    "/bin/sh", "-c",
    [
      "set -eu",
      "if printf forbidden > /work/r2-write-probe 2>/dev/null; then exit 21; fi",
      "if printf forbidden > /run/vem/sibling 2>/dev/null; then exit 22; fi",
      `printf R2_FINAL_OUTPUT_PROBE > ${CAPSULE_FINAL_PATH}`,
    ].join("\n"),
  );
  const result = spawnSync("/usr/bin/bwrap", args, {
    cwd: "/",
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.status !== 0 || result.error !== undefined) {
    throw new Error("R2_CAPSULE_FINAL_OUTPUT_PROBE_FAILED");
  }
  return Object.freeze({
    ok: true,
    workspaceWritable: false,
    outputSiblingWritable: false,
    authoritativeFileWritable: true,
    hostOutputPath: output.hostOutputPath,
  });
}

function prepareR2FinalOutputFile(capsule) {
  const controlRoot = requireDirectory(capsule.controlRoot, "R2_CAPSULE_CONTROL_ROOT_INVALID");
  const outputRoot = join(controlRoot, "r2-final-output");
  if (existsSync(outputRoot)) throw new Error("R2_CAPSULE_OUTPUT_ALREADY_PREPARED");
  mkdirSync(outputRoot, { mode: 0o700 });
  const hostOutputPath = join(outputRoot, "final-response.json");
  const descriptor = openSync(hostOutputPath, "wx", 0o600);
  closeSync(descriptor);
  const rootStat = statSync(outputRoot);
  const fileStat = lstatSync(hostOutputPath);
  if ((rootStat.mode & 0o777) !== 0o700
    || !fileStat.isFile()
    || fileStat.isSymbolicLink()
    || (fileStat.mode & 0o777) !== 0o600) {
    throw new Error("R2_CAPSULE_OUTPUT_PERMISSIONS_INVALID");
  }
  return Object.freeze({ outputRoot, hostOutputPath });
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
  return resolved;
}
