import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { canonicalIdentityKey, deepFreezeRecord, transformIntrinsicJsx } from "./anchor.js";
import {
  SourceAnchorError,
  type PrivateSourceRegistrySnapshot,
  type SourceAnchorRecord,
  type VemSourceAnchorOptions,
  type VemSourceAnchorPlugin,
} from "./types.js";

const MAX_PROJECT_ANCHORS = 16_384;
const MAX_PRIVATE_REGISTRY_BYTES = 1_048_576;
const REVISION = /^[A-Za-z0-9._:-]{1,128}$/u;

export function vemSourceAnchor(options: VemSourceAnchorOptions): VemSourceAnchorPlugin {
  if (!REVISION.test(options.sourceRegistryRevision)) {
    throw new SourceAnchorError("SOURCE_REGISTRY_REVISION_INVALID");
  }
  const root = realpathSync(options.projectRoot);
  const registry = new PrivateInMemoryRegistry(options.sourceRegistryRevision);
  return {
    name: "vem:source-anchor",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      const scoped = scopedSourceFile(root, id);
      if (!scoped) return null;
      const transformed = transformIntrinsicJsx({
        code,
        filename: scoped.absoluteFile,
        relativeFile: scoped.relativeFile,
        sourceRegistryRevision: options.sourceRegistryRevision,
        ...(options.maxAnchorsPerFile === undefined ? {} : { maxAnchorsPerFile: options.maxAnchorsPerFile }),
      });
      registry.replaceFile(scoped.relativeFile, transformed.records);
      return { code: transformed.code, map: transformed.map };
    },
    getPrivateRegistrySnapshot() {
      return registry.snapshot();
    },
  };
}

export class PrivateInMemoryRegistry {
  readonly #sourceRegistryRevision: string;
  readonly #recordsByFile = new Map<string, readonly SourceAnchorRecord[]>();

  constructor(sourceRegistryRevision: string) {
    if (!REVISION.test(sourceRegistryRevision)) throw new SourceAnchorError("SOURCE_REGISTRY_REVISION_INVALID");
    this.#sourceRegistryRevision = sourceRegistryRevision;
  }

  replaceFile(relativeFile: string, records: readonly SourceAnchorRecord[]): void {
    for (const record of records) {
      if (record.sourceRegistryRevision !== this.#sourceRegistryRevision) {
        throw new SourceAnchorError("SOURCE_REGISTRY_REVISION_INVALID");
      }
      if (record.relativeFile !== relativeFile) throw new SourceAnchorError("PARSER_ERROR");
    }
    const proposedRecords = [...this.#recordsByFile.entries()]
      .filter(([file]) => file !== relativeFile)
      .flatMap(([, existing]) => existing)
      .concat(records);
    if (proposedRecords.length > MAX_PROJECT_ANCHORS) throw new SourceAnchorError("ANCHOR_LIMIT_EXCEEDED");
    if (new TextEncoder().encode(JSON.stringify(proposedRecords)).byteLength > MAX_PRIVATE_REGISTRY_BYTES) {
      throw new SourceAnchorError("REGISTRY_SIZE_EXCEEDED");
    }

    const identityByAnchor = new Map<string, string>();
    addCollisionChecked(identityByAnchor, proposedRecords);
    this.#recordsByFile.set(relativeFile, Object.freeze(records.map((record) => deepFreezeRecord(record))));
  }

  snapshot(): PrivateSourceRegistrySnapshot {
    const records = [...this.#recordsByFile.values()]
      .flat()
      .sort((left, right) => left.relativeFile.localeCompare(right.relativeFile)
        || left.jsxAstPath.localeCompare(right.jsxAstPath)
        || left.sourceAnchorId.localeCompare(right.sourceAnchorId));
    const frozenRecords = Object.freeze(records.map((record) => deepFreezeRecord(record)));
    return Object.freeze({
      schemaVersion: "P0-T15-private-registry-v1",
      sourceRegistryRevision: this.#sourceRegistryRevision,
      records: frozenRecords,
      persistence: "memory-only",
      publication: "not-implemented",
      lookup: "not-implemented",
    });
  }
}

function addCollisionChecked(target: Map<string, string>, records: readonly SourceAnchorRecord[]): void {
  for (const record of records) {
    const identity = canonicalIdentityKey(record);
    const previous = target.get(record.sourceAnchorId);
    if (previous !== undefined && previous !== identity) throw new SourceAnchorError("ANCHOR_HASH_COLLISION");
    target.set(record.sourceAnchorId, identity);
  }
}

function scopedSourceFile(
  root: string,
  id: string,
): { absoluteFile: string; relativeFile: string } | undefined {
  if (id.startsWith("\0") || id.includes("?") || id.includes("node_modules")) return undefined;
  if (!id.endsWith(".jsx") && !id.endsWith(".tsx")) return undefined;
  let absoluteFile: string;
  try {
    absoluteFile = realpathSync(id);
  } catch {
    return undefined;
  }
  const relativeFile = relative(root, absoluteFile);
  if (!relativeFile || relativeFile === ".." || relativeFile.startsWith(`..${sep}`) || isAbsolute(relativeFile)) {
    return undefined;
  }
  const normalized = relativeFile.split(sep).join("/");
  if (normalized.split("/").includes("node_modules")) return undefined;
  return { absoluteFile, relativeFile: normalized };
}
