import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  analyzeRunEvents,
  buildTimingForensics,
  summarizePairs,
} from "./analyze-p0-t17d-timing.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const ATTEMPT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/P0-T17D/20260729T174733+0800",
);

function validEvents() {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({
      type: "item.started",
      item: { id: "command-1", type: "command_execution" },
    }),
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "command-1",
        type: "command_execution",
        aggregated_output: "ok\n",
        exit_code: 0,
      },
    }),
    JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 10,
        cached_input_tokens: 2,
        output_tokens: 3,
        reasoning_output_tokens: 1,
      },
    }),
  ].join("\n");
}

describe("P0-T17F timing forensics", () => {
  test("extracts bounded command and reported usage facts without inventing timestamps", () => {
    expect(analyzeRunEvents(validEvents())).toEqual({
      threadId: "thread-1",
      eventCount: 4,
      commandCount: 1,
      failedCommandCount: 0,
      commandOutputBytes: "3",
      usage: {
        inputTokens: "10",
        cachedInputTokens: "2",
        outputTokens: "3",
        reasoningOutputTokens: "1",
      },
      eventTimestampAvailable: false,
    });
  });

  test("fails on malformed, duplicate, incomplete or oversized event evidence", () => {
    expect(() => analyzeRunEvents("not-json")).toThrowError("P0_T17F_JSONL_INVALID");
    expect(() => analyzeRunEvents(`${validEvents()}\n${validEvents()}`))
      .toThrowError("P0_T17F_EVENT_CARDINALITY_INVALID");
    expect(() => analyzeRunEvents(validEvents().replace(
      '"type":"item.completed"',
      '"type":"item.started"',
    ))).toThrowError("P0_T17F_COMMAND_EVENTS_INVALID");
    expect(() => analyzeRunEvents(" ".repeat(16 * 1024 * 1024 + 1)))
      .toThrowError("P0_T17F_JSONL_TOO_LARGE");
  });

  test("keeps nanosecond pair arithmetic exact above Number safe-integer range", () => {
    const runs = Array.from({ length: 5 }, (_, index) => {
      const base = 9_007_199_254_740_993n + BigInt(index * 10);
      return [
        {
          taskId: `task-${index}`,
          arm: "direct-search",
          armOrder: index % 2 === 0 ? 1 : 2,
          durationNs: (base + 5n).toString(),
        },
        {
          taskId: `task-${index}`,
          arm: "vem-assisted",
          armOrder: index % 2 === 0 ? 2 : 1,
          durationNs: base.toString(),
        },
      ];
    }).flat();
    const summary = summarizePairs(runs);
    expect(summary.vemFasterPairCount).toBe(5);
    expect(summary.pairs.every((pair) => pair.vemSavingNs === "5")).toBe(true);
    expect(summary.directMedianNs).toBe("9007199254741018");
    expect(summary.vemMedianNs).toBe("9007199254741013");
  });

  test("recomputes immutable attempt-two timing and agrees with canonical verdict metrics", () => {
    const report = buildTimingForensics({
      attemptRoot: ATTEMPT_ROOT,
      repoRoot: REPO_ROOT,
    });
    expect(report).toMatchObject({
      authoritative: false,
      decisionImpact: "none-terminal-stop-preserved",
      verdict: "stop",
      phaseStatus: "failed",
      pairSummary: {
        directMedianNs: "41985459470",
        vemMedianNs: "44209203458",
        vemFasterPairCount: 2,
        secondArmFasterPairCount: 3,
      },
      observations: {
        directCommandCount: "11",
        vemCommandCount: "9",
      },
      conclusion: "insufficient-evidence-to-attribute-total-duration-difference",
    });
    expect(report.runs).toHaveLength(10);
    expect(report.runs.every((run) => run.eventTimestampAvailable === false)).toBe(true);
  });

  test("binds source/evidence hashes and states non-causal terminal limitations", () => {
    const report = buildTimingForensics({
      attemptRoot: ATTEMPT_ROOT,
      repoRoot: REPO_ROOT,
    });
    expect(report.analyzerSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(report.attemptResultManifestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(report.auditReplaySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(report.limitations).toEqual(expect.arrayContaining([
      "NO_EVENT_TIMESTAMPS",
      "POST_HOC_NON_CAUSAL",
      "NO_CROSS_ATTEMPT_POOLING",
      "DOES_NOT_REWRITE_P0_T17D_OR_AUTHORIZE_DEPENDENT_WORK",
    ]));
  });
});
