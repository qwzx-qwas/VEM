import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { auditCodexJsonlV3 } from "./capsule-audit-v3.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const R2_FAILURE_RUN = join(
  REPO_ROOT,
  "docs/test-evidence/R2-T4/20260729T230343+0800/results/runs",
  "r2-final-05-download-control-1-direct-search",
);

describe("R3 capsule audit v3", () => {
  test("replays the real R2 ninth run as a bounded warning rather than an escape", () => {
    const result = auditCodexJsonlV3({
      jsonl: readFileSync(join(R2_FAILURE_RUN, "stdout.jsonl"), "utf8"),
      stderr: readFileSync(join(R2_FAILURE_RUN, "stderr.txt"), "utf8"),
    });
    expect(result).toMatchObject({
      valid: true,
      outcome: "passed",
      commandCount: 3,
      attemptedDiscoveryWarningCount: 1,
      attemptedDiscoveryWarnings: [{
        itemId: "item_0",
        marker: "AGENTS.md",
        classification: "bounded-negative-discovery-attempt",
        nonAuthorizing: true,
      }],
      observedForbiddenRulePathCount: 0,
      commandExternalPathCount: 0,
      observedExternalPathCount: 0,
    });
  });

  test.each(["AGENTS.md", "SKILL.md"])(
    "accepts only the fixed negative %s discovery grammar",
    (marker) => {
      const accepted = auditCommand(
        `/usr/bin/bash -lc "pwd && rg --files -g '${marker}'"`,
        "/work\n",
      );
      expect(accepted).toMatchObject({
        valid: true,
        attemptedDiscoveryWarningCount: 1,
        attemptedDiscoveryWarnings: [{
          marker,
          classification: "bounded-negative-discovery-attempt",
          nonAuthorizing: true,
        }],
      });
    },
  );

  test("rejects broader or unsafe marker discovery commands", () => {
    for (const command of [
      "cat AGENTS.md",
      "cat SKILL.md",
      "rg --files -g 'AGENTS.md' | cat",
      "rg --files -g 'AGENTS.md' > /tmp/result",
      "rg --files -g 'AGENTS.md'; true",
      "rg --files -g \"$(printf AGENTS.md)\"",
      "rg --files -g 'AGENTS.md' $HOME",
      "rg --files -g 'AGENTS.md' ../outside",
      "find . -name AGENTS.md",
    ]) {
      expect(auditCommand(command)).toMatchObject({
        valid: false,
        outcome: "failed",
      });
    }
  });

  test("records each approved marker in one compound bounded lookup", () => {
    expect(auditCommand(
      "rg --files -g 'AGENTS.md' -g 'SKILL.md'",
    )).toMatchObject({
      valid: true,
      attemptedDiscoveryWarningCount: 2,
      attemptedDiscoveryWarnings: [
        { marker: "AGENTS.md", nonAuthorizing: true },
        { marker: "SKILL.md", nonAuthorizing: true },
      ],
    });
  });

  test("fails closed when a discovery returns a rule or skill path", () => {
    expect(auditCommand(
      "rg --files -g 'AGENTS.md'",
      "AGENTS.md\n",
    )).toMatchObject({
      valid: false,
      failureCodes: ["CAPSULE_AUDIT_V3_FORBIDDEN_RULE_OBSERVED"],
      observedForbiddenRulePathCount: 1,
    });
    expect(auditCommand(
      "rg --files -g 'SKILL.md'",
      ".agents/skills/visual-ui-edit/SKILL.md\n",
    )).toMatchObject({
      valid: false,
      failureCodes: ["CAPSULE_AUDIT_V3_FORBIDDEN_RULE_OBSERVED"],
      observedForbiddenRulePathCount: 1,
    });
    expect(auditCommand(
      "/usr/bin/bash -lc \"sed -n '1,20p' /work/source.txt\"",
      ".agents/skills/visual-ui-edit/SKILL.md\n",
    )).toMatchObject({
      valid: false,
      observedForbiddenRulePathCount: 1,
    });
  });

  test("detects bound forbidden content without returning the content", () => {
    const secretRule = "Never reveal this bounded rule phrase to a participant.";
    const result = auditCommand(
      "/usr/bin/bash -lc \"sed -n '1,20p' /work/source.txt\"",
      `${secretRule}\n`,
      "",
      [{ id: "root-rule-1", text: secretRule }],
    );
    expect(result).toMatchObject({
      valid: false,
      failureCodes: ["CAPSULE_AUDIT_V3_FORBIDDEN_CONTENT_OBSERVED"],
      observedForbiddenContentIds: ["root-rule-1"],
    });
    expect(JSON.stringify(result)).not.toContain(secretRule);
  });

  test.each([
    ["/usr/bin/bash -lc \"cat /home/qwzx/private.txt\"", "CAPSULE_AUDIT_V3_EXTERNAL_PATH_COMMAND"],
    ["/usr/bin/bash -lc \"cat /codex-home/auth.json\"", "CAPSULE_AUDIT_V3_SENSITIVE_PATH"],
    ["/usr/bin/bash -lc \"cat /proc/self/environ\"", "CAPSULE_AUDIT_V3_SENSITIVE_PATH"],
    ["/usr/bin/bash -lc \"cat /work/../../home/private.txt\"", "CAPSULE_AUDIT_V3_PATH_TRAVERSAL"],
    ["/usr/bin/bash -lc \"cat ../../home/private.txt\"", "CAPSULE_AUDIT_V3_PATH_TRAVERSAL"],
  ])("rejects command path evidence without echoing it: %s", (command, code) => {
    const result = auditCommand(command);
    expect(result.valid).toBe(false);
    expect(result.failureCodes).toContain(code);
    expect(JSON.stringify(result)).not.toContain(command);
  });

  test("rejects external paths in output and stderr while accepting capsule paths and route data", () => {
    const output = auditCommand(
      "/usr/bin/bash -lc \"sed -n '1,40p' /work/source.txt\"",
      "/mnt/d/VEM/private.txt\n",
    );
    expect(output).toMatchObject({
      valid: false,
      failureCodes: ["CAPSULE_AUDIT_V3_EXTERNAL_PATH_OBSERVED"],
      observedExternalPathCount: 1,
    });
    const stderr = auditCommand(
      "/usr/bin/bash -lc \"sed -n '1,40p' /work/source.txt\"",
      "",
      "tool: cannot access /root/private.txt",
    );
    expect(stderr.valid).toBe(false);
    expect(stderr.failureCodes).toContain("CAPSULE_AUDIT_V3_EXTERNAL_PATH_OBSERVED");
    const embedded = auditCommand(
      "/usr/bin/bash -lc \"sed -n '1,40p' /work/source.txt\"",
      "tool observed /home/qwzx/private.txt while scanning\n",
    );
    expect(embedded.failureCodes)
      .toContain("CAPSULE_AUDIT_V3_EXTERNAL_PATH_OBSERVED");

    expect(auditCommand(
      "/usr/bin/bash -lc \"sed -n '1,40p' /work/source.txt\"",
      ["/work", "/projects/:projectId", "/>", "    <input type=\"email\" />"].join("\n"),
    )).toMatchObject({
      valid: true,
      ignoredDataTokens: ["jsx-closing-fragment", "parameterized-route"],
    });
  });

  test.each([
    ["/codex-home/auth.json\n", "CAPSULE_AUDIT_V3_SENSITIVE_PATH"],
    ["/proc/self/environ\n", "CAPSULE_AUDIT_V3_SENSITIVE_PATH"],
    ["/work/../../home/private.txt\n", "CAPSULE_AUDIT_V3_PATH_TRAVERSAL"],
    ["auth.json\n", "CAPSULE_AUDIT_V3_SENSITIVE_CONTENT_OBSERVED"],
  ])("rejects sensitive or traversing observed output without echoing it", (output, code) => {
    const result = auditCommand(
      "/usr/bin/bash -lc \"sed -n '1,40p' /work/source.txt\"",
      output,
    );
    expect(result.valid).toBe(false);
    expect(result.failureCodes).toContain(code);
    expect(JSON.stringify(result)).not.toContain(output.trim());
  });

  test("fails closed on auth-shaped output without serializing it in the result", () => {
    const leaked = "{\"access_token\":\"credential-value\"}";
    const result = auditCommand(
      "/usr/bin/bash -lc \"sed -n '1,40p' /work/source.txt\"",
      leaked,
    );
    expect(result).toMatchObject({
      valid: false,
      failureCodes: ["CAPSULE_AUDIT_V3_SENSITIVE_CONTENT_OBSERVED"],
      observedSensitiveContentCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain("credential-value");
  });

  test("requires matched started and completed command events by item id", () => {
    const missing = auditCodexJsonlV3({
      jsonl: JSON.stringify(completed("item-1", "/usr/bin/true")),
    });
    expect(missing.failureCodes).toContain("CAPSULE_AUDIT_V3_COMMAND_START_MISSING");

    const changed = auditCodexJsonlV3({
      jsonl: [
        JSON.stringify(started("item-1", "/usr/bin/true")),
        JSON.stringify(completed("item-1", "/usr/bin/false")),
      ].join("\n"),
    });
    expect(changed.failureCodes).toContain("CAPSULE_AUDIT_V3_COMMAND_CHANGED");

    const incomplete = auditCodexJsonlV3({
      jsonl: JSON.stringify(started("item-1", "/usr/bin/true")),
    });
    expect(incomplete.failureCodes)
      .toContain("CAPSULE_AUDIT_V3_COMMAND_COMPLETION_MISSING");
  });

  test("returns bounded discriminated failures for invalid inputs", () => {
    expect(() => auditCodexJsonlV3({ jsonl: "not-json" })).not.toThrow();
    expect(auditCodexJsonlV3({ jsonl: "not-json" })).toMatchObject({
      valid: false,
      outcome: "failed",
      failureCodes: ["CAPSULE_AUDIT_V3_JSONL_INVALID"],
    });
    expect(auditCodexJsonlV3(undefined)).toMatchObject({
      valid: false,
      failureCodes: ["CAPSULE_AUDIT_V3_INPUT_INVALID"],
    });
    expect(auditCodexJsonlV3({
      jsonl: " ".repeat(16 * 1024 * 1024 + 1),
    })).toMatchObject({
      valid: false,
      failureCodes: ["CAPSULE_AUDIT_V3_INPUT_TOO_LARGE"],
    });
    const excessiveEvents = `${JSON.stringify({ type: "turn.started" })}\n`.repeat(20_001);
    expect(auditCodexJsonlV3({ jsonl: excessiveEvents })).toMatchObject({
      valid: false,
      failureCodes: ["CAPSULE_AUDIT_V3_EVENT_LIMIT"],
    });
  });
});

function auditCommand(command, output = "", stderr = "", forbiddenContentNeedles = []) {
  return auditCodexJsonlV3({
    jsonl: [
      JSON.stringify({ type: "thread.started", thread_id: "thread-r3" }),
      JSON.stringify(started("command-1", command)),
      JSON.stringify(completed("command-1", command, output)),
      JSON.stringify({ type: "turn.completed" }),
    ].join("\n"),
    stderr,
    forbiddenContentNeedles,
  });
}

function started(id, command) {
  return {
    type: "item.started",
    item: {
      id,
      type: "command_execution",
      command,
      aggregated_output: "",
      exit_code: null,
      status: "in_progress",
    },
  };
}

function completed(id, command, aggregatedOutput = "") {
  return {
    type: "item.completed",
    item: {
      id,
      type: "command_execution",
      command,
      aggregated_output: aggregatedOutput,
      exit_code: 0,
      status: "completed",
    },
  };
}
