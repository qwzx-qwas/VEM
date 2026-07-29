import { describe, expect, it } from "vitest";

import { verifyWorkspace } from "./verify-workspace.mjs";

describe("verifyWorkspace", () => {
  it("accepts the checked-in exact workspace", () => {
    expect(verifyWorkspace(process.cwd(), "24.18.0", "10.34.0")).toEqual([]);
  });

  it("rejects an unapproved toolchain version", () => {
    expect(verifyWorkspace(process.cwd(), "24.18.1", "10.34.0")).toContain(
      "Node must be 24.18.0; observed 24.18.1",
    );
  });
});
