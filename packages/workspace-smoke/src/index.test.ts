import { describe, expect, it } from "vitest";

import { workspaceIdentity } from "./index.js";

describe("workspaceIdentity", () => {
  it("exposes only the P0-T1 private workspace seam", () => {
    expect(workspaceIdentity()).toEqual({
      packageName: "@vem/workspace-smoke",
      stage: "P0-T1",
      privatePackage: true,
    });
  });
});
