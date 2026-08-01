import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { auditCodexJsonlV2 } from "./capsule-audit-v2.mjs";
import { replayAttemptTwoAudit } from "./replay-p0-t17d-audit-v2.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const ATTEMPT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17D/20260729T174733+0800",
);

function commandEvent(command, aggregatedOutput = "") {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command,
        aggregated_output: aggregatedOutput,
      },
    }),
  ].join("\n");
}

describe("P0-T17E capsule audit v2", () => {
  test("accepts route and JSX source data without weakening safe command-path checks", () => {
    const jsonl = commandEvent(
      "/bin/bash -lc \"sed -n '1,120p' /work/vem-context.json\"",
      [
        "{\"redactedPath\":\"/\",\"textPreview\":\"/projects/:projectId\"}",
        "    <input type=\"email\" />",
        "/projects/:projectId",
        "/>",
      ].join("\n"),
    );
    expect(auditCodexJsonlV2({ jsonl })).toMatchObject({
      valid: true,
      threadIds: ["thread-1"],
      ignoredDataTokens: ["/>", "/projects/:projectId"],
      externalPaths: [],
      forbiddenMarkers: [],
    });
  });

  test("fails closed on actual command, structured-output and stderr escapes", () => {
    expect(() => auditCodexJsonlV2({
      jsonl: commandEvent("/bin/bash -lc \"cat /home/qwzx/private.txt\""),
    })).toThrowError("CAPSULE_AUDIT_V2_ESCAPE");
    expect(() => auditCodexJsonlV2({
      jsonl: commandEvent("/bin/bash -lc pwd", "/root/private.txt\n"),
    })).toThrowError("CAPSULE_AUDIT_V2_ESCAPE");
    expect(() => auditCodexJsonlV2({
      jsonl: commandEvent("/bin/bash -lc true"),
      stderr: "find: /mnt/d/VEM: Permission denied",
    })).toThrowError("CAPSULE_AUDIT_V2_ESCAPE");
  });

  test("rejects forbidden rule and skill markers anywhere in command evidence", () => {
    expect(() => auditCodexJsonlV2({
      jsonl: commandEvent(
        "/bin/bash -lc \"sed -n '1,20p' relative/path\"",
        "loaded .agents/skills/visual-ui-edit/SKILL.md",
      ),
    })).toThrowError("CAPSULE_AUDIT_V2_ESCAPE");
  });

  test("rejects malformed and oversized audit inputs", () => {
    expect(() => auditCodexJsonlV2({ jsonl: "not-json" }))
      .toThrowError("CAPSULE_AUDIT_V2_JSONL_INVALID");
    expect(() => auditCodexJsonlV2({ jsonl: " ".repeat(16 * 1024 * 1024 + 1) }))
      .toThrowError("CAPSULE_AUDIT_V2_INPUT_TOO_LARGE");
  });

  test("replays all immutable attempt-two streams while preserving stop and legacy hashes", () => {
    const replay = replayAttemptTwoAudit({
      attemptRoot: ATTEMPT_ROOT,
      repoRoot: REPO_ROOT,
    });
    expect(replay).toMatchObject({
      authoritative: false,
      decisionImpact: "none-terminal-stop-preserved",
      verdict: "stop",
      phaseStatus: "failed",
      runCount: 10,
      legacyFailureCount: 7,
      v2PassCount: 10,
      legacyCapsuleSha256: "13a92abba7c00a89d2dc0e9344f590edd0808a0063723b2a005ac423cf626956",
      legacyRunnerSha256: "25f76241ed3a5a124e595d5b2667b02d668b75314096b0368618e207a16946ae",
    });
    expect(replay.runs).toHaveLength(10);
    expect(replay.runs.every((run) => run.v2Audit.valid)).toBe(true);
    expect(replay.auditorV2Sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(replay.replayRunnerSha256).toMatch(/^[a-f0-9]{64}$/u);
  });
});
