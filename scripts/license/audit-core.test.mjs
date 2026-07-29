import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { flattenLicenseReport, validateDependencyPolicy, validateVendoredAssets } from "./audit-core.mjs";

const policy = {
  dependencies: {
    allowed: ["MIT"],
    reviewRequired: ["MPL-2.0"],
    forbiddenOrRelicenseNeeded: ["AGPL-3.0-only"],
    approvedReviews: [{
      license: "MPL-2.0",
      packages: ["reviewed@1.0.0"],
      scope: "test-only",
      rationale: "fixture",
    }],
  },
};

describe("license policy", () => {
  it("normalizes and sorts pnpm license groups", () => {
    expect(flattenLicenseReport({
      MIT: [{ name: "z", versions: ["2.0.0", "1.0.0"], license: "MIT" }],
    }).map(({ name, version, license }) => ({ name, version, license }))).toEqual([
      { name: "z", version: "1.0.0", license: "MIT" },
      { name: "z", version: "2.0.0", license: "MIT" },
    ]);
  });

  it("fails closed on forbidden, unknown, and unreviewed licenses", () => {
    expect(validateDependencyPolicy([
      { name: "bad", version: "1.0.0", license: "AGPL-3.0-only" },
      { name: "unknown", version: "1.0.0", license: "NOASSERTION" },
      { name: "pending", version: "1.0.0", license: "MPL-2.0" },
    ], policy)).toHaveLength(3);
  });

  it("accepts a narrowly reviewed package and an allowed package", () => {
    expect(validateDependencyPolicy([
      { name: "allowed", version: "1.0.0", license: "MIT" },
      { name: "reviewed", version: "1.0.0", license: "MPL-2.0" },
    ], policy)).toEqual([]);
  });
});

describe("vendored asset provenance", () => {
  it("rejects an unregistered asset", () => {
    const root = mkdtempSync(join(tmpdir(), "vem-license-test-"));
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "assets", "logo.svg"), "<svg/>", "utf8");
    expect(validateVendoredAssets(root, { assets: [] })).toEqual([
      "unregistered vendored asset: assets/logo.svg",
    ]);
  });
});
