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
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  canonicalSha256,
} from "../../packages/pilot-harness/dist/index.js";
import {
  cleanupParticipantCapsule,
  createParticipantCapsule,
} from "./capsule.mjs";
import { auditCodexJsonlV3 } from "./capsule-audit-v3.mjs";
import {
  buildR3PermissionProfileProbeInvocation,
  runR3PermissionProfileProbe,
} from "./r3-capsule.mjs";
import { executeR2RecordedProcess } from "./r2-run-recorder.mjs";
import {
  finalizeR3RecordedRun,
  sealR3BatchOutcome,
} from "./r3-run-finalizer.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "../..");
const EVIDENCE_PARENT = join(REPO_ROOT, "docs/test-evidence/R3-T2");
const R2_FAILURE_RUN = join(
  REPO_ROOT,
  "docs/test-evidence/R2-T4/20260729T230343+0800/results/runs",
  "r2-final-05-download-control-1-direct-search",
);
const FIXTURE_ROOT = join(
  REPO_ROOT,
  "docs/test-evidence/R1-T3/20260729T203631+0800",
);
const SOURCE_PATHS = Object.freeze([
  "scripts/pilot/capsule-audit-v3.mjs",
  "scripts/pilot/r3-capsule.mjs",
  "scripts/pilot/r3-run-finalizer.mjs",
  "scripts/pilot/prove-r3-t2.mjs",
]);
const EXPECTED_RESPONSE = Object.freeze({
  relativeFile: "packages/demo-fixture/src/App.tsx",
  line: 7,
  sourceAnchorId: null,
});

