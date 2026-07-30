import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import {
  executeR5BoundedProcess,
  verifyR5EvidenceManifest,
} from "./r5-process-terminalizer.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R5-T2");
const R4_INTERRUPTION_PATH = join(
  REPO_ROOT,
  "docs/test-evidence/R4-T4/20260730T144143-0800/results/interruption.json",
);
const R4_INCIDENT_HASH =
  "95021eac99d93d49985ee46d003a4108ff7a524244d83e3521b8edff8ecffd70";
const SOURCE_PATHS = Object.freeze([
  "scripts/pilot/r5-process-terminalizer.mjs",
  "scripts/pilot/r5-process-terminalizer.test.mjs",
  "scripts/pilot/prove-r5-t2.mjs",
  "scripts/pilot/prove-r5-t2.test.mjs",
]);
const PERMISSION_STATE = Object.freeze({
  status: "passed",
  permissionProfilePassed: true,
  authReadableToGeneratedCommands: false,
  workspaceWritable: false,
  evidenceHash:
    "b4d3d12816650f06cf10eaa315198f48a61d480f36f30ad98854dc8daf95e77f",
});

export async function buildR5T2Proof({
  outputRoot,
  enforceEvidenceParent = true,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)) {
    throw new Error("R5_T2_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R5_T2_OUTPUT_PARENT_INVALID",
  );
  mkdirSync(output, { mode: 0o700 });
  const runsRoot = join(output, "local-runs");
  mkdirSync(runsRoot, { mode: 0o700 });

  const sourceBindings = Object.fromEntries(SOURCE_PATHS.map((path) => [
    path,
    sha256(readFileSync(join(REPO_ROOT, path))),
  ]));
  const instrumentationHash = canonicalSha256(sourceBindings);
  const r4Interruption = JSON.parse(readFileSync(R4_INTERRUPTION_PATH, "utf8"));
  const r4Hash = canonicalSha256(r4Interruption);
  if (r4Hash !== R4_INCIDENT_HASH
    || r4Interruption.taskState !== "blocked"
    || r4Interruption.decision !== "pending"
    || r4Interruption.evidenceSealed !== false) {
    throw new Error("R5_T2_R4_IMMUTABLE_INPUT_INVALID");
  }

  const normalFinal = join(output, "normal-final.json");
  const normal = await executeR5BoundedProcess({
    invocation: nodeInvocation(`
      process.stdout.write('{"type":"turn.completed"}\\n');
      process.stderr.write("normal-stream-drained\\n");
      require("node:fs").writeFileSync(
        process.env.R5_FINAL_PATH,
        '{"status":"bounded-local-proof"}\\n',
        { mode: 0o600 },
      );
    `, { R5_FINAL_PATH: normalFinal }),
    outputRoot: join(runsRoot, "normal"),
    runId: "r5-t2-proof-normal",
    instrumentationHash,
    finalResponsePath: normalFinal,
    terminationPolicy: policy({ deadlineMs: 2_000 }),
    permissionState: PERMISSION_STATE,
    audit: passedAudit,
    evaluate: passedEvaluation,
  });

  const descendantPidPath = join(output, "deadline-descendant.pid");
  const deadlineTree = await executeR5BoundedProcess({
    invocation: nodeInvocation(`
      const { spawn } = require("node:child_process");
      const child = spawn(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000)"],
        { stdio: ["ignore", "ignore", "ignore"] },
      );
      require("node:fs").writeFileSync(
        process.env.R5_DESCENDANT_PID_PATH,
        String(child.pid),
        { mode: 0o600 },
      );
      process.stdout.write('{"type":"thread.started"}\\n');
      setInterval(() => {}, 1000);
    `, { R5_DESCENDANT_PID_PATH: descendantPidPath }),
    outputRoot: join(runsRoot, "deadline-tree"),
    runId: "r5-t2-proof-deadline-tree",
    instrumentationHash,
    finalResponsePath: join(output, "deadline-missing-final.json"),
    terminationPolicy: policy(),
    permissionState: PERMISSION_STATE,
    audit: passedAudit,
    evaluate: passedEvaluation,
  });
  const descendantPid = Number(readFileSync(descendantPidPath, "utf8"));
  const descendantStopped = !processExists(descendantPid);

  const forced = await executeR5BoundedProcess({
    invocation: nodeInvocation(`
      process.on("SIGTERM", () => {});
      process.stdout.write('{"type":"thread.started"}\\n');
      setInterval(() => {}, 1000);
    `),
    outputRoot: join(runsRoot, "forced"),
    runId: "r5-t2-proof-forced",
    instrumentationHash,
    finalResponsePath: join(output, "forced-missing-final.json"),
    terminationPolicy: policy({ graceMs: 40 }),
    permissionState: PERMISSION_STATE,
    audit: passedAudit,
    evaluate: passedEvaluation,
  });

  const cancellationController = new globalThis.AbortController();
  const cancellationTimer = setTimeout(() => {
    cancellationController.abort("proof-cancel");
  }, 40);
  const cancelled = await executeR5BoundedProcess({
    invocation: nodeInvocation("setInterval(() => {}, 1000);"),
    outputRoot: join(runsRoot, "cancelled"),
    runId: "r5-t2-proof-cancelled",
    instrumentationHash,
    finalResponsePath: join(output, "cancelled-missing-final.json"),
    terminationPolicy: policy({ deadlineMs: 2_000 }),
    permissionState: PERMISSION_STATE,
    audit: passedAudit,
    evaluate: passedEvaluation,
    signal: cancellationController.signal,
  });
  clearTimeout(cancellationTimer);

  const boundaryException = await executeR5BoundedProcess({
    invocation: nodeInvocation("process.stdout.write('{}\\n');"),
    outputRoot: join(runsRoot, "boundary-exception"),
    runId: "r5-t2-proof-boundary-exception",
    instrumentationHash,
    finalResponsePath: join(output, "boundary-missing-final.json"),
    terminationPolicy: policy({ deadlineMs: 2_000 }),
    permissionState: PERMISSION_STATE,
    audit() { throw new Error("R5_PROOF_AUDIT_EXCEPTION"); },
    evaluate() { throw new Error("R5_PROOF_EVALUATOR_EXCEPTION"); },
  });

  const orphanRefusal = await executeR5BoundedProcess({
    invocation: nodeInvocation("process.stdout.write('{}\\n');"),
    outputRoot: join(runsRoot, "orphan-refusal"),
    runId: "r5-t2-proof-orphan-refusal",
    instrumentationHash,
    finalResponsePath: join(output, "orphan-missing-final.json"),
    terminationPolicy: policy({ deadlineMs: 2_000 }),
    permissionState: PERMISSION_STATE,
    audit: passedAudit,
    evaluate: passedEvaluation,
    processGroupAdapter: {
      signal(groupId, signal) {
        process.kill(-groupId, signal);
      },
      isEmpty() {
        return false;
      },
    },
  });

  const providerTerminal = await executeR5BoundedProcess({
    invocation: nodeInvocation(`
      process.stdout.write(
        '{"type":"turn.failed","error":{"message":"local-fixture"}}\\n',
      );
    `),
    outputRoot: join(runsRoot, "provider-terminal"),
    runId: "r5-t2-proof-provider-terminal",
    instrumentationHash,
    finalResponsePath: join(output, "provider-missing-final.json"),
    terminationPolicy: policy({ deadlineMs: 2_000 }),
    permissionState: PERMISSION_STATE,
    audit: passedAudit,
    evaluate: passedEvaluation,
  });

  const runs = [
    normal,
    deadlineTree,
    forced,
    cancelled,
    boundaryException,
    orphanRefusal,
    providerTerminal,
  ];
  const allEvidenceManifestsValid = runs.every((run) => (
    run.evidenceSealed
      && verifyR5EvidenceManifest(run.outputRoot)
  ));
  const observations = {
    normal: {
      outcome: normal.outcome,
      streamsAndFinalDrained: normal.outcome === "success"
        && readFileSync(join(normal.outputRoot, "stderr.txt"), "utf8")
          === "normal-stream-drained\n"
        && JSON.parse(readFileSync(
          join(normal.outputRoot, "final-response-observation.json"),
          "utf8",
        )).status === "captured",
    },
    deadlineTree: {
      outcome: deadlineTree.outcome,
      deadlineExpired: deadlineTree.deadlineExpired,
      gracefulSignalSent: deadlineTree.gracefulSignalSent,
      processTreeTerminated: deadlineTree.processTreeTerminated,
      descendantStopped,
    },
    forced: {
      outcome: forced.outcome,
      forceSignalSent: forced.forceSignalSent,
      processTreeTerminated: forced.processTreeTerminated,
    },
    cancelled: {
      outcome: cancelled.outcome,
      cancellationReason: cancelled.cancellationReason,
      processTreeTerminated: cancelled.processTreeTerminated,
    },
    boundaryException: {
      outcome: boundaryException.outcome,
      independentExceptionsSealed: [
        "R5_PROOF_AUDIT_EXCEPTION",
        "R5_PROOF_EVALUATOR_EXCEPTION",
      ].every((code) => boundaryException.failureCodes.includes(code)),
    },
    orphanRefusal: {
      outcome: orphanRefusal.outcome,
      failClosed: orphanRefusal.failureCodes.includes(
        "R5_PROCESS_GROUP_NOT_EMPTY",
      ),
    },
    providerTerminalSeparation: {
      observed: providerTerminal.providerTurnFailedObserved,
      invented: providerTerminal.providerTerminalInvented,
    },
  };
  const outcome = allEvidenceManifestsValid
    && observations.normal.outcome === "success"
    && observations.normal.streamsAndFinalDrained
    && observations.deadlineTree.outcome === "terminated"
    && observations.deadlineTree.deadlineExpired
    && observations.deadlineTree.processTreeTerminated
    && observations.deadlineTree.descendantStopped
    && observations.forced.forceSignalSent
    && observations.forced.processTreeTerminated
    && observations.cancelled.outcome === "cancelled"
    && observations.cancelled.processTreeTerminated
    && observations.boundaryException.independentExceptionsSealed
    && observations.orphanRefusal.failClosed
    && observations.providerTerminalSeparation.observed
    && !observations.providerTerminalSeparation.invented
    && runs.every((run) => !run.providerTerminalInvented)
    ? "passed" : "failed";
  const proof = {
    schemaVersion: "R5-T2-process-tree-termination-proof-v1",
    taskId: "R5-T2",
    outcome,
    externalModelCalls: 0,
    immutableR4Input: {
      preserved: true,
      incidentHash: r4Hash,
      taskState: r4Interruption.taskState,
      decision: r4Interruption.decision,
      evidenceSealed: r4Interruption.evidenceSealed,
    },
    instrumentationHash,
    policy: policy(),
    observations,
    allEvidenceManifestsValid,
    processAttemptCount: runs.length,
    externalProcessAttemptCount: 0,
    sourceBindings,
    securityBoundary: {
      providerContacted: false,
      realCredentialsUsed: false,
      participantPayloadSent: false,
      groundTruthSent: false,
      productWorkUnlocked: false,
    },
  };
  if (outcome !== "passed") throw new Error("R5_T2_PROOF_FAILED");
  writeJson(join(output, "proof.json"), proof);
  writeText(join(output, "summary.md"), [
    "# R5-T2 process-tree termination proof",
    "",
    "- A monotonic outer deadline terminated a local parent and descendant.",
    "- SIGTERM-ignore escalated to SIGKILL within the frozen local probe bounds.",
    "- Cancellation, audit/evaluator exceptions and orphan observations sealed before return.",
    "- stdout, stderr, final observation, boundary state, receipt ledger, termination metadata and hashes were retained.",
    "- Runner termination never invented a provider turn.failed terminal.",
    "- R4 remains blocked/pending and no external model call was made.",
    "",
  ].join("\n"));
  writeTopManifest(output);
  return deepFreeze(proof);
}

