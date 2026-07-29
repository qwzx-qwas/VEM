import type { ProjectRevisionContext } from "@vem/protocol";
import type { PrivateSourceRegistrySnapshot, SourceAnchorRecord } from "@vem/vite-plugin";

export const P0_TRANSFORM_COMPATIBILITY = Object.freeze({
  anchorNamespace: "vem-source-anchor-v1",
  transformVersion: "1",
  markerPrefix: "vem1_",
  parser: "oxc-parser@0.142.0",
  matrix: "node24.18-vite8.1-react19.2-plugin-react6.0-typescript6.0",
} as const);

export interface SourceTransformCompatibility {
  anchorNamespace: "vem-source-anchor-v1";
  transformVersion: "1";
  markerPrefix: "vem1_";
  parser: "oxc-parser@0.142.0";
  matrix: "node24.18-vite8.1-react19.2-plugin-react6.0-typescript6.0";
}

export interface SourceRegistryPublication {
  schemaVersion: "P0-T16-source-registry-publication-v1";
  revision: ProjectRevisionContext;
  transform: SourceTransformCompatibility;
  snapshot: PrivateSourceRegistrySnapshot;
  publishedAt: string;
}

export type RegistryErrorCode =
  | "ANCHOR_NOT_FOUND"
  | "LOOKUP_INVALID"
  | "PROJECT_INSTANCE_MISMATCH"
  | "PUBLICATION_INVALID"
  | "PUBLICATION_LIMIT_EXCEEDED"
  | "REGISTRY_NOT_PUBLISHED"
  | "REVISION_COLLISION"
  | "STALE_PROJECT"
  | "STALE_REVISION"
  | "STALE_SEQUENCE"
  | "TRANSFORM_INCOMPATIBLE";

export interface RegistryError {
  code: RegistryErrorCode;
  message: string;
  retryable: boolean;
  currentSourceRegistryRevision?: string;
}

export interface PublishResult {
  ok: true;
  status: "published" | "idempotent";
  publicationDigest: string;
  revision: ProjectRevisionContext;
  recordCount: number;
}

export interface LookupRequest {
  revision: ProjectRevisionContext;
  sourceAnchorId: string;
}

export interface DirectSourceAnchor {
  sourceAnchorId: string;
  sourceRegistryRevision: string;
  normalizedRelativeFileIdentity: string;
  relativeFile: string;
  line: number;
  column: number;
  intrinsicTag: string;
  enclosingComponent: string;
}

export type LookupResult =
  | {
      ok: true;
      status: "direct";
      integrity: "registry-matched";
      freshness: "current";
      source: DirectSourceAnchor;
      evidenceHash: string;
      publicationDigest: string;
      candidates: readonly [];
      conflicts: readonly [];
    }
  | { ok: false; status: "error"; error: RegistryError };

export interface RegistryDiagnosticState {
  projectInstanceId: string;
  currentSourceRegistryRevision?: string;
  previousSourceRegistryRevision?: string;
  retainedRevisionCount: 0 | 1 | 2;
  persistence: "memory-only";
  transport: "not-implemented";
  sourceReads: "not-implemented";
  reattachment: "not-implemented";
}

export interface ValidatedPublication {
  publication: SourceRegistryPublication;
  records: readonly SourceAnchorRecord[];
  publicationDigest: string;
}