export async function buildR3T2Proof({
  outputRoot,
  enforceEvidenceParent = true,
  permissionProbeRunner = runR3PermissionProfileProbe,
}) {
  const output = resolve(outputRoot);
  if ((enforceEvidenceParent && dirname(output) !== EVIDENCE_PARENT)
    || existsSync(output)
    || typeof permissionProbeRunner !== "function") {
    throw new Error("R3_T2_OUTPUT_ROOT_INVALID");
  }
  requireDirectory(
    enforceEvidenceParent ? EVIDENCE_PARENT : dirname(output),
    "R3_T2_OUTPUT_PARENT_INVALID",
  );
  mkdirSync(output, { mode: 0o700 });

  const sourceBindings = Object.fromEntries(SOURCE_PATHS.map((path) => [
    path,
    sha256(readFileSync(join(REPO_ROOT, path))),
  ]));
  const instrumentationHash = canonicalSha256(sourceBindings);
  const replayJsonl = readFileSync(join(R2_FAILURE_RUN, "stdout.jsonl"), "utf8");
  const replayStderr = readFileSync(join(R2_FAILURE_RUN, "stderr.txt"), "utf8");
  const replay = auditCodexJsonlV3({
    jsonl: replayJsonl,
    stderr: replayStderr,
  });
  if (!replay.valid
    || replay.attemptedDiscoveryWarningCount !== 1
    || replay.observedForbiddenRulePathCount !== 0
    || replay.commandExternalPathCount !== 0
    || replay.observedExternalPathCount !== 0) {
    throw new Error("R3_T2_R2_REPLAY_FAILED");
  }
  const skillWarning = auditCompletedCommand(
    "rg --files -g 'SKILL.md'",
    "",
  );
  const observedSkill = auditCompletedCommand(
    "rg --files -g 'SKILL.md'",
    ".agents/skills/visual-ui-edit/SKILL.md\n",
  );
  const combinedWarning = auditCompletedCommand(
    "rg --files -g 'AGENTS.md' -g 'SKILL.md'",
    "",
  );
  const markerSemantics = {
    agentsMarkerOnlyWarning: replay.valid
      && replay.attemptedDiscoveryWarnings[0]?.marker === "AGENTS.md",
    skillMarkerOnlyWarning: skillWarning.valid
      && skillWarning.attemptedDiscoveryWarningCount === 1
      && skillWarning.attemptedDiscoveryWarnings[0]?.marker === "SKILL.md",
    combinedMarkerWarning: combinedWarning.valid
      && combinedWarning.attemptedDiscoveryWarningCount === 2,
    observedSkillPathFailsClosed: !observedSkill.valid
      && observedSkill.failureCodes.includes(
        "CAPSULE_AUDIT_V3_FORBIDDEN_RULE_OBSERVED",
      ),
  };
  if (!Object.values(markerSemantics).every(Boolean)) {
    throw new Error("R3_T2_MARKER_SEMANTICS_FAILED");
  }

  const capsule = createParticipantCapsule({
    sourceRoot: join(FIXTURE_ROOT, "fixture"),
    taskId: "r3-t2-permission-profile-proof",
    arm: "direct-search",
    responseSchemaPath: join(FIXTURE_ROOT, "inputs/response-schema.json"),
  });
  let permissionProbe;
  try {
    const invocation = buildR3PermissionProfileProbeInvocation({ capsule });
    permissionProbe = permissionProbeRunner(invocation);
  } finally {
    cleanupParticipantCapsule(capsule);
  }
  assertPermissionProbe(permissionProbe);

  const faultsRoot = join(output, "contained-runs");
  mkdirSync(faultsRoot, { mode: 0o700 });
  const success = await createAndFinalizeLocalRun({
    runRoot: join(faultsRoot, "success"),
    runId: "r3-t2-success",
    instrumentationHash,
  });
  const auditException = await createAndFinalizeLocalRun({
    runRoot: join(faultsRoot, "audit-exception"),
    runId: "r3-t2-audit-exception",
    instrumentationHash,
    finalizerOptions: {
      audit() { throw new Error("R3_PROOF_AUDIT_EXCEPTION"); },
    },
  });
  const evaluatorException = await createAndFinalizeLocalRun({
    runRoot: join(faultsRoot, "evaluator-exception"),
    runId: "r3-t2-evaluator-exception",
    instrumentationHash,
    finalizerOptions: {
      evaluationProbe() { throw new Error("R3_PROOF_EVALUATOR_EXCEPTION"); },
    },
  });
  const hashException = await createAndFinalizeLocalRun({
    runRoot: join(faultsRoot, "hash-exception"),
    runId: "r3-t2-hash-exception",
    instrumentationHash,
    finalizerOptions: {
      verifyRecorderEvidence() { throw new Error("R3_PROOF_HASH_EXCEPTION"); },
    },
  });

  const batchRoot = join(output, "aggregate-exception");
  const batchRunRoot = join(batchRoot, "runs/r3-t2-batch-first");
  mkdirSync(dirname(batchRunRoot), { recursive: true, mode: 0o700 });
  const batchRun = await createAndFinalizeLocalRun({
    runRoot: batchRunRoot,
    runId: "r3-t2-batch-first",
    instrumentationHash,
  });
  const aggregateException = sealR3BatchOutcome({
    resultRoot: batchRoot,
    runs: [batchRun.result],
    expectedRunCount: 2,
    aggregateProbe() { throw new Error("R3_PROOF_AGGREGATE_EXCEPTION"); },
  });

  const exceptionChecks = {
    audit: sealedFailure(auditException, "R3_PROOF_AUDIT_EXCEPTION"),
    evaluator: sealedFailure(
      evaluatorException,
      "R3_PROOF_EVALUATOR_EXCEPTION",
    ),
    hash: sealedFailure(hashException, "R3_PROOF_HASH_EXCEPTION"),
    aggregate: aggregateException.batchStopped
      && aggregateException.completedRunCount === 1
      && aggregateException.remainingRunCount === 1
      && aggregateException.evidenceSealed,
  };
  const proof = {
    schemaVersion: "R3-T2-audit-containment-proof-v1",
    taskId: "R3-T2",
    outcome: success.result.ok
      && Object.values(exceptionChecks).every(Boolean)
      && Object.values(markerSemantics).every(Boolean)
      ? "passed" : "failed",
    externalModelCalls: 0,
    instrumentationHash,
    r2ImmutableReplay: {
      sourceRunId: "r2-final-05-download-control-1-direct-search",
      sourceStdoutSha256: sha256(replayJsonl),
      sourceStderrSha256: sha256(replayStderr),
      auditValid: replay.valid,
      attemptedDiscoveryWarningCount: replay.attemptedDiscoveryWarningCount,
      warningNonAuthorizing:
        replay.attemptedDiscoveryWarnings[0]?.nonAuthorizing === true,
      observedForbiddenRulePathCount: replay.observedForbiddenRulePathCount,
      observedExternalPathCount: replay.observedExternalPathCount,
      immutableR2VerdictPreserved: true,
    },
    permissionProfileProbe: permissionProbe,
    markerSemantics,
    containment: {
      rawFinalTerminalLedgerAndHashOnSuccess: success.manifestPreserved
        && success.result.evidenceSealed,
      recorderManifestPreservedAcrossAllRuns: [
        success,
        auditException,
        evaluatorException,
        hashException,
        batchRun,
      ].every((run) => run.manifestPreserved),
      exceptionChecks,
      structuredBatchStop: aggregateException.batchStopped,
    },
    securityBoundary: {
      participantWorkspace: "read-only",
      soleWrite: "runner-owned-bounded-final-output-file",
      generatedCommandAuthAccess: "deny",
      generatedCommandEnvironment: "clean-fixed-non-secret",
      procAttemptAuditPolicy: "fail-closed",
      realCredentialsUsed: false,
    },
    sourceBindings,
  };
  if (proof.outcome !== "passed") throw new Error("R3_T2_PROOF_FAILED");
  writeJson(join(output, "proof.json"), proof);
  writeJson(join(output, "r2-replay-summary.json"), {
    schemaVersion: "R3-T2-r2-replay-summary-v1",
    ...proof.r2ImmutableReplay,
  });
  const summary = [
    "# R3-T2 capsule-audit containment proof",
    "",
    "- R2 run nine replays as one non-authorizing bounded discovery warning.",
    "- Marker-only AGENTS.md and SKILL.md negative lookups are warnings; observed paths fail closed.",
    "- Observed rule content, sensitive paths, traversal and external paths remain fail closed.",
    "- Audit, evaluator, recorder-hash and aggregate exceptions seal before return.",
    "- A no-model dummy credential probe proves auth denial and a read-only workspace.",
    "- No external model call was made and no prior verdict was changed.",
    "",
  ].join("\n");
  writeText(join(output, "summary.md"), summary);
  writeTopManifest(output);
  return deepFreeze(proof);
}

