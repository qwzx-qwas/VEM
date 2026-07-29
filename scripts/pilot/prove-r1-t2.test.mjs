import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildR1T2Proof } from "./prove-r1-t2.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("R1-T2 real-process remediation proof", () => {
  test("seals success and protocol-failure evidence without an external call", async () => {
    const parent = mkdtempSync(join(tmpdir(), "vem-r1-t2-proof-"));
    roots.push(parent);
    const output = join(parent, "evidence");
    const proof = await buildR1T2Proof(output, { enforceEvidenceParent: false });
    expect(proof).toMatchObject({
      outcome: "passed",
      checks: {
        multipleAgentMessagesAreOrdinaryReceipts: true,
        exactlyOneStructuredResponseSelected: true,
        conflictingValidResponsesFailClosed: true,
        rawStdoutAndStderrPersistedBeforeReturn: true,
        terminalAndLedgerFailureEvidencePersisted: true,
        hashManifestsVerify: true,
        externalModelCall: false,
      },
    });
    expect(readFileSync(join(output, "failure/stdout.jsonl"), "utf8"))
      .toContain("\"agent_message\"");
  });
});
