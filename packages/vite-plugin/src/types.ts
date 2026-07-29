import type { Plugin } from "vite";

export const SOURCE_ANCHOR_ATTRIBUTE = "data-vem-source-anchor";
export const SOURCE_ANCHOR_NAMESPACE = "vem-source-anchor-v1";
export const SOURCE_ANCHOR_PREFIX = "vem1_";
export const SOURCE_TRANSFORM_VERSION = "1";

export type SourceAnchorErrorCode =
  | "ANCHOR_HASH_COLLISION"
  | "ANCHOR_LIMIT_EXCEEDED"
  | "PARSER_ERROR"
  | "REGISTRY_SIZE_EXCEEDED"
  | "RESERVED_ATTRIBUTE_CONFLICT"
  | "SOURCE_REGISTRY_REVISION_INVALID";

export class SourceAnchorError extends Error {
  readonly code: SourceAnchorErrorCode;

  constructor(code: SourceAnchorErrorCode) {
    super(safeSourceAnchorErrorMessage(code));
    this.name = "SourceAnchorError";
    this.code = code;
  }
}

export function safeSourceAnchorErrorMessage(code: SourceAnchorErrorCode): string {
  const messages: Record<SourceAnchorErrorCode, string> = {
    ANCHOR_HASH_COLLISION: "Two distinct source identities produced the same opaque anchor.",
    ANCHOR_LIMIT_EXCEEDED: "The source file contains too many intrinsic JSX anchors.",
    PARSER_ERROR: "The supported JSX parser could not transform this source file.",
    REGISTRY_SIZE_EXCEEDED: "The private source registry exceeds its hard size limit.",
    RESERVED_ATTRIBUTE_CONFLICT: "A source element already declares the reserved VEM anchor attribute.",
    SOURCE_REGISTRY_REVISION_INVALID: "The source registry revision is invalid.",
  };
  return messages[code];
}

export interface SourceAnchorCanonicalIdentity {
  namespace: typeof SOURCE_ANCHOR_NAMESPACE;
  relativeFile: string;
  enclosingComponent: string;
  jsxAstPath: string;
  intrinsicTag: string;
  transformVersion: typeof SOURCE_TRANSFORM_VERSION;
}

export interface SourceAnchorRecord {
  schemaVersion: "P0-T15-source-registry-v1";
  transformVersion: typeof SOURCE_TRANSFORM_VERSION;
  sourceRegistryRevision: string;
  sourceAnchorId: string;
  relativeFile: string;
  enclosingComponent: string;
  jsxAstPath: string;
  intrinsicTag: string;
  line: number;
  column: number;
}

export interface PrivateSourceRegistrySnapshot {
  schemaVersion: "P0-T15-private-registry-v1";
  sourceRegistryRevision: string;
  records: readonly SourceAnchorRecord[];
  persistence: "memory-only";
  publication: "not-implemented";
  lookup: "not-implemented";
}

export interface SourceAnchorSourceMap {
  version: number;
  mappings: string;
  names: string[];
  sources: string[];
  sourcesContent?: Array<string | null>;
}

export interface SourceAnchorTransformResult {
  code: string;
  map: SourceAnchorSourceMap;
  records: readonly SourceAnchorRecord[];
}

export interface VemSourceAnchorOptions {
  projectRoot: string;
  sourceRegistryRevision: string;
  maxAnchorsPerFile?: number;
}

export interface VemSourceAnchorPlugin extends Plugin {
  readonly name: "vem:source-anchor";
  readonly apply: "serve";
  readonly enforce: "pre";
  getPrivateRegistrySnapshot(): PrivateSourceRegistrySnapshot;
}
