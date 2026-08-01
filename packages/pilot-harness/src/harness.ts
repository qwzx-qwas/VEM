import { execFileSync } from "node:child_process";
import { closeSync, constants, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { validatePublication } from "@vem/source-registry";
import { Ajv2020 } from "ajv/dist/2020.js";
import { canonicalJson, canonicalSha256, deepFreeze, sha256Text } from "./canonical.js";
import type {
  CanonicalPilotEvidenceBundle,
  CanonicalPilotTaskEvidence,
  PilotArm,
  PilotBuildRequest,
  PilotBuildResult,
  PilotFileReference,
  PilotGroundTruth,
  PilotHarnessOptions,
  PilotHoldoutExclusion,
  PilotLocatedSource,
  PilotRawRecord,
  PilotRegistryInput,
  PilotSchemaValidation,
  PilotSelectionInput,
  PilotTaskDefinition,
  PilotTaskManifest,
  PilotTimingBoundary,
  PilotTrialArmRecord,
  PilotTrialRecord,
} from "./types.js";

const MAX_INPUT_BYTES = 1_048_576;
const MAX_TASKS = 5;
const MIN_TASKS = 3;
const MAX_HOLDOUT_TASKS = 256;
const MAX_CANDIDATES = 3;
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const VERSION = /^[A-Za-z0-9._:-]{1,64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ANCHOR = /^vem1_[a-f0-9]{32}$/u;
const RELATIVE_FILE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._~/-]{1,512}$/u;
const DECIMAL_NS = /^(?:0|[1-9][0-9]{0,19})$/u;
const SCHEMA_ID = "https://vem.local/schemas/p0-t17a/evidence-bundle-v1" as const;
const ALLOWED_OPERATIONS = ["read", "hash", "validate", "rank", "evaluate"] as const;
const EVIDENCE_BUNDLE_SCHEMA = JSON.parse(readFileSync(
  new URL("../schemas/evidence-bundle.schema.json", import.meta.url),
  "utf8",
)) as object;
const validateBundleSchema = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false,
}).compile(EVIDENCE_BUNDLE_SCHEMA);

interface InputSnapshot {
  absolutePath: string;
  sha256: string;
  size: number;
}

interface LoadedTask {
  definition: PilotTaskDefinition;
  selection: PilotSelectionInput;
  registry: ReturnType<typeof validatePublication>;
  groundTruth: PilotGroundTruth;
  trial: PilotTrialRecord;
  trialInputHash: string;
}

export class VersionedReadOnlyPilotHarness {
  readonly #rootDir: string;
  readonly #readFixtureCommit: (fixtureRoot: string) => string;

  constructor(options: PilotHarnessOptions) {
    if (typeof options !== "object" || options === null) throw codeError("HARNESS_OPTIONS_INVALID");
    const root = realpathSync(options.rootDir);
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw codeError("HARNESS_ROOT_INVALID");
    this.#rootDir = root;
    this.#readFixtureCommit = options.readFixtureCommit ?? defaultReadFixtureCommit;
  }

