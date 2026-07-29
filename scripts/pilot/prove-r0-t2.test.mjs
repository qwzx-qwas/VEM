import { describe, expect, test } from "vitest";
import { runReceiptLedgerProbe } from "./prove-r0-t2.mjs";

describe("R0-T2 real-process receipt-ledger proof", () => {
  test("records one real process without exporting raw event or diagnostic bodies", async () => {
    let time = 1_000n;
    const proof = await runReceiptLedgerProbe({
      nowNs: () => {
        time += 10n;
        return time;
      },
    });
    expect(proof).toMatchObject({
      instrumentationHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      ledger: {
        terminalOutcome: "success",
        entryCount: 8,
        firstReceivedAtNs: "1010",
        lastReceivedAtNs: "1080",
      },
    });
    expect(proof.ledger.entries.map((entry) => entry.receivedAtNs)).toEqual([
      "1010",
      "1020",
      "1030",
      "1040",
      "1050",
      "1060",
      "1070",
      "1080",
    ]);
    expect(proof.canonicalJson).not.toContain("probe-thread-not-exported");
    expect(proof.canonicalJson).not.toContain("bounded probe diagnostic");
  });

  test("binds every instrumentation source file", async () => {
    const proof = await runReceiptLedgerProbe();
    expect(Object.keys(proof.sourceBindings).sort()).toEqual([
      "packages/pilot-harness/package.json",
      "packages/pilot-harness/src/index.ts",
      "packages/pilot-harness/src/receipt-ledger.test.ts",
      "packages/pilot-harness/src/receipt-ledger.ts",
      "scripts/pilot/prove-r0-t2.mjs",
    ]);
    expect(Object.values(proof.sourceBindings).every(
      (hash) => /^[a-f0-9]{64}$/u.test(hash),
    )).toBe(true);
  });
});
