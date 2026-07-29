import type { InjectedSelectionSummary } from "@vem/injected-selector";
import type { SourceRegistryPublication } from "@vem/source-registry";

export type PilotArm = "direct-search" | "vem-assisted";

export interface PilotFileReference {
  path: string;
  sha256: string;
}

export interface PilotTimingBoundary {
  clock: "monotonic";
  unit: "nanoseconds";
  startEvent: "prompt-displayed";
  endEvent: "source-located";
  cachePolicy: "cold" | "warm";
}

export interface PilotTaskDefinition {
  taskId: string;
  promptHash: string;
  fixtureRoot: string;
  fixtureCommit: string;
  selectionInput: PilotFileReference;
  sourceRegistryInput: PilotFileReference;
  groundTruthHash: string;
  armOrder: [PilotArm, PilotArm];
}

export interface PilotTaskManifest {
  schemaVersion: "P0-T17A-task-manifest-v1";
  pilotPlanVersion: string;
  harnessVersion: "1.0.0";
  hashNamespace: "vem-pilot-v1-sha256";
  taskManifestVersion: string;
  timingBoundary: PilotTimingBoundary;
  setupCostBoundary: {
    separatelyReported: true;
    includes: "fixture-and-registry-setup-only";
    excludes: "per-task-location-time";
  };
  laterHoldoutExclusion: PilotFileReference;
  allowedOperations: ["read", "hash", "validate", "rank", "evaluate"];
  tasks: PilotTaskDefinition[];
}

export interface PilotSelectionInput {
  schemaVersion: "P0-T17A-selection-input-v1";
  selectionSnapshotHash: string;
  claimedSourceAnchorId: string | null;
  summary: InjectedSelectionSummary;
}

export interface PilotGroundTruth {
  schemaVersion: "P0-T17A-ground-truth-v1";
  taskId: string;
  expectedSourceAnchorId: string;
  expectedRelativeFile: string;
}

export interface PilotHoldoutExclusion {
  schemaVersion: "P0-T17A-later-holdout-exclusion-v1";
  taskIds: string[];
}

export interface PilotLocatedSource {
  sourceAnchorId: string;
  relativeFile: string;
}

export interface PilotTrialArmRecord {
  arm: PilotArm;
  order: 1 | 2;
  startedAtNs: string;
  endedAtNs: string;
  locatedSource: PilotLocatedSource | null;
  directUnavailableReason: string | null;
  degradedCandidates: PilotLocatedSource[];
  chosenCandidateRank: number | null;
  targetChanged: boolean;
  reselectionCount: number;
  operatorCorrection: boolean;
}

export interface PilotTrialRecord {
  schemaVersion: "P0-T17A-trial-record-v1";
  taskId: string;
  timingBoundaryHash: string;
  setupDurationNs: string;
  arms: [PilotTrialArmRecord, PilotTrialArmRecord];
}

export interface PilotBuildRequest {
  taskManifest: PilotFileReference;
  groundTruthRecords: Array<{
    taskId: string;
    input: PilotFileReference;
  }>;
  trialRecords: Array<{
    taskId: string;
    input: PilotFileReference;
  }>;
}

export interface PilotRawRecord {
  schemaVersion: "P0-T17A-raw-record-v1";
  pilotPlanVersion: string;
  harnessVersion: "1.0.0";
  hashNamespace: "vem-pilot-v1-sha256";
  taskManifestHash: string;
  taskId: string;
  arm: PilotArm;
  armOrder: 1 | 2;
  fixtureCommit: string;
  sourceRegistryRevision: string;
  selectionSnapshotHash: string;
  timingBoundaryHash: string;
  groundTruthHash: string;
  selectionInputHash: string;
  sourceRegistryInputHash: string;
  trialInputHash: string;
  setupDurationNs: string;
  locateDurationNs: string;
  locatedSourceIdentityHash: string | null;
  directPrimaryAvailable: boolean | null;
  directPrimaryMatch: boolean | null;
  directUnavailableReason: string | null;
  degradedTop1Match: boolean | null;
  degradedTop3Match: boolean | null;
  chosenCandidateRank: number | null;
  wrongAttribution: boolean;
  targetChanged: boolean;
  reselectionCount: number;
  operatorCorrection: boolean;
}

export interface CanonicalPilotTaskEvidence {
  taskId: string;
  promptHash: string;
  fixtureCommit: string;
  sourceRegistryRevision: string;
  selectionSnapshotHash: string;
  groundTruthHash: string;
  selectionInputHash: string;
  sourceRegistryInputHash: string;
  trialInputHash: string;
  armOrder: [PilotArm, PilotArm];
  rawRecords: Array<{
    rawRecordHash: string;
    record: PilotRawRecord;
  }>;
}

export interface CanonicalPilotEvidenceBundle {
  schemaVersion: "P0-T17A-canonical-evidence-bundle-v1";
  pilotPlanVersion: string;
  harnessVersion: "1.0.0";
  hashNamespace: "vem-pilot-v1-sha256";
  taskManifestVersion: string;
  taskManifestHash: string;
  timingBoundary: PilotTimingBoundary;
  timingBoundaryHash: string;
  setupCostBoundary: PilotTaskManifest["setupCostBoundary"];
  laterHoldoutExclusionHash: string;
  taskCount: number;
  tasks: CanonicalPilotTaskEvidence[];
  limitations: [
    "ENGINEERING_SMOKE_ONLY",
    "NO_STATISTICAL_PRODUCT_CLAIM",
    "NO_P0_VALUE_VERDICT",
  ];
}

export interface PilotSchemaValidation {
  valid: true;
  schemaId: "https://vem.local/schemas/p0-t17a/evidence-bundle-v1";
}

export interface PilotBuildResult {
  bundle: CanonicalPilotEvidenceBundle;
  canonicalJson: string;
  contentHash: string;
  schemaValidation: PilotSchemaValidation;
  summary: string;
}

export interface PilotHarnessOptions {
  rootDir: string;
  readFixtureCommit?: (fixtureRoot: string) => string;
}

export type PilotRegistryInput = SourceRegistryPublication;
