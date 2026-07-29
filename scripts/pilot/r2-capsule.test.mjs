import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import {
  buildR2CodexCapsuleInvocation,
  runR2FinalOutputIsolationProbe,
} from "./r2-capsule.mjs";

const capsules = [];

afterEach(() => {
  for (const capsule of capsules.splice(0)) cleanupParticipantCapsule(capsule);
});

describe("R2 single-file capsule output boundary", () => {
  test("keeps /work read-only and exposes only one writable final-response file", () => {
    const capsule = fixtureCapsule();
    const probe = runR2FinalOutputIsolationProbe(capsule);
    expect(probe).toMatchObject({
      ok: true,
      workspaceWritable: false,
      outputSiblingWritable: false,
      authoritativeFileWritable: true,
    });
    expect(readFileSync(probe.hostOutputPath, "utf8")).toBe("R2_FINAL_OUTPUT_PROBE");
  });

  test("adds output-last-message without broadening the workspace mount", () => {
    const capsule = fixtureCapsule();
    const invocation = buildR2CodexCapsuleInvocation({
      capsule,
      prompt: "Return the bounded JSON response.",
      model: "gpt-5.6-sol",
      authFile: join(process.env.HOME, ".codex/auth.json"),
    });
    expect(invocation.args).toContain("--output-last-message");
    expect(invocation.args).toContain("/run/vem/final-response.json");
    const workspaceBind = invocation.args.findIndex((value, index) => (
      value === "--ro-bind" && invocation.args[index + 2] === "/work"
    ));
    expect(workspaceBind).toBeGreaterThan(-1);
    expect(invocation.evidence).toMatchObject({
      workspaceMount: "/work:ro",
      authoritativeResponseMount: "/run/vem/final-response.json:rw-single-file",
    });
  });
});

function fixtureCapsule() {
  const capsule = createParticipantCapsule({
    sourceRoot: resolve("docs/test-evidence/R1-T3/20260729T203631+0800/fixture"),
    taskId: "r2-capsule-probe",
    arm: "direct-search",
    responseSchemaPath: resolve("docs/test-evidence/R1-T3/20260729T203631+0800/inputs/response-schema.json"),
  });
  capsules.push(capsule);
  return capsule;
}