function nodeInvocation(source, extraEnv = {}) {
  return {
    executable: process.execPath,
    args: ["-e", source],
    cwd: REPO_ROOT,
    env: {
      PATH: process.env.PATH ?? "",
      ...extraEnv,
    },
    evidence: {
      executable: "node",
      args: ["-e", "<bounded-local-proof-source>"],
    },
  };
}

function policy(overrides = {}) {
  return {
    deadlineMs: 250,
    graceMs: 80,
    forceKillWaitMs: 300,
    gracefulSignal: "SIGTERM",
    forceSignal: "SIGKILL",
    ...overrides,
  };
}

function passedAudit({ events }) {
  return {
    status: "passed",
    valid: true,
    eventCount: events.length,
    failureCodes: [],
  };
}

function passedEvaluation() {
  return {
    status: "passed",
    valid: true,
    failureCodes: [],
  };
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function writeTopManifest(root) {
  const files = scanFiles(root)
    .filter((entry) => entry.relativePath !== "SHA256SUMS");
  const body = `${files.map((entry) => (
    `${sha256(readFileSync(entry.absolutePath))}  ${entry.relativePath}`
  )).join("\n")}\n`;
  writeText(join(root, "SHA256SUMS"), body);
}

function scanFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) throw new Error("R5_T2_EVIDENCE_SYMLINK");
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push({ absolutePath, relativePath });
      } else {
        throw new Error("R5_T2_EVIDENCE_NODE_INVALID");
      }
    }
  };
  visit(root);
  return files.sort((left, right) => (
    left.relativePath.localeCompare(right.relativePath)
  ));
}

function requireDirectory(path, code) {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
  } catch {
    throw new Error(code);
  }
}

function writeJson(path, value) {
  writeText(path, `${canonicalJson(value)}\n`);
}

function writeText(path, value) {
  writeFileSync(path, value, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
