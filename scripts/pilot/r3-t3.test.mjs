import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { R3_TASKS } from "./r3-recovery-plan.mjs";
import {
  prepareR3RecoveryPreregistration,
  R3_PREREGISTERED_RUNTIME_SOURCE_PATHS,
} from "./r3-t3.mjs";
import {
  R3_RUNTIME_SOURCE_PATHS,
  verifyR3Preregistration,
} from "./r3-t4.mjs";

const R2_INSTRUMENTATION_HASH =
  "09e237ddec722207ee3b2e22c714ca5631700ff7393877a66fdd75d04c46b8a0";
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("R3-T3 frozen containment-only preregistration", () => {
  test("freezes five fresh pairs with no external or product authorization", () => {
    const output = prepareUnitPreregistration();
    const plan = readJson(join(output, "PREREGISTRATION.json"));
    const manifest = readJson(join(output, "inputs/task-manifest.json"));
    const result = verifyR3Preregistration(output, {
      requirePermissionProbes: false,
    });

    expect(result).toBe(
      readFileSync(join(output, "PREREGISTRATION.sha256"), "utf8").trim(),
    );
    expect(plan).toMatchObject({
      decisionKey: "R3-RECOVERY",
      decisionAttempt: 1,
      doesNotSupersede: "R2-RECOVERY",
      alsoDoesNotSupersede: ["R1-RECOVERY", "R0-RECOVERY", "P0-VALUE"],
      taskCount: 5,
      runCount: 10,
      externalExecutionAuthorized: false,
      productUnlockCount: 0,
      productHoldoutConsumed: false,
      groundTruthParticipantVisible: false,
      auditContentNeedlesParticipantVisible: false,
      priorInstrumentationHash: R2_INSTRUMENTATION_HASH,
    });
    expect(plan.instrumentationHash).not.toBe(R2_INSTRUMENTATION_HASH);
    expect(manifest.tasks.map((task) => task.taskId)).toEqual(
      R3_TASKS.map((task) => task.taskId),
    );
    expect(new Set(manifest.tasks.map((task) => task.promptHash)).size).toBe(5);
    expect(manifest.tasks.every((task) => (
      !plan.priorTaskIdsExcluded.includes(task.taskId)
        && !plan.priorPromptHashesExcluded.includes(task.promptHash)
        && !plan.productHoldoutTaskIds.includes(task.taskId)
    ))).toBe(true);
  });

  test("binds the exact transitive runtime set and equal base capsules", () => {
    const output = prepareUnitPreregistration();
    const plan = readJson(join(output, "PREREGISTRATION.json"));
    expect([...R3_PREREGISTERED_RUNTIME_SOURCE_PATHS].sort()).toEqual(
      [...R3_RUNTIME_SOURCE_PATHS].sort(),
    );
    expect(Object.keys(plan.sourceBindings).sort()).toEqual(
      [...R3_RUNTIME_SOURCE_PATHS].sort(),
    );
    for (const task of R3_TASKS) {
      const proof = readJson(join(output, `capsules/${task.taskId}.json`));
      expect(proof).toMatchObject({
        taskId: task.taskId,
        onlyDifference: "vem-context.json",
        probes: { skippedForUnitTest: true },
      });
      expect(proof.directManifest.baseContextHash)
        .toBe(proof.vemManifest.baseContextHash);
      expect(proof.directManifest.allowedDifference).toEqual([]);
      expect(proof.vemManifest.allowedDifference).toEqual(["vem-context.json"]);
    }
  });

  test("keeps private ground truth, audit needles and holdouts out of capsules", () => {
    const output = prepareUnitPreregistration();
    const participantText = collectText(join(output, "participant"));
    const privateNeedles = readJson(
      join(output, "private/audit-content-needles.json"),
    );
    const holdout = readJson(
      join(output, "private/product-holdout-exclusion.json"),
    );
    expect(participantText).not.toContain("audit-content-needles");
    expect(participantText).not.toContain("ground-truth");
    for (const needle of privateNeedles.needles) {
      expect(participantText).not.toContain(needle.text);
    }
    for (const taskId of holdout.taskIds) {
      expect(R3_TASKS.map((task) => task.taskId)).not.toContain(taskId);
    }
  });
});

function prepareUnitPreregistration() {
  const root = mkdtempSync(join(tmpdir(), "vem-r3-t3-test-"));
  roots.push(root);
  const output = join(root, "preregistration");
  prepareR3RecoveryPreregistration({
    outputRoot: output,
    runProbes: false,
    enforceEvidenceParent: false,
  });
  return output;
}

function collectText(root) {
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory()
        ? collectText(path)
        : readFileSync(path, "utf8");
    })
    .join("\n");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
