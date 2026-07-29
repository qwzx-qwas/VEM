import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  flattenLicenseReport,
  renderThirdPartyNotices,
  sha256File,
  validateDependencyPolicy,
  validatePackageMetadata,
  validateVendoredAssets,
} from "./audit-core.mjs";

const mode = process.argv[2];
if (!new Set(["--check", "--write"]).has(mode)) {
  throw new Error("usage: node scripts/license/audit.mjs --check|--write");
}

const root = process.cwd();
const policy = JSON.parse(readFileSync(resolve(root, "docs/dependency-policy.json"), "utf8"));
const vendored = JSON.parse(readFileSync(resolve(root, "docs/vendored-assets.json"), "utf8"));
const reportText = execFileSync("corepack", ["pnpm", "licenses", "list", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
const records = flattenLicenseReport(JSON.parse(reportText));
const errors = [
  ...validatePackageMetadata(root, policy.project.spdxLicense),
  ...validateDependencyPolicy(records, policy),
  ...validateVendoredAssets(root, vendored),
];
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  const notices = renderThirdPartyNotices(records, sha256File(resolve(root, "pnpm-lock.yaml")));
  const noticePath = resolve(root, "THIRD_PARTY_NOTICES.md");
  if (mode === "--write") {
    writeFileSync(noticePath, notices, "utf8");
  } else if (readFileSync(noticePath, "utf8") !== notices) {
    console.error("ERROR: THIRD_PARTY_NOTICES.md is stale; run pnpm license:generate");
    process.exitCode = 1;
  }
  if (process.exitCode !== 1) {
    console.log(`LICENSE_AUDIT=passed packages=${records.length} vendored=${vendored.assets.length}`);
  }
}
