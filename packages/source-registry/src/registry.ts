import { createHash } from "node:crypto";
import type { ProjectRevisionContext } from "@vem/protocol";
import type { SourceAnchorRecord } from "@vem/vite-plugin";
import {
  P0_TRANSFORM_COMPATIBILITY,
  type LookupRequest,
  type LookupResult,
  type PublishResult,
  type RegistryDiagnosticState,
  type RegistryError,
  type RegistryErrorCode,
  type SourceRegistryPublication,
  type ValidatedPublication,
} from "./types.js";

const MAX_PUBLICATION_BYTES = 1_572_864;
const MAX_RECORDS = 16_384;
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const ANCHOR_ID = /^vem1_[a-f0-9]{32}$/u;
const RELATIVE_FILE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._~/-]{1,512}$/u;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

export class RevisionScopedSourceRegistry {
  #projectInstanceId: string;
  #current: ValidatedPublication | undefined;
  #previous: ValidatedPublication | undefined;

  constructor(projectInstanceId: string) {
    if (!ID.test(projectInstanceId)) throw new Error("PROJECT_INSTANCE_ID_INVALID");
    this.#projectInstanceId = projectInstanceId;
  }

  publish(input: SourceRegistryPublication): PublishResult | { ok: false; error: RegistryError } {
    let proposed: ValidatedPublication;
    try {
      proposed = validatePublication(input);
    } catch (error) {
      return { ok: false, error: registryError(errorCode(error), this.#current?.publication.revision.sourceRegistryRevision) };
    }
    if (proposed.publication.revision.projectInstanceId !== this.#projectInstanceId) {
      return { ok: false, error: registryError("PROJECT_INSTANCE_MISMATCH", this.#current?.publication.revision.sourceRegistryRevision) };
    }
    const current = this.#current;
    if (current?.publication.revision.sourceRegistryRevision === proposed.publication.revision.sourceRegistryRevision) {
      if (current.publicationDigest !== proposed.publicationDigest) {
        return { ok: false, error: registryError("REVISION_COLLISION", current.publication.revision.sourceRegistryRevision) };
      }
      return publishSuccess("idempotent", current);
    }
    if (current && proposed.publication.revision.coordinatorSequence <= current.publication.revision.coordinatorSequence) {
      return { ok: false, error: registryError("STALE_SEQUENCE", current.publication.revision.sourceRegistryRevision) };
    }
    this.#previous = current;
    this.#current = proposed;
    return publishSuccess("published", proposed);
  }

  lookup(request: LookupRequest): LookupResult {
    const current = this.#current;
    if (!current) return lookupFailure("REGISTRY_NOT_PUBLISHED");
    const currentRevision = current.publication.revision;
    if (request.revision.projectInstanceId !== this.#projectInstanceId) {
      return lookupFailure("STALE_PROJECT", currentRevision.sourceRegistryRevision);
    }
    if (request.revision.sourceRegistryRevision !== currentRevision.sourceRegistryRevision
      || request.revision.buildRevision !== currentRevision.buildRevision) {
      return lookupFailure("STALE_REVISION", currentRevision.sourceRegistryRevision);
    }
    if (request.revision.coordinatorSequence < currentRevision.coordinatorSequence) {
      return lookupFailure("STALE_SEQUENCE", currentRevision.sourceRegistryRevision);
    }
    const record = current.records.find((candidate) => candidate.sourceAnchorId === request.sourceAnchorId);
    if (!record) return lookupFailure("ANCHOR_NOT_FOUND", currentRevision.sourceRegistryRevision);
    const fileIdentity = opaqueRelativeFileIdentity(currentRevision, record.relativeFile);
    const evidenceHash = sha256({
      namespace: "vem-registry-membership-evidence-v1",
      publicationDigest: current.publicationDigest,
      sourceAnchorId: record.sourceAnchorId,
      sourceRegistryRevision: currentRevision.sourceRegistryRevision,
      normalizedRelativeFileIdentity: fileIdentity,
      relativeFile: record.relativeFile,
      line: record.line,
      column: record.column,
    });
    return {
      ok: true,
      status: "direct",
      integrity: "registry-matched",
      freshness: "current",
      source: Object.freeze({
        sourceAnchorId: record.sourceAnchorId,
        sourceRegistryRevision: currentRevision.sourceRegistryRevision,
        normalizedRelativeFileIdentity: fileIdentity,
        relativeFile: record.relativeFile,
        line: record.line,
        column: record.column,
        intrinsicTag: record.intrinsicTag,
        enclosingComponent: record.enclosingComponent,
      }),
      evidenceHash,
      publicationDigest: current.publicationDigest,
      candidates: [],
      conflicts: [],
    };
  }

  resetProject(projectInstanceId: string): void {
    if (!ID.test(projectInstanceId)) throw new Error("PROJECT_INSTANCE_ID_INVALID");
    this.#projectInstanceId = projectInstanceId;
    this.#current = undefined;
    this.#previous = undefined;
  }

  diagnosticState(): RegistryDiagnosticState {
    const retained = this.#current ? (this.#previous ? 2 : 1) : 0;
    return Object.freeze({
      projectInstanceId: this.#projectInstanceId,
      ...(this.#current
        ? { currentSourceRegistryRevision: this.#current.publication.revision.sourceRegistryRevision }
        : {}),
      ...(this.#previous
        ? { previousSourceRegistryRevision: this.#previous.publication.revision.sourceRegistryRevision }
        : {}),
      retainedRevisionCount: retained,
      persistence: "memory-only",
      transport: "not-implemented",
      sourceReads: "not-implemented",
      reattachment: "not-implemented",
    });
  }
}

export function validatePublication(input: SourceRegistryPublication): ValidatedPublication {
  requireExactKeys(input, ["schemaVersion", "revision", "transform", "snapshot", "publishedAt"]);
  if (input.schemaVersion !== "P0-T16-source-registry-publication-v1") throw codeError("PUBLICATION_INVALID");
  validateRevision(input.revision);
  validateCompatibility(input.transform);
  if (!ISO_WITH_OFFSET.test(input.publishedAt) || !Number.isFinite(Date.parse(input.publishedAt))) {
    throw codeError("PUBLICATION_INVALID");
  }
  requireExactKeys(input.snapshot, [
    "schemaVersion",
    "sourceRegistryRevision",
    "records",
    "persistence",
    "publication",
    "lookup",
  ]);
  if (input.snapshot.schemaVersion !== "P0-T15-private-registry-v1"
    || input.snapshot.persistence !== "memory-only"
    || input.snapshot.publication !== "not-implemented"
    || input.snapshot.lookup !== "not-implemented"
    || input.snapshot.sourceRegistryRevision !== input.revision.sourceRegistryRevision) {
    throw codeError("PUBLICATION_INVALID");
  }
  if (input.snapshot.records.length > MAX_RECORDS) throw codeError("PUBLICATION_LIMIT_EXCEEDED");
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_PUBLICATION_BYTES) {
    throw codeError("PUBLICATION_LIMIT_EXCEEDED");
  }

  const records = input.snapshot.records.map((record) => validateRecord(record, input.revision.sourceRegistryRevision));
  records.sort((left, right) => left.sourceAnchorId.localeCompare(right.sourceAnchorId));
  const anchorIds = new Set<string>();
  const fileIdentityOwners = new Map<string, string>();
  for (const record of records) {
    if (anchorIds.has(record.sourceAnchorId)) throw codeError("REVISION_COLLISION");
    anchorIds.add(record.sourceAnchorId);
    const fileIdentity = opaqueRelativeFileIdentity(input.revision, record.relativeFile);
    const owner = fileIdentityOwners.get(fileIdentity);
    if (owner !== undefined && owner !== record.relativeFile) throw codeError("REVISION_COLLISION");
    fileIdentityOwners.set(fileIdentity, record.relativeFile);
  }
  const publicationDigest = sha256({
    namespace: "vem-source-registry-publication-v1",
    projectInstanceId: input.revision.projectInstanceId,
    buildRevision: input.revision.buildRevision,
    sourceRegistryRevision: input.revision.sourceRegistryRevision,
    transform: P0_TRANSFORM_COMPATIBILITY,
    records,
  });
  const publication = deepFreezePublication(input, records);
  return Object.freeze({ publication, records: publication.snapshot.records, publicationDigest });
}

export function opaqueRelativeFileIdentity(revision: ProjectRevisionContext, relativeFile: string): string {
  return `vemfile1_${sha256({
    namespace: "vem-relative-file-identity-v1",
    projectInstanceId: revision.projectInstanceId,
    sourceRegistryRevision: revision.sourceRegistryRevision,
    relativeFile,
  }).slice(0, 32)}`;
}

function validateRevision(revision: ProjectRevisionContext): void {
  requireExactKeys(revision, ["projectInstanceId", "coordinatorSequence", "buildRevision", "sourceRegistryRevision"]);
  if (!ID.test(revision.projectInstanceId)
    || !ID.test(revision.buildRevision)
    || !ID.test(revision.sourceRegistryRevision)
    || !Number.isSafeInteger(revision.coordinatorSequence)
    || revision.coordinatorSequence < 0) {
    throw codeError("PUBLICATION_INVALID");
  }
}

function validateCompatibility(value: SourceRegistryPublication["transform"]): void {
  requireExactKeys(value, ["anchorNamespace", "transformVersion", "markerPrefix", "parser", "matrix"]);
  if (value.anchorNamespace !== P0_TRANSFORM_COMPATIBILITY.anchorNamespace
    || value.transformVersion !== P0_TRANSFORM_COMPATIBILITY.transformVersion
    || value.markerPrefix !== P0_TRANSFORM_COMPATIBILITY.markerPrefix
    || value.parser !== P0_TRANSFORM_COMPATIBILITY.parser
    || value.matrix !== P0_TRANSFORM_COMPATIBILITY.matrix) {
    throw codeError("TRANSFORM_INCOMPATIBLE");
  }
}

function validateRecord(record: SourceAnchorRecord, revision: string): SourceAnchorRecord {
  requireExactKeys(record, [
    "schemaVersion",
    "transformVersion",
    "sourceRegistryRevision",
    "sourceAnchorId",
    "relativeFile",
    "enclosingComponent",
    "jsxAstPath",
    "intrinsicTag",
    "line",
    "column",
  ]);
  if (record.schemaVersion !== "P0-T15-source-registry-v1"
    || record.transformVersion !== "1"
    || record.sourceRegistryRevision !== revision
    || !ANCHOR_ID.test(record.sourceAnchorId)
    || !RELATIVE_FILE.test(record.relativeFile)
    || record.relativeFile.includes("\\")
    || record.enclosingComponent.length < 1
    || record.enclosingComponent.length > 128
    || record.jsxAstPath.length < 1
    || record.jsxAstPath.length > 2_048
    || !/^[a-z][A-Za-z0-9._:-]{0,127}$/u.test(record.intrinsicTag)
    || !Number.isSafeInteger(record.line)
    || record.line < 1
    || !Number.isSafeInteger(record.column)
    || record.column < 1) {
    throw codeError("PUBLICATION_INVALID");
  }
  return Object.freeze({ ...record });
}

function deepFreezePublication(
  input: SourceRegistryPublication,
  records: readonly SourceAnchorRecord[],
): SourceRegistryPublication {
  const revision = Object.freeze({ ...input.revision });
  const transform = Object.freeze({ ...input.transform });
  const snapshot = Object.freeze({ ...input.snapshot, records: Object.freeze([...records]) });
  return Object.freeze({ ...input, revision, transform, snapshot });
}

function requireExactKeys(value: object, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw codeError("PUBLICATION_INVALID");
  }
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function codeError(code: RegistryErrorCode): Error & { code: RegistryErrorCode } {
  return Object.assign(new Error(code), { code });
}

function errorCode(error: unknown): RegistryErrorCode {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    const code = error.code as RegistryErrorCode;
    if (code in ERROR_MESSAGES) return code;
  }
  return "PUBLICATION_INVALID";
}

const ERROR_MESSAGES: Record<RegistryErrorCode, string> = {
  ANCHOR_NOT_FOUND: "The anchor is not a member of the current source registry.",
  PROJECT_INSTANCE_MISMATCH: "Reset the registry before publishing a different project instance.",
  PUBLICATION_INVALID: "The source registry publication is invalid.",
  PUBLICATION_LIMIT_EXCEEDED: "The source registry publication exceeds its hard limit.",
  REGISTRY_NOT_PUBLISHED: "No current source registry has been published.",
  REVISION_COLLISION: "The same registry identity was reused for different content.",
  STALE_PROJECT: "The lookup belongs to a stale project instance.",
  STALE_REVISION: "The lookup does not match the current build and source registry revision.",
  STALE_SEQUENCE: "The lookup or publication sequence predates the current registry.",
  TRANSFORM_INCOMPATIBLE: "The source transform compatibility namespace is unsupported.",
};

function registryError(code: RegistryErrorCode, current?: string): RegistryError {
  return Object.freeze({
    code,
    message: ERROR_MESSAGES[code],
    retryable: code !== "REVISION_COLLISION" && code !== "TRANSFORM_INCOMPATIBLE",
    ...(current === undefined ? {} : { currentSourceRegistryRevision: current }),
  });
}

function lookupFailure(code: RegistryErrorCode, current?: string): LookupResult {
  return { ok: false, status: "error", error: registryError(code, current) };
}

function publishSuccess(status: "published" | "idempotent", value: ValidatedPublication): PublishResult {
  return {
    ok: true,
    status,
    publicationDigest: value.publicationDigest,
    revision: Object.freeze({ ...value.publication.revision }),
    recordCount: value.records.length,
  };
}
