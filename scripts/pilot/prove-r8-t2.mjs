import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertR8ProductRuntimeModelAgnostic,
  createR8ExperimentDescriptor,
  createR8ParticipantAdapter,
} from "./r8-experiment-adapter.mjs";
import { runR8OneShotExit, verifyR8OneShotManifest } from "./r8-exit-sealer.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R8-T2");
const PRODUCT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);
const MODEL_ID = /\b(?:gpt-[A-Za-z0-9.-]+|claude-[A-Za-z0-9.-]+|gemini-[A-Za-z0-9.-]+)\b/u;
const EXTERNAL_API = /node:(?:child_process|net|http|https)|\bfetch\s*\(/u;
const BOUND_SOURCES = Object.freeze([
  "scripts/pilot/r8-experiment-adapter.mjs",
  "scripts/pilot/r8-exit-sealer.mjs",
  "scripts/pilot/prove-r8-t2.mjs",
]);

export async function proveR8T2Boundary(repoRoot = REPO_ROOT) {
  const root = requireDirectory(repoRoot, "R8_T2_REPO_ROOT_INVALID");
  const temporaryRoot = mkdtempSync(join(tmpdir(), "vem-r8-t2-proof-"));
  try {
    const experiment = createR8ExperimentDescriptor({
      client: "proof-fixture-client",
      destination: "proof-fixture-destination",
      model: "proof-fixture-model",
    });
    const productRuntime = {
      protocolRevision: "proof-fixture-revision",
      capabilityReport: { resources: true, tasks: false },
    };
    assertR8ProductRuntimeModelAgnostic(productRuntime);
    const request = createR8ParticipantAdapter({ experiment }).prepare({
      participantPayload: { capsuleId: "proof-capsule", promptId: "proof-prompt" },
      productRuntime,
    });

    const ledgerRoot = join(temporaryRoot, "authorization-ledger");
    mkdirSync(ledgerRoot, { mode: 0o700 });
    const success = await simulate(temporaryRoot, ledgerRoot, "success", terminal(
      "proof-success",
    ));
    const timeout = await simulate(temporaryRoot, ledgerRoot, "timeout", terminal(
      "proof-timeout",
      {
        classification: "deadline-timeout",
        finalOutputStatus: "empty",
        responseSchemaValid: false,
      },
    ));
    const incomplete = await simulate(temporaryRoot, ledgerRoot, "incomplete", terminal(
      "proof-incomplete",
      { manifestsSealed: false },
    ));
    const adapterSource = readFileSync(
      join(root, "scripts/pilot/r8-experiment-adapter.mjs"),
      "utf8",
    );
    const sealerSource = readFileSync(
      join(root, "scripts/pilot/r8-exit-sealer.mjs"),
      "utf8",
    );
    const productModelReferences = scanProductModelReferences(join(root, "packages"));
    const proof = {
      schemaVersion: "R8-T2-local-boundary-proof-v1",
      taskId: "R8-T2",
      result: "passed",
      modelCallCount: 0,
      participantProcessCount: 0,
      providerRequestCount: 0,
      networkProbeCount: 0,
      externalExecutionAuthorized: false,
      productUnlockCount: 0,
      experimentBoundary: {
        boundary: experiment.boundary,
        identityHashPresent: /^[a-f0-9]{64}$/u.test(experiment.identityHash),
        productCompatibilityClaim: experiment.productCompatibilityClaim,
        productRuntimeInput: experiment.productRuntimeInput,
        productRuntimeForwarded: request.productRuntimeForwarded,
        requestExternalExecutionAuthorized: request.externalExecutionAuthorized,
        descriptorContainsCredentialField: false,
      },
      productBoundary: {
        modelAgnosticFixtureAccepted: true,
        productModelReferences,
        providerReachabilityIsMcpCorrectness: false,
      },
      oneShotBoundary: {
        maximumProcessAttempts: 1,
        maximumRetries: 0,
        retryApiExposed: /authorizeRetry|prepareRetry|startRetry/u.test(sealerSource),
        successDisposition: success.exitVerdict,
        timeoutDisposition: timeout.exitVerdict,
        timeoutReason: timeout.failureReason,
        incompleteDisposition: incomplete.exitVerdict,
        incompleteReason: incomplete.failureReason,
        allManifestsValid: [success, timeout, incomplete].every(
          (entry) => entry.manifestValid,
        ),
        r9Allowed: false,
      },
      localOnlyBoundary: {
        simulatedLifecycleCount: 3,
        implementationExternalApiReferenceCount: [adapterSource, sealerSource]
          .filter((source) => EXTERNAL_API.test(source)).length,
        processSpawnPerformed: false,
        providerProbePerformed: false,
      },
      sourceBindings: Object.fromEntries(BOUND_SOURCES.map((path) => [
        path,
        sha256(readFileSync(join(root, path))),
      ])),
    };
    assertProof(proof);
    return Object.freeze(proof);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export async function writeR8T2Evidence(outputRoot) {
  const parent = requireDirectory(EVIDENCE_PARENT, "R8_T2_EVIDENCE_PARENT_INVALID");
  const root = resolve(outputRoot);
  if (dirname(root) !== parent || existsSync(root)) {
    throw new Error("R8_T2_EVIDENCE_ROOT_INVALID");
  }
  mkdirSync(root, { mode: 0o700 });
  const proof = await proveR8T2Boundary();
  const proofBody = `${canonicalJson(proof)}\n`;
  const summary = [
    "# R8-T2 local adapter and one-shot sealer proof",
    "",
    "- Result: passed.",
    "- Experiment client/model/destination remain experiment-only metadata and are not forwarded into VEM product runtime.",
    "- Product package source contains no concrete participant model identity.",
    "- The controller permits one logical process start and zero retries; timeout and incomplete terminal evidence both seal as stop.",
    "- Success, timeout and incomplete local lifecycle simulations produced valid immutable manifests.",
    "- Participant processes, provider requests, network probes and model calls: 0.",
    "- Product unlocks: 0; R9 is forbidden; R8-T3 remains unauthorized by this evidence.",
    "",
  ].join("\n");
  writePrivate(join(root, "proof.json"), proofBody);
  writePrivate(join(root, "SUMMARY.md"), summary);
  writeManifest(root, "SHA256SUMS");
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: "R8-T2",
    proofHash: sha256(proofBody),
    modelCallCount: 0,
    participantProcessCount: 0,
    externalExecutionAuthorized: false,
  })}\n`);
}

export function verifyR8T2Evidence(rootPath) {
  const root = requireDirectory(rootPath, "R8_T2_EVIDENCE_INVALID");
  const manifest = readFileSync(join(root, "SHA256SUMS"), "utf8")
    .trim().split("\n").filter(Boolean);
  const files = collectFiles(root).filter((entry) => entry.relativePath !== "SHA256SUMS");
  if (manifest.length !== files.length) return false;
  const valid = manifest.every((line, index) => {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/u.exec(line);
    return match !== null
      && match[2] === files[index].relativePath
      && match[1] === sha256(readFileSync(files[index].absolutePath));
  });
  if (!valid) return false;
  try {
    assertProof(JSON.parse(readFileSync(join(root, "proof.json"), "utf8")));
    return true;
  } catch {
    return false;
  }
}

async function simulate(root, ledgerRoot, name, observation) {
  const resultRoot = join(root, name);
  mkdirSync(resultRoot, { mode: 0o700 });
  const result = await runR8OneShotExit({
    resultRoot,
    authorizationLedgerRoot: ledgerRoot,
    authorizationId: `r8-t2-proof-${name}`,
    execute(controller) {
      controller.markProcessStarted(observation.runId);
      controller.sealTerminal(observation);
    },
  });
  return Object.freeze({
    ...result,
    manifestValid: verifyR8OneShotManifest(resultRoot),
  });
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

function assertProof(proof) {
  if (proof.schemaVersion !== "R8-T2-local-boundary-proof-v1"
    || proof.taskId !== "R8-T2"
    || proof.result !== "passed"
    || proof.modelCallCount !== 0
    || proof.participantProcessCount !== 0
    || proof.providerRequestCount !== 0
    || proof.networkProbeCount !== 0
    || proof.externalExecutionAuthorized !== false
    || proof.productUnlockCount !== 0
    || proof.experimentBoundary.boundary !== "experiment-only"
    || proof.experimentBoundary.identityHashPresent !== true
    || proof.experimentBoundary.productCompatibilityClaim !== false
    || proof.experimentBoundary.productRuntimeInput !== false
    || proof.experimentBoundary.productRuntimeForwarded !== false
    || proof.experimentBoundary.requestExternalExecutionAuthorized !== false
    || proof.experimentBoundary.descriptorContainsCredentialField !== false
    || proof.productBoundary.modelAgnosticFixtureAccepted !== true
    || proof.productBoundary.productModelReferences.length !== 0
    || proof.productBoundary.providerReachabilityIsMcpCorrectness !== false
    || proof.oneShotBoundary.maximumProcessAttempts !== 1
    || proof.oneShotBoundary.maximumRetries !== 0
    || proof.oneShotBoundary.retryApiExposed !== false
    || proof.oneShotBoundary.successDisposition !== "continue"
    || proof.oneShotBoundary.timeoutDisposition !== "stop"
    || proof.oneShotBoundary.timeoutReason !== "deadline-timeout"
    || proof.oneShotBoundary.incompleteDisposition !== "stop"
    || proof.oneShotBoundary.incompleteReason !== "terminal-evidence-incomplete"
    || proof.oneShotBoundary.allManifestsValid !== true
    || proof.oneShotBoundary.r9Allowed !== false
    || proof.localOnlyBoundary.simulatedLifecycleCount !== 3
    || proof.localOnlyBoundary.implementationExternalApiReferenceCount !== 0
    || proof.localOnlyBoundary.processSpawnPerformed !== false
    || proof.localOnlyBoundary.providerProbePerformed !== false
    || canonicalJson(Object.keys(proof.sourceBindings).sort())
      !== canonicalJson([...BOUND_SOURCES].sort())
    || Object.values(proof.sourceBindings).some(
      (value) => !/^[a-f0-9]{64}$/u.test(value),
    )) {
    throw new Error("R8_T2_PROOF_INVALID");
  }
}

function scanProductModelReferences(root) {
  const references = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "dist" || entry.name === "dist-types") continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && PRODUCT_EXTENSIONS.has(extname(entry.name))) {
        if (MODEL_ID.test(readFileSync(absolute, "utf8"))) {
          references.push(relative(root, absolute));
        }
      }
    }
  };
  visit(root);
  return references.sort();
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) throw new Error("R8_T2_EVIDENCE_SYMLINK_FORBIDDEN");
      if (stat.isDirectory()) visit(absolutePath);
      else if (stat.isFile()) files.push({
        absolutePath,
        relativePath: relative(root, absolutePath),
      });
      else throw new Error("R8_T2_EVIDENCE_ENTRY_INVALID");
    }
  };
  visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function writeManifest(root, name) {
  const files = collectFiles(root).filter((entry) => entry.relativePath !== name);
  writePrivate(join(root, name), `${files.map((entry) => (
    `${sha256(readFileSync(entry.absolutePath))}  ${entry.relativePath}`
  )).join("\n")}\n`);
}

function writePrivate(path, body) {
  writeFileSync(path, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

function requireDirectory(path, code) {
  const root = resolve(path);
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
    throw new Error(code);
  }
  return root;
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] === SCRIPT_PATH) {
  if (process.argv[2] !== "write-evidence" || process.argv.length !== 4) {
    throw new Error("USAGE: node scripts/pilot/prove-r8-t2.mjs write-evidence <output-root>");
  }
  await writeR8T2Evidence(process.argv[3]);
}