function auditCompletedCommand(command, output) {
  const item = {
    id: "r3-marker-proof",
    type: "command_execution",
    command,
  };
  return auditCodexJsonlV3({
    jsonl: [
      JSON.stringify({ type: "thread.started", thread_id: "r3-marker-thread" }),
      JSON.stringify({
        type: "item.started",
        item: {
          ...item,
          aggregated_output: "",
          exit_code: null,
          status: "in_progress",
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          ...item,
          aggregated_output: output,
          exit_code: 0,
          status: "completed",
        },
      }),
      JSON.stringify({ type: "turn.completed" }),
    ].join("\n"),
  });
}

async function createAndFinalizeLocalRun({
  runRoot,
  runId,
  instrumentationHash,
  finalizerOptions = {},
}) {
  const control = mkdtempSync(join(tmpdir(), "vem-r3-t2-proof-"));
  const finalPath = join(control, "final-response.json");
  const responseText = JSON.stringify(EXPECTED_RESPONSE);
  const events = [
    { type: "thread.started", thread_id: `${runId}-thread` },
    {
      type: "item.completed",
      item: {
        id: "message",
        type: "agent_message",
        text: responseText,
      },
    },
    { type: "turn.completed", usage: {} },
  ];
  const program = [
    ...events.map((event) => (
      `printf '%s\\n' ${shellQuote(JSON.stringify(event))}`
    )),
    `printf '%s' ${shellQuote(responseText)} > "$1"`,
  ].join("\n");
  try {
    await executeR2RecordedProcess({
      invocation: {
        executable: "/bin/sh",
        args: ["-c", program, "r3-t2-local-probe", finalPath],
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH ?? "" },
        authoritativeResponsePath: finalPath,
        evidence: { taskId: "R3-T2", modelCall: false, runId },
      },
      outputRoot: runRoot,
      runId,
      instrumentationHash,
      validateResponse,
      metadata: { externalModelCall: false },
    });
    const before = readFileSync(join(runRoot, "SHA256SUMS"), "utf8");
    const result = finalizeR3RecordedRun({
      runRoot,
      groundTruth: EXPECTED_RESPONSE,
      ...finalizerOptions,
    });
    const after = readFileSync(join(runRoot, "SHA256SUMS"), "utf8");
    return Object.freeze({
      result,
      manifestPreserved: before === after,
    });
  } finally {
    rmSync(control, { recursive: true, force: true });
  }
}

function sealedFailure(run, expectedCode) {
  return !run.result.ok
    && run.result.outcome === "failed"
    && run.result.failureCodes.includes(expectedCode)
    && run.result.evidenceSealed
    && run.manifestPreserved;
}

function assertPermissionProbe(result) {
  if (typeof result !== "object"
    || result === null
    || result.ok !== true
    || result.modelCall !== false
    || result.workspaceReadable !== true
    || result.workspaceWritable !== false
    || result.authReadable !== false
    || result.procEnvironmentReadable !== true
    || result.procEnvironmentSensitiveValuesAbsent !== true
    || result.networkPolicyConfiguredDisabled !== true
    || result.networkRuntimeProbed !== false) {
    throw new Error("R3_T2_PERMISSION_PROFILE_PROBE_FAILED");
  }
}

function validateResponse(text) {
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  return canonicalJson(value) === canonicalJson(EXPECTED_RESPONSE)
    ? value : null;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function writeTopManifest(root) {
  const files = collectFiles(root)
    .filter((path) => relative(root, path).replaceAll("\\", "/") !== "SHA256SUMS");
  writeText(join(root, "SHA256SUMS"), `${files.map((path) => (
    `${sha256(readFileSync(path))}  ${relative(root, path).replaceAll("\\", "/")}`
  )).join("\n")}\n`);
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("R3_T2_EVIDENCE_SYMLINK_REJECTED");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("R3_T2_EVIDENCE_NON_REGULAR_REJECTED");
      if (files.length > 256) throw new Error("R3_T2_EVIDENCE_FILE_LIMIT");
    }
  };
  visit(root);
  return files.sort();
}

function requireDirectory(path, code) {
  const resolved = resolve(path);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
  return resolved;
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

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node scripts/pilot/prove-r3-t2.mjs <output-root>");
  }
  const proof = await buildR3T2Proof({ outputRoot: process.argv[2] });
  process.stdout.write(`${canonicalJson({
    ok: true,
    taskId: proof.taskId,
    instrumentationHash: proof.instrumentationHash,
    externalModelCalls: proof.externalModelCalls,
  })}\n`);
}
