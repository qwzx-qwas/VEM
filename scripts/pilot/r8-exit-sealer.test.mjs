import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runR8OneShotExit, verifyR8OneShotManifest } from "./r8-exit-sealer.mjs";

const roots = [];

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("R8 one-shot exit sealer", () => {
  test("seals one schema-valid response as continue-eligible without product unlock", async () => {
    const fixture = makeFixture();
    const result = await runR8OneShotExit({
      ...fixture,
      execute(controller) {
        controller.markProcessStarted("fixture-run-success");
        controller.sealTerminal(terminal("fixture-run-success"));
      },
    });
    expect(result).toMatchObject({
      ok: true,
      exitVerdict: "continue",
      processAttemptCount: 1,
      retryCount: 0,
      terminalEvidenceComplete: true,
      evidenceSealed: true,
    });
    expect(json(fixture.resultRoot, "verdict.json")).toMatchObject({
      r9Allowed: false,
      productUnlockCount: 0,
      providerReachabilityIsMcpCorrectness: false,
      authoritativeDecisionRecorded: false,
      externalExecutionAuthorizedBySealer: false,
    });
    expect(verifyR8OneShotManifest(fixture.resultRoot)).toBe(true);
  });

  test("maps a fully sealed deadline timeout to stop", async () => {
    const fixture = makeFixture();
    const result = await runR8OneShotExit({
      ...fixture,
      execute(controller) {
        controller.markProcessStarted("fixture-run-timeout");
        controller.sealTerminal(terminal("fixture-run-timeout", {
          classification: "deadline-timeout",
          finalOutputStatus: "empty",
          responseSchemaValid: false,
        }));
      },
    });
    expect(result).toMatchObject({
      ok: false,
      exitVerdict: "stop",
      failureReason: "deadline-timeout",
      processAttemptCount: 1,
      retryCount: 0,
      terminalEvidenceComplete: true,
    });
    expect(json(fixture.resultRoot, "verdict.json")).toMatchObject({
      exitVerdict: "stop",
      timeoutRequiresStop: true,
      r9Allowed: false,
    });
  });

  test("contains a second start attempt and never exceeds one process", async () => {
    const fixture = makeFixture();
    const result = await runR8OneShotExit({
      ...fixture,
      execute(controller) {
        controller.markProcessStarted("fixture-run-first");
        controller.markProcessStarted("fixture-run-second");
      },
    });
    expect(result).toMatchObject({
      exitVerdict: "stop",
      failureReason: "runner-or-sealer-exception",
      processAttemptCount: 1,
      retryCount: 0,
    });
    expect(json(fixture.resultRoot, "run.json")).toMatchObject({
      maximumProcessAttempts: 1,
      maximumRetries: 0,
      retryAuthorized: false,
      retryProcessStarted: false,
    });
    expect(json(fixture.resultRoot, "exceptions.json").exceptions)
      .toEqual([expect.objectContaining({ code: "R8_SECOND_PROCESS_FORBIDDEN" })]);
  });

  test("fails closed when terminal evidence is incomplete", async () => {
    const fixture = makeFixture();
    const result = await runR8OneShotExit({
      ...fixture,
      execute(controller) {
        controller.markProcessStarted("fixture-run-incomplete");
        controller.sealTerminal(terminal("fixture-run-incomplete", {
          manifestsSealed: false,
        }));
      },
    });
    expect(result).toMatchObject({
      exitVerdict: "stop",
      failureReason: "terminal-evidence-incomplete",
      terminalEvidenceComplete: false,
    });
    expect(verifyR8OneShotManifest(fixture.resultRoot)).toBe(true);
  });

  test("rejects replaying one authorization into another result root", async () => {
    const fixture = makeFixture();
    await runR8OneShotExit({
      ...fixture,
      execute(controller) {
        controller.markProcessStarted("fixture-run-first");
        controller.sealTerminal(terminal("fixture-run-first"));
      },
    });
    const alternate = join(fixture.root, "alternate");
    mkdirSync(alternate, { mode: 0o700 });
    await expect(runR8OneShotExit({
      ...fixture,
      resultRoot: alternate,
      execute() {},
    })).rejects.toThrowError("R8_AUTHORIZATION_ALREADY_CLAIMED");
  });
});

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "vem-r8-sealer-test-"));
  roots.push(root);
  const resultRoot = join(root, "result");
  const authorizationLedgerRoot = join(root, "ledger");
  mkdirSync(resultRoot, { mode: 0o700 });
  mkdirSync(authorizationLedgerRoot, { mode: 0o700 });
  return {
    root,
    resultRoot,
    authorizationLedgerRoot,
    authorizationId: "fixture-r8-authorization",
  };
}

function terminal(runId, override = {}) {
  return {
    runId,
    classification: "schema-valid-response",
    finalOutputStatus: "valid",
    responseSchemaValid: true,
    processTreeTerminated: true,
    streamsSealed: true,
    finalObservationSealed: true,
    ledgerSealed: true,
    boundarySealed: true,
    manifestsSealed: true,
    ...override,
  };
}

function json(root, path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}