  build(request: PilotBuildRequest): PilotBuildResult {
    validateBuildRequest(request);
    const snapshots = new Map<string, InputSnapshot>();
    const manifest = this.#readJson<PilotTaskManifest>(request.taskManifest, snapshots);
    validateTaskManifest(manifest);
    const taskManifestHash = canonicalSha256(manifest);
    const timingBoundaryHash = canonicalSha256(manifest.timingBoundary);
    const holdout = this.#readJson<PilotHoldoutExclusion>(manifest.laterHoldoutExclusion, snapshots);
    validateHoldout(holdout);

    const trialByTask = new Map(request.trialRecords.map((entry) => [entry.taskId, entry.input]));
    const groundTruthByTask = new Map(request.groundTruthRecords.map((entry) => [entry.taskId, entry.input]));
    if (trialByTask.size !== request.trialRecords.length) throw codeError("BUILD_REQUEST_INVALID");
    if (groundTruthByTask.size !== request.groundTruthRecords.length) throw codeError("BUILD_REQUEST_INVALID");
    if (trialByTask.size !== manifest.tasks.length
      || groundTruthByTask.size !== manifest.tasks.length
      || manifest.tasks.some((task) => !trialByTask.has(task.taskId) || !groundTruthByTask.has(task.taskId))) {
      throw codeError("TRIAL_SET_MISMATCH");
    }

    const holdoutIds = new Set(holdout.taskIds);
    const loaded: LoadedTask[] = manifest.tasks.map((definition) => {
      if (holdoutIds.has(definition.taskId)) throw codeError("LATER_HOLDOUT_REUSED");
      const selection = this.#readJson<PilotSelectionInput>(definition.selectionInput, snapshots);
      const publication = this.#readJson<PilotRegistryInput>(definition.sourceRegistryInput, snapshots);
      const groundTruthRef = groundTruthByTask.get(definition.taskId);
      if (!groundTruthRef || groundTruthRef.sha256 !== definition.groundTruthHash) {
        throw codeError("GROUND_TRUTH_HASH_MISMATCH");
      }
      const groundTruth = this.#readJson<PilotGroundTruth>(groundTruthRef, snapshots);
      const trialRef = trialByTask.get(definition.taskId);
      if (!trialRef) throw codeError("TRIAL_SET_MISMATCH");
      const trial = this.#readJson<PilotTrialRecord>(trialRef, snapshots);
      validateSelection(selection);
      const registry = validateRegistry(publication);
      validateGroundTruth(groundTruth, definition.taskId);
      validateTrial(trial, definition, timingBoundaryHash);
      validateCrossInput(definition, selection, registry.publication, groundTruth);
      return { definition, selection, registry, groundTruth, trial, trialInputHash: trialRef.sha256 };
    });

    validateArmBalance(manifest.tasks);
    for (const task of loaded) {
      const fixtureRoot = this.#resolveDirectory(task.definition.fixtureRoot);
      const observedCommit = this.#readFixtureCommit(fixtureRoot).trim().toLowerCase();
      if (!GIT_COMMIT.test(observedCommit) || observedCommit !== task.definition.fixtureCommit) {
        throw codeError("FIXTURE_COMMIT_MISMATCH");
      }
    }

    const tasks = loaded.map((task) => buildTaskEvidence(
      task,
      manifest,
      taskManifestHash,
      timingBoundaryHash,
    ));
    const bundle: CanonicalPilotEvidenceBundle = {
      schemaVersion: "P0-T17A-canonical-evidence-bundle-v1",
      pilotPlanVersion: manifest.pilotPlanVersion,
      harnessVersion: manifest.harnessVersion,
      hashNamespace: manifest.hashNamespace,
      taskManifestVersion: manifest.taskManifestVersion,
      taskManifestHash,
      timingBoundary: { ...manifest.timingBoundary },
      timingBoundaryHash,
      setupCostBoundary: { ...manifest.setupCostBoundary },
      laterHoldoutExclusionHash: manifest.laterHoldoutExclusion.sha256,
      taskCount: tasks.length,
      tasks,
      limitations: [
        "ENGINEERING_SMOKE_ONLY",
        "NO_STATISTICAL_PRODUCT_CLAIM",
        "NO_P0_VALUE_VERDICT",
      ],
    };
    const result = new CanonicalEvidenceBundleBuilder().build(bundle);
    this.#assertInputsUnchanged(snapshots);
    return result;
  }

