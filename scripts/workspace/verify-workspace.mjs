import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_NODE = "24.18.0";
const EXPECTED_PNPM = "10.34.0";
const EXPECTED_LICENSE = "Apache-2.0";

export function verifyWorkspace(root, observedNode, observedPnpm) {
  const rootPackage = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const packageFiles = readdirSync(resolve(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(root, "packages", entry.name, "package.json")))
    .map((entry) => `packages/${entry.name}/package.json`)
    .sort();
  const packages = [
    ["package.json", rootPackage],
    ...packageFiles.map((path) => [path, JSON.parse(readFileSync(resolve(root, path), "utf8"))]),
  ];
  const tsconfig = JSON.parse(readFileSync(resolve(root, "tsconfig.base.json"), "utf8"));
  const errors = [];
  if (observedNode !== EXPECTED_NODE) errors.push(`Node must be ${EXPECTED_NODE}; observed ${observedNode}`);
  if (observedPnpm !== EXPECTED_PNPM) errors.push(`pnpm must be ${EXPECTED_PNPM}; observed ${observedPnpm}`);
  if (rootPackage.packageManager !== `pnpm@${EXPECTED_PNPM}`) errors.push("packageManager does not pin the accepted pnpm version");
  if (rootPackage.engines?.node !== `=${EXPECTED_NODE}`) errors.push("engines.node does not pin the accepted Node version");
  for (const [name, metadata] of packages) {
    if (metadata.private !== true) errors.push(`${name} must be private`);
    if (metadata.license !== EXPECTED_LICENSE) errors.push(`${name} must declare ${EXPECTED_LICENSE}`);
  }
  for (const option of ["strict", "noUncheckedIndexedAccess", "exactOptionalPropertyTypes", "noImplicitOverride", "noFallthroughCasesInSwitch", "noImplicitReturns", "noUnusedLocals", "noUnusedParameters", "forceConsistentCasingInFileNames"]) {
    if (tsconfig.compilerOptions?.[option] !== true) errors.push(`tsconfig.base.json must enable ${option}`);
  }
  for (const path of [".node-version", ".nvmrc", "pnpm-lock.yaml", "pnpm-workspace.yaml", "THIRD_PARTY_NOTICES.md"]) {
    if (!existsSync(resolve(root, path))) errors.push(`missing workspace artifact: ${path}`);
  }
  return errors;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const root = process.cwd();
  const pnpmVersion = execFileSync("corepack", ["pnpm", "--version"], { cwd: root, encoding: "utf8" }).trim();
  const errors = verifyWorkspace(root, process.versions.node, pnpmVersion);
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`WORKSPACE_CHECK=passed node=${EXPECTED_NODE} pnpm=${EXPECTED_PNPM}`);
  }
}
