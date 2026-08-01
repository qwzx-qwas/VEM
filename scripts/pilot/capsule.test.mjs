import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  assertIntendedCapsuleDifference,
  auditCodexJsonl,
  buildCodexCapsuleInvocation,
  cleanupParticipantCapsule,
  createParticipantCapsule,
  runCodexBinaryIsolationProbe,
  runFilesystemIsolationProbe,
} from "./capsule.mjs";

const temporaryRoots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vem-p0-t17c-test-source-"));
  temporaryRoots.push(root);
  const source = join(root, "packages/demo-fixture/src");
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, "App.tsx"), "export function App(){return <main/>}\n");
  writeFileSync(join(source, "fixtures.ts"), "export const FIXTURE = true;\n");
  const responseSchema = join(root, "response-schema.json");
  const vemContext = join(root, "vem-context.json");
  writeFileSync(responseSchema, "{\"type\":\"object\"}\n");
  writeFileSync(vemContext, "{\"directPrimary\":{\"ok\":true}}\n");
  return { root, responseSchema, vemContext };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("P0-T17C participant capsule", () => {
  test("exports identical base inputs with only VEM context as the treatment difference", () => {
    const input = fixture();
    const direct = createParticipantCapsule({
      sourceRoot: input.root,
      taskId: "task-1",
      arm: "direct-search",
      responseSchemaPath: input.responseSchema,
    });
    const vem = createParticipantCapsule({
      sourceRoot: input.root,
      taskId: "task-1",
      arm: "vem-assisted",
      responseSchemaPath: input.responseSchema,
      vemContextPath: input.vemContext,
    });
    temporaryRoots.push(direct.capsuleRoot, vem.capsuleRoot);
    expect(assertIntendedCapsuleDifference(direct.manifest, vem.manifest)).toMatchObject({
      valid: true,
      onlyDifference: "vem-context.json",
      baseContextHash: direct.manifest.baseContextHash,
    });
    expect(direct.manifest.workspaceFiles.map((file) => file.path)).toEqual([
      ".pilot/response-schema.json",
      "packages/demo-fixture/src/App.tsx",
      "packages/demo-fixture/src/fixtures.ts",
    ]);
    expect(vem.manifest.workspaceFiles.map((file) => file.path)).toContain("vem-context.json");
    expect(readFileSync(join(vem.controlRoot, "manifest.json"), "utf8")).not.toContain(input.root);
  });

  test.runIf(process.platform === "linux")("hides repository, home, rules and skills in a real Bubblewrap filesystem probe", () => {
    const input = fixture();
    const capsule = createParticipantCapsule({
      sourceRoot: input.root,
      taskId: "task-2",
      arm: "direct-search",
      responseSchemaPath: input.responseSchema,
    });
    temporaryRoots.push(capsule.capsuleRoot);
    expect(runFilesystemIsolationProbe(capsule)).toEqual({
      ok: true,
      stdout: "P0_T17C_CAPSULE_PROBE=passed",
      repositoryPathVisible: false,
      homeVisible: false,
      fixtureReadable: true,
    });
    expect(runCodexBinaryIsolationProbe(capsule)).toMatchObject({
      ok: true,
      version: expect.stringMatching(/^codex-cli \d+\.\d+\.\d+/u),
      repositoryPathVisible: false,
      codexHome: "tmpfs",
    });
  });

  test("builds a Codex invocation with outer capsule and inner read-only sandbox without recording auth", () => {
    const input = fixture();
    const capsule = createParticipantCapsule({
      sourceRoot: input.root,
      taskId: "task-3",
      arm: "direct-search",
      responseSchemaPath: input.responseSchema,
    });
    temporaryRoots.push(capsule.capsuleRoot);
    const auth = join(input.root, "auth.json");
    writeFileSync(auth, "{}\n");
    chmodSync(auth, 0o600);
    const invocation = buildCodexCapsuleInvocation({
      capsule,
      prompt: "Locate the source.",
      model: "gpt-5.6-sol",
      authFile: auth,
    });
    expect(invocation.executable).toBe("/usr/bin/bwrap");
    expect(invocation.args).toContain("--ro-bind");
    expect(invocation.args).toContain("/work");
    expect(invocation.args).toContain("read-only");
    expect(invocation.args).toContain(auth);
    expect(JSON.stringify(invocation.evidence)).not.toContain(input.root);
    expect(JSON.stringify(invocation.evidence)).not.toContain(auth);
    expect(invocation.evidence).toMatchObject({
      outerFilesystem: "bubblewrap-readonly-capsule",
      innerCodexSandbox: "read-only",
      repositoryMount: "absent",
    });
  });

  test("fails closed on repo skill/rule leakage or command paths outside the capsule", () => {
    const valid = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "/bin/bash -lc \"rg -n target /work/packages/demo-fixture/src/App.tsx\"",
          aggregated_output: "/work/packages/demo-fixture/src/App.tsx:35:<li>",
        },
      }),
    ].join("\n");
    expect(auditCodexJsonl({ jsonl: valid })).toMatchObject({
      valid: true,
      threadIds: ["thread-1"],
      externalPaths: [],
      forbiddenMarkers: [],
    });
    const escaped = JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "/bin/bash -lc \"sed -n 1,20p /home/qwzx/src/VEM/.agents/skills/visual-ui-edit/SKILL.md\"",
        aggregated_output: "",
      },
    });
    expect(() => auditCodexJsonl({ jsonl: escaped })).toThrowError("CAPSULE_COMMAND_PATH_ESCAPE");
    expect(() => auditCodexJsonl({
      jsonl: valid,
      stderr: "WARN loaded /home/qwzx/.codex/skills/.system",
    })).toThrowError("CAPSULE_COMMAND_PATH_ESCAPE");
  });

  test("rejects symlinked fixture inputs and unsafe cleanup targets", () => {
    const input = fixture();
    const target = join(input.root, "outside.tsx");
    writeFileSync(target, "export const OUTSIDE = true;\n");
    const app = join(input.root, "packages/demo-fixture/src/App.tsx");
    rmSync(app);
    symlinkSync(target, app);
    expect(() => createParticipantCapsule({
      sourceRoot: input.root,
      taskId: "task-4",
      arm: "direct-search",
      responseSchemaPath: input.responseSchema,
    })).toThrowError("CAPSULE_INPUT_SYMLINK_REJECTED");
    expect(() => cleanupParticipantCapsule({ capsuleRoot: input.root })).toThrowError("CAPSULE_CLEANUP_REFUSED");
  });
});