  #readJson<T>(reference: PilotFileReference, snapshots: Map<string, InputSnapshot>): T {
    validateFileReference(reference);
    const absolutePath = this.#resolveInputFile(reference.path);
    const existing = snapshots.get(absolutePath);
    if (existing) {
      if (existing.sha256 !== reference.sha256) throw codeError("INPUT_REFERENCE_CONFLICT");
      return parseJson<T>(readBounded(absolutePath));
    }
    let body: Uint8Array;
    try {
      body = readBounded(absolutePath);
    } catch (error) {
      if (isMissing(error)) throw codeError("INPUT_MISSING");
      throw error;
    }
    const digest = sha256Text(body);
    if (digest !== reference.sha256) throw codeError("INPUT_HASH_MISMATCH");
    snapshots.set(absolutePath, { absolutePath, sha256: digest, size: body.byteLength });
    return parseJson<T>(body);
  }

  #resolveInputFile(relativePath: string): string {
    validateRelativePath(relativePath);
    assertNoSymlinkComponents(this.#rootDir, relativePath);
    const unresolved = resolve(this.#rootDir, relativePath);
    let stat;
    try {
      stat = lstatSync(unresolved);
    } catch (error) {
      if (isMissing(error)) throw codeError("INPUT_MISSING");
      throw error;
    }
    if (stat.isSymbolicLink()) throw codeError("INPUT_SYMLINK_REJECTED");
    if (!stat.isFile()) throw codeError("INPUT_NOT_REGULAR_FILE");
    const resolved = realpathSync(unresolved);
    requireWithinRoot(this.#rootDir, resolved);
    return resolved;
  }

  #resolveDirectory(relativePath: string): string {
    validateRelativePath(relativePath);
    assertNoSymlinkComponents(this.#rootDir, relativePath);
    const unresolved = resolve(this.#rootDir, relativePath);
    let stat;
    try {
      stat = lstatSync(unresolved);
    } catch (error) {
      if (isMissing(error)) throw codeError("INPUT_MISSING");
      throw error;
    }
    if (stat.isSymbolicLink()) throw codeError("INPUT_SYMLINK_REJECTED");
    if (!stat.isDirectory()) throw codeError("FIXTURE_ROOT_INVALID");
    const resolved = realpathSync(unresolved);
    requireWithinRoot(this.#rootDir, resolved);
    return resolved;
  }

  #assertInputsUnchanged(snapshots: Map<string, InputSnapshot>): void {
    for (const snapshot of snapshots.values()) {
      let body: Uint8Array;
      try {
        body = readBounded(snapshot.absolutePath);
      } catch {
        throw codeError("INPUT_CHANGED_DURING_BUILD");
      }
      if (body.byteLength !== snapshot.size || sha256Text(body) !== snapshot.sha256) {
        throw codeError("INPUT_CHANGED_DURING_BUILD");
      }
    }
  }
}

export class CanonicalEvidenceBundleBuilder {
  build(bundle: CanonicalPilotEvidenceBundle): PilotBuildResult {
    const schemaValidation = validateEvidenceBundle(bundle);
    const canonical = canonicalJson(bundle);
    return deepFreeze({
      bundle,
      canonicalJson: canonical,
      contentHash: sha256Text(canonical),
      schemaValidation,
      summary: `P0-T17A canonical evidence bundle: ${bundle.tasks.length} tasks, `
        + `${bundle.tasks.length * 2} isolated-arm records, schema valid, no verdict.`,
    });
  }
}

export function validateEvidenceBundle(bundle: CanonicalPilotEvidenceBundle): PilotSchemaValidation {
  if (!validateBundleSchema(bundle)) throw codeError("EVIDENCE_BUNDLE_SCHEMA_INVALID");
  requireExactKeys(bundle, [
    "schemaVersion",
    "pilotPlanVersion",
    "harnessVersion",
    "hashNamespace",
    "taskManifestVersion",
    "taskManifestHash",
    "timingBoundary",
    "timingBoundaryHash",
    "setupCostBoundary",
    "laterHoldoutExclusionHash",
    "taskCount",
    "tasks",
    "limitations",
  ], "EVIDENCE_BUNDLE_INVALID");
  if (bundle.schemaVersion !== "P0-T17A-canonical-evidence-bundle-v1"
    || bundle.harnessVersion !== "1.0.0"
    || bundle.hashNamespace !== "vem-pilot-v1-sha256"
    || !VERSION.test(bundle.pilotPlanVersion)
    || !VERSION.test(bundle.taskManifestVersion)
    || !SHA256.test(bundle.taskManifestHash)
    || !SHA256.test(bundle.timingBoundaryHash)
    || !SHA256.test(bundle.laterHoldoutExclusionHash)
    || bundle.taskCount < MIN_TASKS
    || bundle.taskCount > MAX_TASKS
    || bundle.tasks.length !== bundle.taskCount
    || canonicalSha256(bundle.timingBoundary) !== bundle.timingBoundaryHash
    || canonicalJson(bundle.limitations) !== canonicalJson([
      "ENGINEERING_SMOKE_ONLY",
      "NO_STATISTICAL_PRODUCT_CLAIM",
      "NO_P0_VALUE_VERDICT",
    ])) {
    throw codeError("EVIDENCE_BUNDLE_INVALID");
  }
  validateTimingBoundary(bundle.timingBoundary);
  validateSetupBoundary(bundle.setupCostBoundary);
  const taskIds = new Set<string>();
  for (const task of bundle.tasks) {
    validateBundleTask(task);
    if (taskIds.has(task.taskId)) throw codeError("EVIDENCE_BUNDLE_INVALID");
    taskIds.add(task.taskId);
  }
  return Object.freeze({ valid: true, schemaId: SCHEMA_ID });
}

function buildTaskEvidence(
  task: LoadedTask,
  manifest: PilotTaskManifest,
  taskManifestHash: string,
  timingBoundaryHash: string,
): CanonicalPilotTaskEvidence {
  const registryRevision = task.registry.publication.revision.sourceRegistryRevision;
  const directRecord = task.selection.claimedSourceAnchorId === null
    ? undefined
    : task.registry.records.find((record) => record.sourceAnchorId === task.selection.claimedSourceAnchorId);
  const rawRecords = task.trial.arms.map((armRecord) => {
    const raw = buildRawRecord(
      task,
      armRecord,
      directRecord,
      manifest,
      taskManifestHash,
      timingBoundaryHash,
    );
    return {
      rawRecordHash: canonicalSha256(raw),
      record: raw,
    };
  });
  return {
    taskId: task.definition.taskId,
    promptHash: task.definition.promptHash,
    fixtureCommit: task.definition.fixtureCommit,
    sourceRegistryRevision: registryRevision,
    selectionSnapshotHash: task.selection.selectionSnapshotHash,
    groundTruthHash: task.definition.groundTruthHash,
    selectionInputHash: task.definition.selectionInput.sha256,
    sourceRegistryInputHash: task.definition.sourceRegistryInput.sha256,
    trialInputHash: task.trialInputHash,
    armOrder: [...task.definition.armOrder],
    rawRecords,
  };
}

function buildRawRecord(
  task: LoadedTask,
  trial: PilotTrialArmRecord,
  directRecord: LoadedTask["registry"]["records"][number] | undefined,
  manifest: PilotTaskManifest,
  taskManifestHash: string,
  timingBoundaryHash: string,
): PilotRawRecord {
  const durationNs = (BigInt(trial.endedAtNs) - BigInt(trial.startedAtNs)).toString();
  const directAvailable = trial.arm === "vem-assisted" ? directRecord !== undefined : null;
  let directPrimaryMatch: boolean | null = null;
  let degradedTop1Match: boolean | null = null;
  let degradedTop3Match: boolean | null = null;
  if (trial.arm === "vem-assisted") {
    if (directRecord) {
      if (trial.degradedCandidates.length > 0
        || trial.directUnavailableReason !== null
        || trial.chosenCandidateRank !== null) {
        throw codeError("DIRECT_AS_CANDIDATE_INVALID");
      }
      directPrimaryMatch = sourceMatches(directRecord, task.groundTruth);
    } else {
      if (trial.directUnavailableReason === null) throw codeError("DIRECT_UNAVAILABLE_REASON_REQUIRED");
      degradedTop1Match = trial.degradedCandidates[0] === undefined
        ? false
        : sourceMatches(trial.degradedCandidates[0], task.groundTruth);
      degradedTop3Match = trial.degradedCandidates.some((candidate) => sourceMatches(candidate, task.groundTruth));
      validateChosenCandidate(trial);
    }
  } else if (trial.directUnavailableReason !== null
    || trial.degradedCandidates.length > 0
    || trial.chosenCandidateRank !== null) {
    throw codeError("DIRECT_SEARCH_RECORD_INVALID");
  }
  const locatedMatches = trial.locatedSource !== null && sourceMatches(trial.locatedSource, task.groundTruth);
  const wrongAttribution = trial.arm === "vem-assisted" && directPrimaryMatch !== null
    ? !directPrimaryMatch
    : !locatedMatches;
  return {
    schemaVersion: "P0-T17A-raw-record-v1",
    pilotPlanVersion: manifest.pilotPlanVersion,
    harnessVersion: manifest.harnessVersion,
    hashNamespace: manifest.hashNamespace,
    taskManifestHash,
    taskId: task.definition.taskId,
    arm: trial.arm,
    armOrder: trial.order,
    fixtureCommit: task.definition.fixtureCommit,
    sourceRegistryRevision: task.registry.publication.revision.sourceRegistryRevision,
    selectionSnapshotHash: task.selection.selectionSnapshotHash,
    timingBoundaryHash,
    groundTruthHash: task.definition.groundTruthHash,
    selectionInputHash: task.definition.selectionInput.sha256,
    sourceRegistryInputHash: task.definition.sourceRegistryInput.sha256,
    trialInputHash: task.trialInputHash,
    setupDurationNs: task.trial.setupDurationNs,
    locateDurationNs: durationNs,
    locatedSourceIdentityHash: trial.locatedSource === null ? null : sourceIdentityHash(trial.locatedSource),
    directPrimaryAvailable: directAvailable,
    directPrimaryMatch,
    directUnavailableReason: trial.directUnavailableReason,
    degradedTop1Match,
    degradedTop3Match,
    chosenCandidateRank: trial.chosenCandidateRank,
    wrongAttribution,
    targetChanged: trial.targetChanged,
    reselectionCount: trial.reselectionCount,
    operatorCorrection: trial.operatorCorrection,
  };
}

function validateBuildRequest(request: PilotBuildRequest): void {
  requireExactKeys(request, ["taskManifest", "groundTruthRecords", "trialRecords"], "BUILD_REQUEST_INVALID");
  validateFileReference(request.taskManifest);
  if (!Array.isArray(request.groundTruthRecords)
    || request.groundTruthRecords.length < MIN_TASKS
    || request.groundTruthRecords.length > MAX_TASKS
    || !Array.isArray(request.trialRecords)
    || request.trialRecords.length < MIN_TASKS
    || request.trialRecords.length > MAX_TASKS) {
    throw codeError("BUILD_REQUEST_INVALID");
  }
  for (const trial of request.trialRecords) {
    requireExactKeys(trial, ["taskId", "input"], "BUILD_REQUEST_INVALID");
    if (!ID.test(trial.taskId)) throw codeError("BUILD_REQUEST_INVALID");
    validateFileReference(trial.input);
  }
  for (const groundTruth of request.groundTruthRecords) {
    requireExactKeys(groundTruth, ["taskId", "input"], "BUILD_REQUEST_INVALID");
    if (!ID.test(groundTruth.taskId)) throw codeError("BUILD_REQUEST_INVALID");
    validateFileReference(groundTruth.input);
  }
}

function validateTaskManifest(manifest: PilotTaskManifest): void {
  requireExactKeys(manifest, [
    "schemaVersion",
    "pilotPlanVersion",
    "harnessVersion",
    "hashNamespace",
    "taskManifestVersion",
    "timingBoundary",
    "setupCostBoundary",
    "laterHoldoutExclusion",
    "allowedOperations",
    "tasks",
  ], "MANIFEST_INVALID");
  if (manifest.schemaVersion !== "P0-T17A-task-manifest-v1"
    || manifest.harnessVersion !== "1.0.0"
    || manifest.hashNamespace !== "vem-pilot-v1-sha256"
    || !VERSION.test(manifest.pilotPlanVersion)
    || !VERSION.test(manifest.taskManifestVersion)
    || canonicalJson(manifest.allowedOperations) !== canonicalJson(ALLOWED_OPERATIONS)
    || !Array.isArray(manifest.tasks)
    || manifest.tasks.length < MIN_TASKS
    || manifest.tasks.length > MAX_TASKS) {
    throw codeError("MANIFEST_INVALID");
  }
  validateTimingBoundary(manifest.timingBoundary);
  validateSetupBoundary(manifest.setupCostBoundary);
  validateFileReference(manifest.laterHoldoutExclusion);
  const taskIds = new Set<string>();
  for (const task of manifest.tasks) {
    validateTaskDefinition(task);
    if (taskIds.has(task.taskId)) throw codeError("MANIFEST_INVALID");
    taskIds.add(task.taskId);
  }
}

function validateTaskDefinition(task: PilotTaskDefinition): void {
  requireExactKeys(task, [
    "taskId",
    "promptHash",
    "fixtureRoot",
    "fixtureCommit",
    "selectionInput",
    "sourceRegistryInput",
    "groundTruthHash",
    "armOrder",
  ], "MANIFEST_INVALID");
  if (!ID.test(task.taskId)
    || !SHA256.test(task.promptHash)
    || !SHA256.test(task.groundTruthHash)
    || !GIT_COMMIT.test(task.fixtureCommit)
    || !Array.isArray(task.armOrder)
    || task.armOrder.length !== 2
    || new Set(task.armOrder).size !== 2
    || !task.armOrder.includes("direct-search")
    || !task.armOrder.includes("vem-assisted")) {
    throw codeError("MANIFEST_INVALID");
  }
  validateRelativePath(task.fixtureRoot);
  validateFileReference(task.selectionInput);
  validateFileReference(task.sourceRegistryInput);
}

function validateTimingBoundary(boundary: PilotTimingBoundary): void {
  requireExactKeys(boundary, ["clock", "unit", "startEvent", "endEvent", "cachePolicy"], "TIMING_BOUNDARY_INVALID");
  if (boundary.clock !== "monotonic"
    || boundary.unit !== "nanoseconds"
    || boundary.startEvent !== "prompt-displayed"
    || boundary.endEvent !== "source-located"
    || !["cold", "warm"].includes(boundary.cachePolicy)) {
    throw codeError("TIMING_BOUNDARY_INVALID");
  }
}

function validateSetupBoundary(boundary: PilotTaskManifest["setupCostBoundary"]): void {
  requireExactKeys(boundary, ["separatelyReported", "includes", "excludes"], "SETUP_BOUNDARY_INVALID");
  if (boundary.separatelyReported !== true
    || boundary.includes !== "fixture-and-registry-setup-only"
    || boundary.excludes !== "per-task-location-time") {
    throw codeError("SETUP_BOUNDARY_INVALID");
  }
}

function validateHoldout(holdout: PilotHoldoutExclusion): void {
  requireExactKeys(holdout, ["schemaVersion", "taskIds"], "HOLDOUT_EXCLUSION_INVALID");
  if (holdout.schemaVersion !== "P0-T17A-later-holdout-exclusion-v1"
    || !Array.isArray(holdout.taskIds)
    || holdout.taskIds.length === 0
    || holdout.taskIds.length > MAX_HOLDOUT_TASKS
    || holdout.taskIds.some((id) => !ID.test(id))
    || new Set(holdout.taskIds).size !== holdout.taskIds.length) {
    throw codeError("HOLDOUT_EXCLUSION_INVALID");
  }
}

function validateSelection(selection: PilotSelectionInput): void {
  requireExactKeys(selection, [
    "schemaVersion",
    "selectionSnapshotHash",
    "claimedSourceAnchorId",
    "summary",
  ], "SELECTION_INPUT_INVALID");
  if (selection.schemaVersion !== "P0-T17A-selection-input-v1"
    || !SHA256.test(selection.selectionSnapshotHash)
    || (selection.claimedSourceAnchorId !== null && !ANCHOR.test(selection.claimedSourceAnchorId))
    || canonicalSha256(selection.summary) !== selection.selectionSnapshotHash) {
    throw codeError("SELECTION_INPUT_INVALID");
  }
  const summary = selection.summary;
  requireAllowedKeys(summary, [
    "schemaVersion",
    "protocolVersion",
    "selectionId",
    "kind",
    "tagName",
    "role",
    "textPreview",
    "textRedactionReasons",
    "contentTrust",
    "box",
    "ancestorPreview",
    "page",
    "provenance",
    "revision",
    "observedAt",
    "limitations",
  ], [
    "schemaVersion",
    "protocolVersion",
    "selectionId",
    "kind",
    "tagName",
    "textRedactionReasons",
    "contentTrust",
    "box",
    "ancestorPreview",
    "page",
    "provenance",
    "revision",
    "observedAt",
    "limitations",
  ], "SELECTION_INPUT_INVALID");
  if (summary.schemaVersion !== "P0-T5-injected-selection-v1"
    || summary.contentTrust !== "untrusted-page-data"
    || summary.provenance.confirmationIntegrity !== "page-untrusted"
    || summary.provenance.requiresExternalConfirmation !== true
    || summary.limitations[2] !== "NO_SOURCE_RESOLUTION") {
    throw codeError("SELECTION_INPUT_INVALID");
  }
}

function validateRegistry(publication: PilotRegistryInput): ReturnType<typeof validatePublication> {
  try {
    return validatePublication(publication);
  } catch {
    throw codeError("SOURCE_REGISTRY_INPUT_INVALID");
  }
}

function validateGroundTruth(groundTruth: PilotGroundTruth, taskId: string): void {
  requireExactKeys(groundTruth, [
    "schemaVersion",
    "taskId",
    "expectedSourceAnchorId",
    "expectedRelativeFile",
  ], "GROUND_TRUTH_INVALID");
  if (groundTruth.schemaVersion !== "P0-T17A-ground-truth-v1"
    || groundTruth.taskId !== taskId
    || !ANCHOR.test(groundTruth.expectedSourceAnchorId)
    || !validRelativeFile(groundTruth.expectedRelativeFile)) {
    throw codeError("GROUND_TRUTH_INVALID");
  }
}

function validateTrial(
  trial: PilotTrialRecord,
  definition: PilotTaskDefinition,
  timingBoundaryHash: string,
): void {
  requireExactKeys(trial, [
    "schemaVersion",
    "taskId",
    "timingBoundaryHash",
    "setupDurationNs",
    "arms",
  ], "TRIAL_RECORD_INVALID");
  if (trial.schemaVersion !== "P0-T17A-trial-record-v1"
    || trial.taskId !== definition.taskId
    || trial.timingBoundaryHash !== timingBoundaryHash
    || !DECIMAL_NS.test(trial.setupDurationNs)
    || !Array.isArray(trial.arms)
    || trial.arms.length !== 2) {
    if (trial.timingBoundaryHash !== timingBoundaryHash) throw codeError("TIMING_BOUNDARY_MISMATCH");
    throw codeError("TRIAL_RECORD_INVALID");
  }
  for (let index = 0; index < trial.arms.length; index += 1) {
    const arm = trial.arms[index];
    if (!arm) throw codeError("TRIAL_RECORD_INVALID");
    validateTrialArm(arm);
    if (arm.arm !== definition.armOrder[index] || arm.order !== index + 1) {
      throw codeError("ARM_ORDER_MISMATCH");
    }
  }
}

function validateTrialArm(arm: PilotTrialArmRecord): void {
  requireExactKeys(arm, [
    "arm",
    "order",
    "startedAtNs",
    "endedAtNs",
    "locatedSource",
    "directUnavailableReason",
    "degradedCandidates",
    "chosenCandidateRank",
    "targetChanged",
    "reselectionCount",
    "operatorCorrection",
  ], "TRIAL_RECORD_INVALID");
  if (!isPilotArm(arm.arm)
    || ![1, 2].includes(arm.order)
    || !DECIMAL_NS.test(arm.startedAtNs)
    || !DECIMAL_NS.test(arm.endedAtNs)
    || BigInt(arm.endedAtNs) < BigInt(arm.startedAtNs)
    || (arm.directUnavailableReason !== null
      && (!ID.test(arm.directUnavailableReason) || arm.directUnavailableReason.length > 128))
    || !Array.isArray(arm.degradedCandidates)
    || arm.degradedCandidates.length > MAX_CANDIDATES
    || (arm.chosenCandidateRank !== null
      && (!Number.isSafeInteger(arm.chosenCandidateRank) || arm.chosenCandidateRank < 1))
    || typeof arm.targetChanged !== "boolean"
    || !Number.isSafeInteger(arm.reselectionCount)
    || arm.reselectionCount < 0
    || arm.reselectionCount > 10
    || typeof arm.operatorCorrection !== "boolean") {
    throw codeError("TRIAL_RECORD_INVALID");
  }
  if (arm.locatedSource !== null) validateLocatedSource(arm.locatedSource);
  for (const candidate of arm.degradedCandidates) validateLocatedSource(candidate);
}

function validateLocatedSource(source: PilotLocatedSource): void {
  requireExactKeys(source, ["sourceAnchorId", "relativeFile"], "TRIAL_RECORD_INVALID");
  if (!ANCHOR.test(source.sourceAnchorId) || !validRelativeFile(source.relativeFile)) {
    throw codeError("TRIAL_RECORD_INVALID");
  }
}

function validateCrossInput(
  definition: PilotTaskDefinition,
  selection: PilotSelectionInput,
  registry: PilotRegistryInput,
  groundTruth: PilotGroundTruth,
): void {
  const selectionRevision = selection.summary.revision;
  const registryRevision = registry.revision;
  if (selectionRevision.projectInstanceId !== registryRevision.projectInstanceId
    || selectionRevision.buildRevision !== registryRevision.buildRevision
    || selectionRevision.sourceRegistryRevision !== registryRevision.sourceRegistryRevision
    || selectionRevision.coordinatorSequence < registryRevision.coordinatorSequence
    || groundTruth.taskId !== definition.taskId) {
    throw codeError("CROSS_INPUT_REVISION_MISMATCH");
  }
}

function validateArmBalance(tasks: PilotTaskDefinition[]): void {
  const directFirst = tasks.filter((task) => task.armOrder[0] === "direct-search").length;
  const vemFirst = tasks.length - directFirst;
  if (Math.abs(directFirst - vemFirst) > 1) throw codeError("ARM_ORDER_NOT_COUNTERBALANCED");
}

function validateChosenCandidate(trial: PilotTrialArmRecord): void {
  if (trial.chosenCandidateRank === null) {
    if (trial.locatedSource !== null) throw codeError("CHOSEN_CANDIDATE_INVALID");
    return;
  }
  if (trial.chosenCandidateRank > trial.degradedCandidates.length) throw codeError("CHOSEN_CANDIDATE_INVALID");
  const chosen = trial.degradedCandidates[trial.chosenCandidateRank - 1];
  if (!chosen || trial.locatedSource === null || !sameSource(chosen, trial.locatedSource)) {
    throw codeError("CHOSEN_CANDIDATE_INVALID");
  }
}

function validateBundleTask(task: CanonicalPilotTaskEvidence): void {
  requireExactKeys(task, [
    "taskId",
    "promptHash",
    "fixtureCommit",
    "sourceRegistryRevision",
    "selectionSnapshotHash",
    "groundTruthHash",
    "selectionInputHash",
    "sourceRegistryInputHash",
    "trialInputHash",
    "armOrder",
    "rawRecords",
  ], "EVIDENCE_BUNDLE_INVALID");
  if (!ID.test(task.taskId)
    || !SHA256.test(task.promptHash)
    || !GIT_COMMIT.test(task.fixtureCommit)
    || !ID.test(task.sourceRegistryRevision)
    || !SHA256.test(task.selectionSnapshotHash)
    || !SHA256.test(task.groundTruthHash)
    || !SHA256.test(task.selectionInputHash)
    || !SHA256.test(task.sourceRegistryInputHash)
    || !SHA256.test(task.trialInputHash)
    || task.rawRecords.length !== 2
    || task.rawRecords.some(({ rawRecordHash, record }) => (
      !SHA256.test(rawRecordHash)
      || canonicalSha256(record) !== rawRecordHash
      || record.taskId !== task.taskId
    ))) {
    throw codeError("EVIDENCE_BUNDLE_INVALID");
  }
  const recordArms = task.rawRecords.map(({ record }) => record.arm);
  if (new Set(task.armOrder).size !== 2
    || new Set(recordArms).size !== 2
    || task.rawRecords.some(({ record }, index) => (
      record.arm !== task.armOrder[index] || record.armOrder !== index + 1
    ))) {
    throw codeError("EVIDENCE_BUNDLE_INVALID");
  }
}

function validateFileReference(reference: PilotFileReference): void {
  requireExactKeys(reference, ["path", "sha256"], "INPUT_REFERENCE_INVALID");
  validateRelativePath(reference.path);
  if (!SHA256.test(reference.sha256)) throw codeError("INPUT_REFERENCE_INVALID");
}

function validateRelativePath(value: string): void {
  if (typeof value !== "string"
    || value.length === 0
    || value.length > 512
    || isAbsolute(value)
    || value.includes("\\")
    || value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw codeError("INPUT_PATH_INVALID");
  }
}

function validRelativeFile(value: string): boolean {
  return RELATIVE_FILE.test(value)
    && !value.includes("\\")
    && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function requireWithinRoot(root: string, target: string): void {
  const pathFromRoot = relative(root, target);
  if (pathFromRoot === "" || pathFromRoot === ".") return;
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw codeError("INPUT_PATH_INVALID");
  }
}

function assertNoSymlinkComponents(root: string, relativePath: string): void {
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (isMissing(error)) throw codeError("INPUT_MISSING");
      throw error;
    }
    if (stat.isSymbolicLink()) throw codeError("INPUT_SYMLINK_REJECTED");
  }
}

