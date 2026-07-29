import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const sourceRoot = process.cwd();
const temporaryRoot = mkdtempSync(join(tmpdir(), "vem-p0-t1-clean-install-"));
const excludedNames = new Set([".git", "coverage", "dist", "dist-types", "node_modules"]);

function shouldCopy(source) {
  const relative = source.slice(sourceRoot.length).split(sep).filter(Boolean);
  return !relative.some((segment) => excludedNames.has(segment));
}

try {
  cpSync(sourceRoot, temporaryRoot, { recursive: true, filter: shouldCopy });
  const install = spawnSync(
    "corepack",
    ["pnpm", "install", "--frozen-lockfile", "--offline"],
    { cwd: temporaryRoot, encoding: "utf8" },
  );
  if (install.status !== 0) {
    throw new Error(`clean frozen install failed: ${install.stderr.trim()}`);
  }
  const check = spawnSync("corepack", ["pnpm", "workspace:check"], {
    cwd: temporaryRoot,
    encoding: "utf8",
  });
  if (check.status !== 0) {
    throw new Error(`clean workspace check failed: ${check.stderr.trim()}`);
  }
  console.log(`CLEAN_FROZEN_INSTALL=passed fixture=${basename(temporaryRoot)} packageManager=pnpm@10.34.0`);
} finally {
  const safePrefix = resolve(tmpdir(), "vem-p0-t1-clean-install-");
  if (!resolve(temporaryRoot).startsWith(safePrefix)) {
    console.error("ERROR: refusing to remove unexpected clean-install fixture path");
    process.exitCode = 1;
  } else {
    rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
