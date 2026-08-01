import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { verifyR7Preregistration } from "./r7-t3.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R7-T3");
const CURRENT = readFileSync(join(EVIDENCE_PARENT, "CURRENT"), "utf8").trim();
const EVIDENCE_ROOT = join(EVIDENCE_PARENT, CURRENT);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("committed R7-T3 preregistration evidence", () => {
  test("verifies all frozen hashes and real local probes", () => {
    const verified = verifyR7Preregistration(EVIDENCE_ROOT);
    expect(verified).toMatchObject({
      valid: true,
      preregistrationHash:
        "bc2bd50ca79aaac581c083232d4bf0d55b838c64228039921e6ae1adbb8a4a78",
      plan: {
        instrumentationHash:
          "ce7979ebf9414da72e7afb65de178da3c5da6dc49990d8f8088c2ba01f5a5274",
        dataScopeHash:
          "fca7658cc49b0e7eba3c29354a63433282a85048ff960122b7bd890a470dd8a7",
        failurePolicyHash:
          "9e9f3174f794ea1ed2ec18a54f983117179a867985c4107ca37e0425948588fa",
        retryIsolationHash:
          "d847e93ad6d5ae3b0336d465105dc1f62bf0a92bcf7eda5307053b7b7ae8f79c",
        terminationPolicyHash:
          "caa4ff6248fca549c601cb7bdcd80813bb91ee646606cacce627111deae16372",
        outerEnvironmentHash:
          "cf24c3c5e349e230a9c04223dceb4854bd377915e21f46d830134b085bc3579d",
        externalExecutionAuthorized: false,
        productUnlockCount: 0,
      },
    });
    for (const task of verified.manifest.tasks) {
      const proof = readJson(join(EVIDENCE_ROOT, `capsules/${task.taskId}.json`));
      expect(proof.probes).toMatchObject({
        directFilesystem: { ok: true },
        directCodexBinary: { ok: true },
        directPermissionProfile: { ok: true, modelCall: false },
        vemFilesystem: { ok: true },
        vemCodexBinary: { ok: true },
        vemPermissionProfile: { ok: true, modelCall: false },
      });
    }
  });

  test("fails closed when participant data or a bound source changes", () => {
    const parent = mkdtempSync(join(tmpdir(), "vem-r7-t3-evidence-mutation-"));
    temporaryRoots.push(parent);
    const copy = join(parent, "copy");
    cpSync(EVIDENCE_ROOT, copy, { recursive: true });
    const prompt = join(
      copy,
      "participant/tasks/r7-retry-isolation-01-control-root/prompt.txt",
    );
    writeFileSync(prompt, `${readFileSync(prompt, "utf8")}drift\n`, "utf8");
    expect(() => verifyR7Preregistration(copy))
      .toThrowError("R7_T3_PREREGISTRATION_CHANGED");

    const verified = verifyR7Preregistration(EVIDENCE_ROOT);
    const sourceBindings = {
      ...verified.plan.sourceBindings,
      "scripts/pilot/r7-attempt-factory.mjs": "0".repeat(64),
    };
    const plan = readJson(join(copy, "PREREGISTRATION.json"));
    plan.sourceBindings = sourceBindings;
    writeFileSync(join(copy, "PREREGISTRATION.json"), `${JSON.stringify(plan)}\n`, "utf8");
    expect(() => verifyR7Preregistration(copy)).toThrowError();
  });

  test("records no external grant, participant process, provider request or model call", () => {
    const plan = readJson(join(EVIDENCE_ROOT, "PREREGISTRATION.json"));
    const text = readFileSync(join(EVIDENCE_ROOT, "PREREGISTRATION.json"), "utf8");
    expect(plan.externalExecutionAuthorized).toBe(false);
    expect(plan.nextAuthorization).toContain("owner-must-bind-published-r7-t3-commit");
    expect(text).not.toContain('"authorized":true');
    expect(readFileSync(
      join(EVIDENCE_ROOT, "inputs/prepare-setup-cost.json"),
      "utf8",
    )).not.toContain("threadId");
  });
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
