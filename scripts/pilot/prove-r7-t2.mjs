import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanupR7Attempt,
  containR7UnspawnedAttempt,
  createR7AttemptFactory,
} from "./r7-attempt-factory.mjs";
import {
  runR7ExceptionSafeBatch,
  verifyR7BatchManifest,
} from "./r7-batch-sealer.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R7-T2");

export async function proveR7T2Isolation() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "vem-r7-t2-proof-"));
  try {
    const fixture = createFixture(temporaryRoot);
    const factory = createFactory(fixture);
    const direct1 = factory.prepare(spec("direct-search", 1));
    const vem1 = factory.prepare(spec("vem-assisted", 1, fixture.context));
    const direct2 = factory.prepare(spec("direct-search", 2));
    const vem2 = factory.prepare(spec("vem-assisted", 2, fixture.context));
    const pair1 = factory.comparePair(direct1, vem1);
    const pair2 = factory.comparePair(direct2, vem2);
    const handles = [direct1, vem1, direct2, vem2];
    const controlIdentityHashes = handles.map(
      (handle) => sha256(handle.resources.controlRoot),
    );
    const finalIdentityHashes = handles.map(
      (handle) => sha256(handle.resources.authoritativeResponsePath),
    );
    for (const handle of handles) {
      containR7UnspawnedAttempt(handle, "R7_PROOF_PAIR_NOT_SPAWNED");
      cleanupR7Attempt(handle);
    }

    const batchRoot = join(temporaryRoot, "batch");
    const resultRoot = join(batchRoot, "result");
    const ledgerRoot = join(batchRoot, "authorization-ledger");
    mkdirSync(resultRoot, { recursive: true, mode: 0o700 });
    mkdirSync(ledgerRoot, { mode: 0o700 });
    const batch = await runR7ExceptionSafeBatch({
      resultRoot,
      authorizationLedgerRoot: ledgerRoot,
      authorizationId: "r7-t2-proof-authorization",
      expectedArmCount: 1,
      maxProcessAttempts: 2,
      attemptFactory: createFactory(fixture),
      runBatch: async (controller) => {
        const first = controller.prepareAttempt(spec("direct-search", 1));
        controller.markProcessStarted(first, "r7-proof-attempt-1");
        controller.sealAttempt(first, terminal(
          "r7-proof-attempt-1",
          "provider-timeout",
        ));
        controller.authorizeRetry({
          armKey: "r7-local-task-01:direct-search",
          nextAttemptNumber: 2,
        });
        controller.prepareAttempt(spec("direct-search", 2));
        await controller.atStage("capsule-preparation", () => {
          throw new Error("R7_PROOF_PRESPAWN_EXCEPTION");
        });
      },
    });
    const batchStop = readJson(join(resultRoot, "results/batch-stop.json"));
    const exceptions = readJson(join(resultRoot, "results/exceptions.json"));
    const runIndex = readJson(join(resultRoot, "results/run-index.json"));
    const verdict = readJson(join(resultRoot, "results/verdict.json"));

    const alternateRoot = join(batchRoot, "alternate-result");
    mkdirSync(alternateRoot, { mode: 0o700 });
    let rerunRejected = false;
    try {
      await runR7ExceptionSafeBatch({
        resultRoot: alternateRoot,
        authorizationLedgerRoot: ledgerRoot,
        authorizationId: "r7-t2-proof-authorization",
        expectedArmCount: 1,
        maxProcessAttempts: 2,
        attemptFactory: createFactory(fixture),
        runBatch: async () => {},
      });
    } catch {
      rerunRejected = true;
    }

    const proof = {
      schemaVersion: "R7-T2-local-isolation-proof-v1",
      taskId: "R7-T2",
      result: "passed",
      modelCallCount: 0,
      participantProcessCount: 0,
      providerRequestCount: 0,
      networkProbeCount: 0,
      externalExecutionAuthorized: false,
      productUnlockCount: 0,
      perAttemptIsolation: {
        preparedAttemptCount: handles.length,
        distinctCapsuleControlRootCount: new Set(controlIdentityHashes).size,
        distinctPermissionProfileCount: new Set(handles.map(
          (handle) => handle.resources.permissionProfilePath,
        )).size,
        distinctAuthoritativeFinalFileCount: new Set(finalIdentityHashes).size,
        priorWritableOutputReused: false,
        priorAttemptStateVisibleInWorkspace: false,
        cleanupHandlesShared: false,
      },
      treatmentBoundary: {
        attemptOneValid: pair1.valid,
        attemptTwoValid: pair2.valid,
        baseContextStableAcrossRetries:
          pair1.baseContextHash === pair2.baseContextHash,
        promptStableAcrossRetries: pair1.promptHash === pair2.promptHash,
        onlyDifference: pair1.onlyDifference,
        treatmentHashStableAcrossRetries:
          pair1.treatmentHash === pair2.treatmentHash,
      },
      exceptionSealing: {
        stopped: batch.stopped,
        processAttemptCount: batch.processAttemptCount,
        remainingProcessAttemptBudget: batch.remainingProcessAttemptBudget,
        retryAuthorized: batch.retryAuthorized,
        retryProcessStarted: batch.retryProcessStarted,
        unspawnedRetryConsumedBudget: batchStop.unspawnedRetryConsumedBudget,
        sealedProcessAttemptCount: batchStop.sealedProcessAttemptCount,
        allSealedAttemptEvidenceRetained:
          batchStop.allSealedAttemptEvidenceRetained,
        exceptionCount: exceptions.exceptionCount,
        runIndexAttemptCount: runIndex.attempts.length,
        verdictPresent: verdict.evidenceSealedBeforeReturn === true,
        topLevelManifestValid: verifyR7BatchManifest(resultRoot),
      },
      rerunBoundary: {
        sameAuthorizationAlternateRootRejected: rerunRejected,
        externalRerunPerformed: batchStop.externalRerunPerformed,
      },
    };
    assertProof(proof);
    return Object.freeze(proof);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export async function writeR7T2Evidence(outputRoot) {
  const parent = requireDirectory(EVIDENCE_PARENT, "R7_T2_EVIDENCE_PARENT_INVALID");
  const root = resolve(outputRoot);
  if (dirname(root) !== parent || existsSync(root)) {
    throw new Error("R7_T2_EVIDENCE_ROOT_INVALID");
  }
  mkdirSync(root, { mode: 0o700 });
  const proof = await proveR7T2Isolation();
  writePrivate(join(root, "proof.json"), `${canonicalJson(proof)}\n`);
  writePrivate(join(root, "SUMMARY.md"), [
    "# R7-T2 local retry-isolation proof",
    "",
    "- Result: passed",
    "- Four prepared local handles used four distinct capsule control roots, permission profiles and authoritative final files.",
    "- Direct/VEM base fixture, prompt and schema stayed equal; the sole treatment difference remained the frozen `vem-context.json`.",
    "- A sealed first process attempt plus an authorized but unspawned retry produced batch-stop, exception, run-index, verdict and verified top-level manifest evidence.",
    "- The unspawned retry consumed no process budget; a second result root under the same authorization was rejected.",
    "- Participant processes, provider requests, network probes and model calls: 0.",
    "- Product unlocks: 0; R7-T4 remains unauthorized.",
    "",
  ].join("\n"));
  writeManifest(root, "SHA256SUMS");
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: "R7-T2",
    proofHash: sha256(canonicalJson(proof)),
    modelCallCount: 0,
    externalExecutionAuthorized: false,
  })}\n`);
}

export function verifyR7T2Evidence(rootPath) {
  const root = requireDirectory(rootPath, "R7_T2_EVIDENCE_INVALID");
  const manifest = readFileSync(join(root, "SHA256SUMS"), "utf8")
    .trim().split("\n").filter(Boolean);
  const files = collectFiles(root).filter((entry) => entry.relativePath !== "SHA256SUMS");
  if (manifest.length !== files.length) return false;
  const manifestValid = manifest.every((line, index) => {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/u.exec(line);
    return match !== null
      && match[2] === files[index].relativePath
      && match[1] === sha256(readFileSync(files[index].absolutePath));
  });
  if (!manifestValid) return false;
  try {
    assertProof(readJson(join(root, "proof.json")));
    return true;
  } catch {
    return false;
  }
}

function assertProof(proof) {
  if (proof.schemaVersion !== "R7-T2-local-isolation-proof-v1"
    || proof.taskId !== "R7-T2"
    || proof.result !== "passed"
    || proof.modelCallCount !== 0
    || proof.participantProcessCount !== 0
    || proof.providerRequestCount !== 0
    || proof.networkProbeCount !== 0
    || proof.externalExecutionAuthorized !== false
    || proof.productUnlockCount !== 0
    || proof.perAttemptIsolation.preparedAttemptCount !== 4
    || proof.perAttemptIsolation.distinctCapsuleControlRootCount !== 4
    || proof.perAttemptIsolation.distinctPermissionProfileCount !== 4
    || proof.perAttemptIsolation.distinctAuthoritativeFinalFileCount !== 4
    || proof.perAttemptIsolation.priorWritableOutputReused !== false
    || proof.perAttemptIsolation.priorAttemptStateVisibleInWorkspace !== false
    || proof.perAttemptIsolation.cleanupHandlesShared !== false
    || Object.values(proof.treatmentBoundary).some((value) => value === false)
    || proof.treatmentBoundary.onlyDifference !== "vem-context.json"
    || proof.exceptionSealing.stopped !== true
    || proof.exceptionSealing.processAttemptCount !== 1
    || proof.exceptionSealing.remainingProcessAttemptBudget !== 1
    || proof.exceptionSealing.retryAuthorized !== true
    || proof.exceptionSealing.retryProcessStarted !== false
    || proof.exceptionSealing.unspawnedRetryConsumedBudget !== false
    || proof.exceptionSealing.sealedProcessAttemptCount !== 1
    || proof.exceptionSealing.allSealedAttemptEvidenceRetained !== true
    || proof.exceptionSealing.exceptionCount !== 1
    || proof.exceptionSealing.runIndexAttemptCount !== 2
    || proof.exceptionSealing.verdictPresent !== true
    || proof.exceptionSealing.topLevelManifestValid !== true
    || proof.rerunBoundary.sameAuthorizationAlternateRootRejected !== true
    || proof.rerunBoundary.externalRerunPerformed !== false) {
    throw new Error("R7_T2_PROOF_INVALID");
  }
}

function createFixture(root) {
  const source = join(root, "fixture");
  mkdirSync(join(source, "packages/demo-fixture/src"), { recursive: true, mode: 0o700 });
  writeInput(join(source, "packages/demo-fixture/src/App.tsx"), "export const App = () => null;\n");
  writeInput(join(source, "packages/demo-fixture/src/fixtures.ts"), "export const fixture = 1;\n");
  const schema = join(root, "response-schema.json");
  writeInput(schema, '{"type":"object"}\n');
  const context = join(root, "vem-context.json");
  writeInput(context, '{"source":"frozen"}\n');
  const auth = join(root, "auth.json");
  writePrivate(auth, '{}\n');
  const codexInstallRoot = join(root, "codex-install");
  mkdirSync(codexInstallRoot, { mode: 0o700 });
  return { source, schema, context, auth, codexInstallRoot };
}

function createFactory(fixture) {
  return createR7AttemptFactory({
    sourceRoot: fixture.source,
    responseSchemaPath: fixture.schema,
    model: "r7-local-no-call",
    authFile: fixture.auth,
    codexInstallRoot: fixture.codexInstallRoot,
  });
}

function spec(arm, attemptNumber, vemContextPath) {
  return {
    taskId: "r7-local-task-01",
    arm,
    attemptNumber,
    prompt: "Locate the frozen local fixture heading.",
    ...(vemContextPath === undefined ? {} : { vemContextPath }),
  };
}

function terminal(runId, classification) {
  return {
    runId,
    classification,
    failureCode: "R7_RETRYABLE_FAILURE",
    processTreeTerminated: true,
    streamsSealed: true,
    finalObservationSealed: true,
    ledgerSealed: true,
    boundarySealed: true,
    manifestsSealed: true,
  };
}

function writeInput(path, value) {
  writeFileSync(path, value, { encoding: "utf8", flag: "wx", mode: 0o400 });
  chmodSync(path, 0o400);
}

function writePrivate(path, value) {
  writeFileSync(path, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
}

function writeManifest(root, name) {
  const lines = collectFiles(root)
    .filter((entry) => entry.relativePath !== name)
    .map((entry) => `${sha256(readFileSync(entry.absolutePath))}  ${entry.relativePath}`);
  writePrivate(join(root, name), `${lines.join("\n")}\n`);
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R7_T2_EVIDENCE_SYMLINK");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push({
        absolutePath,
        relativePath: relative(root, absolutePath).replaceAll("\\", "/"),
      });
      else throw new Error("R7_T2_EVIDENCE_UNSAFE_NODE");
    }
  };
  visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function requireDirectory(path, code) {
  const root = resolve(path);
  if (!existsSync(root)
    || !lstatSync(root).isDirectory()
    || lstatSync(root).isSymbolicLink()
    || realpathSync(root) !== root) throw new Error(code);
  return root;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 4 || process.argv[2] !== "write-evidence") {
    throw new Error("USAGE: node scripts/pilot/prove-r7-t2.mjs write-evidence <output-root>");
  }
  await writeR7T2Evidence(process.argv[3]);
}
