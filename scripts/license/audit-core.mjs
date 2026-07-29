import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const ASSET_EXTENSIONS = new Set([
  ".avif", ".eot", ".gif", ".ico", ".jpeg", ".jpg", ".otf", ".png", ".svg",
  ".ttf", ".webp", ".woff", ".woff2",
]);

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function flattenLicenseReport(report) {
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("license report must be an object keyed by SPDX expression");
  }
  const records = [];
  for (const [licenseKey, packages] of Object.entries(report)) {
    if (!Array.isArray(packages)) throw new Error(`license group ${licenseKey} must be an array`);
    for (const packageRecord of packages) {
      if (packageRecord === null || typeof packageRecord !== "object" ||
          typeof packageRecord.name !== "string" || !Array.isArray(packageRecord.versions)) {
        throw new Error(`malformed package record in ${licenseKey}`);
      }
      const license = typeof packageRecord.license === "string" ? packageRecord.license : licenseKey;
      for (const version of packageRecord.versions) {
        if (typeof version !== "string" || version.length === 0) {
          throw new Error(`malformed version for ${packageRecord.name}`);
        }
        records.push({
          name: packageRecord.name,
          version,
          license,
          homepage: typeof packageRecord.homepage === "string" ? packageRecord.homepage : null,
        });
      }
    }
  }
  const unique = new Map();
  for (const record of records) {
    const key = `${record.name}@${record.version}`;
    const existing = unique.get(key);
    if (existing !== undefined && existing.license !== record.license) {
      throw new Error(`conflicting licenses for ${key}`);
    }
    unique.set(key, record);
  }
  return [...unique.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
}

export function validateDependencyPolicy(records, policy) {
  const dependencies = policy?.dependencies;
  if (dependencies === null || typeof dependencies !== "object") {
    return ["dependency policy is missing dependencies"];
  }
  const allowed = new Set(dependencies.allowed ?? []);
  const reviewRequired = new Set(dependencies.reviewRequired ?? []);
  const forbidden = new Set(dependencies.forbiddenOrRelicenseNeeded ?? []);
  const approvals = new Map();
  for (const review of dependencies.approvedReviews ?? []) {
    for (const packageId of review.packages ?? []) approvals.set(`${review.license}:${packageId}`, review);
  }
  const errors = [];
  for (const record of records) {
    const packageId = `${record.name}@${record.version}`;
    if (forbidden.has(record.license)) {
      errors.push(`${packageId} uses forbidden/relicense-needed ${record.license}`);
    } else if (reviewRequired.has(record.license)) {
      const approval = approvals.get(`${record.license}:${packageId}`);
      if (approval === undefined || typeof approval.scope !== "string" ||
          typeof approval.rationale !== "string") {
        errors.push(`${packageId} requires an explicit ${record.license} review`);
      }
    } else if (!allowed.has(record.license)) {
      errors.push(`${packageId} has unknown license ${record.license}`);
    }
  }
  return errors;
}

function walk(root, current, output) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if ([".git", "coverage", "dist", "node_modules"].includes(entry.name)) continue;
    const absolute = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`vendored scan refuses symlink: ${relative(root, absolute)}`);
    if (entry.isDirectory()) walk(root, absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
}

export function discoverVendoredAssets(root) {
  const files = [];
  walk(root, root, files);
  return files
    .map((absolute) => ({ absolute, path: relative(root, absolute).split(sep).join("/") }))
    .filter(({ path }) => path.split("/").includes("vendor") || ASSET_EXTENSIONS.has(extname(path).toLowerCase()))
    .map(({ absolute, path }) => ({ path, sha256: sha256File(absolute) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function validateVendoredAssets(root, manifest) {
  const registered = new Map();
  for (const asset of manifest.assets ?? []) {
    if (typeof asset.path !== "string" || typeof asset.sha256 !== "string" ||
        typeof asset.source !== "string" || typeof asset.license !== "string") {
      return ["vendored asset entries require path, sha256, source, and license"];
    }
    registered.set(asset.path, asset);
  }
  const errors = [];
  for (const asset of discoverVendoredAssets(root)) {
    const entry = registered.get(asset.path);
    if (entry === undefined) errors.push(`unregistered vendored asset: ${asset.path}`);
    else if (entry.sha256 !== asset.sha256) errors.push(`vendored asset hash mismatch: ${asset.path}`);
  }
  for (const path of registered.keys()) {
    if (!existsSync(join(root, path))) errors.push(`registered vendored asset is missing: ${path}`);
  }
  return errors;
}

export function validatePackageMetadata(root, expectedLicense) {
  const files = [];
  walk(root, root, files);
  const packageFiles = files.filter((path) => path.endsWith(`${sep}package.json`) || path === join(root, "package.json"));
  const errors = [];
  for (const path of packageFiles) {
    if (!lstatSync(path).isFile()) {
      errors.push(`package metadata is not a regular file: ${relative(root, path)}`);
      continue;
    }
    const metadata = JSON.parse(readFileSync(path, "utf8"));
    if (metadata.private !== true) errors.push(`${relative(root, path)} must remain private in P0-T1`);
    if (metadata.license !== expectedLicense) errors.push(`${relative(root, path)} license must be ${expectedLicense}`);
  }
  return errors;
}

export function renderThirdPartyNotices(records, lockfileSha256) {
  const licenses = [...new Set(records.map((record) => record.license))].sort();
  const lines = [
    "# Third-Party Notices", "",
    "> Generated by `pnpm license:generate`; do not edit by hand.",
    "> Scope: P0-T1 development-only dependency graph. No production dependency or vendored asset is present.",
    `> pnpm-lock.yaml SHA-256: \`${lockfileSha256}\``,
    `> Package records: ${records.length}; license expressions: ${licenses.join(", ")}`,
    "", "| Package | Version | License | Upstream |", "|---|---:|---|---|",
  ];
  for (const record of records) {
    const homepage = record.homepage === null ? "not reported" : record.homepage;
    lines.push(`| \`${record.name}\` | \`${record.version}\` | \`${record.license}\` | ${homepage} |`);
  }
  lines.push("", "MPL-2.0 dependencies are explicitly reviewed in `docs/dependency-policy.json` for this development-only lockfile baseline. Every lockfile, release/tag, distribution, or vendored-asset change requires a fresh review.", "");
  return lines.join("\n");
}