function readBounded(absolutePath: string): Uint8Array {
  const stat = lstatSync(absolutePath);
  if (stat.size > MAX_INPUT_BYTES) throw codeError("INPUT_SIZE_EXCEEDED");
  const flags = process.platform === "linux"
    ? lstatReadOnlyFlags()
    : openReadOnlyFlags();
  const descriptor = openSync(absolutePath, flags);
  try {
    const body = readFileSync(descriptor);
    if (body.byteLength > MAX_INPUT_BYTES) throw codeError("INPUT_SIZE_EXCEEDED");
    return body;
  } finally {
    closeSync(descriptor);
  }
}

function openReadOnlyFlags(): number {
  return 0;
}

function lstatReadOnlyFlags(): number {
  return constants.O_RDONLY | constants.O_NOFOLLOW;
}

function parseJson<T>(body: Uint8Array): T {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as T;
  } catch {
    throw codeError("INPUT_JSON_INVALID");
  }
}

function sourceMatches(source: PilotLocatedSource, truth: PilotGroundTruth): boolean {
  return source.sourceAnchorId === truth.expectedSourceAnchorId
    && source.relativeFile === truth.expectedRelativeFile;
}

function sameSource(left: PilotLocatedSource, right: PilotLocatedSource): boolean {
  return left.sourceAnchorId === right.sourceAnchorId && left.relativeFile === right.relativeFile;
}

function sourceIdentityHash(source: PilotLocatedSource): string {
  return canonicalSha256({
    namespace: "vem-pilot-source-identity-v1",
    sourceAnchorId: source.sourceAnchorId,
    relativeFile: source.relativeFile,
  });
}

function isPilotArm(value: string): value is PilotArm {
  return value === "direct-search" || value === "vem-assisted";
}

function requireExactKeys(value: object, keys: readonly string[], code: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw codeError(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw codeError(code);
  }
}

function requireAllowedKeys(
  value: object,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  code: string,
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw codeError(code);
  const actual = new Set(Object.keys(value));
  const allowed = new Set(allowedKeys);
  if ([...actual].some((key) => !allowed.has(key))
    || requiredKeys.some((key) => !actual.has(key))) {
    throw codeError(code);
  }
}

function defaultReadFixtureCommit(fixtureRoot: string): string {
  try {
    return execFileSync("git", ["-C", fixtureRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      maxBuffer: 4_096,
    });
  } catch {
    throw codeError("FIXTURE_COMMIT_UNAVAILABLE");
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "ENOENT";
}

function codeError(code: string): Error {
  return new Error(code);
}
