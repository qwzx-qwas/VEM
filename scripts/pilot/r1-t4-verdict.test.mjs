import { createHash } from "node:crypto";
import {
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import { canonicalSha256 } from "../../packages/pilot-harness/dist/index.js";
import { verifyR1Preregistration } from "./r1-t4.mjs";

const REPO_ROOT = resolve(".");
const PREREGISTRATION_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R1-T3/20260729T203631+0800",
);
const RESULT_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R1-T4/20260729T213524+0800",
);
const RUNS_ROOT = join(RESULT_ROOT, "results/runs");
const DIRECT_RUN = join(
  RUNS_ROOT,
  "r1-run-01-boundary-label-1-direct-search",
);
const VEM_RUN = join(
  RUNS_ROOT,
  "r1-run-01-boundary-label-2-vem-assisted",
);
const PREREGISTRATION_HASH =
  "8d93104c915fdb0acce9f31bdf7c34bbc4d19f0ac74e1b2609a10ddce35ca7f1";

describe("R1-T4 immutable external verdict evidence", () => {
  test("binds the owner authorization and unchanged preregistration", () => {
    const authorization = readJson(
      "docs/test-evidence/R1-T4/OWNER_AUTHORIZATION_20260729.json",
    );
    const runIndex = readJson(
      "docs/test-evidence/R1-T4/20260729T213524+0800/results/run-index.json",
    );
    expect(verifyR1Preregistration(PREREGISTRATION_ROOT))
      .toBe(PREREGISTRATION_HASH);
    expect(authorization).toMatchObject({
      authorized: true,
      taskId: "R1-T4",
      preregistrationHash: PREREGISTRATION_HASH,
    });
    expect(runIndex).toMatchObject({
      authorizationHash: canonicalSha256(authorization),
      preregistrationHash: PREREGISTRATION_HASH,
      batchStopped: true,
    });
  });

  test("preserves complete hash-sealed evidence for both attempted runs", () => {
    expect(verifyManifest(join(RESULT_ROOT, "RESULTS.sha256"), RESULT_ROOT))
      .toBe(true);
    expect(verifyManifest(join(DIRECT_RUN, "SHA256SUMS"), DIRECT_RUN))
      .toBe(true);
    expect(verifyManifest(join(VEM_RUN, "SHA256SUMS"), VEM_RUN))
      .toBe(true);
    expect(readJson(join(DIRECT_RUN, "evaluation.json"))).toMatchObject({
      outcome: "success",
      responseMatchesGroundTruth: true,
      ledgerComplete: true,
      selectedResponseCount: 1,
      evidenceHashesValid: true,
      capsuleAudit: "passed",
    });
    expect(readJson(join(VEM_RUN, "failure.json"))).toMatchObject({
      outcome: "failed",
      failureCodes: ["STRUCTURED_RESPONSE_CONFLICT"],
      rawEvidencePersisted: true,
      ledgerEvidencePersisted: true,
    });
  });

  test("classifies two conflicting schema-valid messages after stream close and stops eight calls", () => {
    const stdoutEvents = readFileSync(join(VEM_RUN, "stdout.jsonl"), "utf8")
      .trim().split("\n").map((line) => JSON.parse(line));
    const messages = stdoutEvents.filter((event) => (
      event.type === "item.completed"
        && event.item?.type === "agent_message"
    )).map((event) => JSON.parse(event.item.text));
    expect(messages).toEqual([
      {
        line: 1,
        relativeFile: "packages/demo-fixture/src/App.tsx",
        sourceAnchorId: null,
      },
      {
        line: 7,
        relativeFile: "packages/demo-fixture/src/App.tsx",
        sourceAnchorId: "vem1_1fca6dac19137a546084bc64ae003bc0",
      },
    ]);
    const ledger = readJson(join(VEM_RUN, "receipt-ledger.json"));
    expect(ledger).toMatchObject({
      outcome: "failed",
      failureCodes: ["STRUCTURED_RESPONSE_CONFLICT"],
    });
    expect(ledger.entries.filter(
      (entry) => entry.kind === "structured-response-selected",
    )).toHaveLength(0);
    expect(ledger.entries.at(-2)).toMatchObject({
      kind: "protocol-failure-detected",
      codes: ["STRUCTURED_RESPONSE_CONFLICT"],
    });
    expect(ledger.entries.at(-1)).toMatchObject({
      kind: "run-finalized",
      outcome: "failed",
    });
    expect(readJson(join(RESULT_ROOT, "results/batch-stopped.json")))
      .toMatchObject({
        completedRunCount: 2,
        remainingRunCount: 8,
        failureEvidenceSealed: true,
      });
  });

  test("records stop without changing the terminal R0 or P0 chains", () => {
    const verdict = readJson(join(RESULT_ROOT, "results/verdict.json"));
    expect(verdict).toMatchObject({
      decisionKey: "R1-RECOVERY",
      decisionAttempt: 1,
      verdict: "stop",
      stopReasons: expect.arrayContaining([
        "event-ledger-integrity-failed",
        "response-or-direct-primary-wrong-attribution",
      ]),
      metrics: {
        runCount: 2,
        uniqueThreadCount: 2,
        evidenceHashesValidCount: 2,
      },
    });
    const roadmap = parse(readFileSync(join(REPO_ROOT, "ROADMAP.yaml"), "utf8"));
    expect(roadmap.decisions["P0-VALUE"]).toMatchObject({
      current_attempt: "P0-T17D",
    });
    expect(roadmap.decisions["R0-RECOVERY"]).toMatchObject({
      current_attempt: "R0-T4",
    });
    expect(roadmap.decisions["R1-RECOVERY"]).toMatchObject({
      current_attempt: "R1-T4",
      does_not_supersede: "R0-RECOVERY",
      also_does_not_supersede: ["P0-VALUE"],
    });
  });
});

function readJson(path) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), "utf8"));
}

function verifyManifest(manifestPath, baseRoot) {
  return readFileSync(manifestPath, "utf8").trim().split("\n").every((line) => {
    const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
    return match !== null
      && sha256(readFileSync(join(baseRoot, match[2]))) === match[1];
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
