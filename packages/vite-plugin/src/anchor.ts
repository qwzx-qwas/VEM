import { createHash } from "node:crypto";
import MagicString from "magic-string";
import {
  parseSync,
  visitorKeys,
  type JSXAttribute,
  type JSXOpeningElement,
  type Node,
} from "oxc-parser";
import {
  SOURCE_ANCHOR_ATTRIBUTE,
  SOURCE_ANCHOR_NAMESPACE,
  SOURCE_ANCHOR_PREFIX,
  SOURCE_TRANSFORM_VERSION,
  SourceAnchorError,
  type SourceAnchorCanonicalIdentity,
  type SourceAnchorRecord,
  type SourceAnchorTransformResult,
} from "./types.js";

const MAX_SOURCE_BYTES = 1_048_576;
const DEFAULT_MAX_ANCHORS = 4_096;
const MAX_AST_PATH_CHARS = 2_048;
const RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._~/-]{1,512}$/u;
const REVISION = /^[A-Za-z0-9._:-]{1,128}$/u;
const INTRINSIC_TAG = /^[a-z][A-Za-z0-9._:-]{0,127}$/u;

export interface TransformIntrinsicJsxInput {
  code: string;
  filename: string;
  relativeFile: string;
  sourceRegistryRevision: string;
  maxAnchorsPerFile?: number;
}

interface PendingRecord {
  identityKey: string;
  record: SourceAnchorRecord;
  insertionOffset: number;
}

export function transformIntrinsicJsx(input: TransformIntrinsicJsxInput): SourceAnchorTransformResult {
  validateInput(input);
  const parsed = parseSync(input.filename, input.code, {
    lang: input.filename.endsWith(".tsx") ? "tsx" : "jsx",
    sourceType: "module",
    astType: "ts",
    preserveParens: true,
  });
  if (parsed.errors.length > 0) throw new SourceAnchorError("PARSER_ERROR");

  const maximum = input.maxAnchorsPerFile ?? DEFAULT_MAX_ANCHORS;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > DEFAULT_MAX_ANCHORS) {
    throw new SourceAnchorError("ANCHOR_LIMIT_EXCEEDED");
  }
  const lineStarts = sourceLineStarts(input.code);
  const pending: PendingRecord[] = [];
  walkAst(parsed.program, "Program", "module", (opening, astPath, component) => {
    const tag = intrinsicTag(opening);
    if (!tag) return;
    if (hasReservedAttribute(opening)) throw new SourceAnchorError("RESERVED_ATTRIBUTE_CONFLICT");
    if (pending.length >= maximum) throw new SourceAnchorError("ANCHOR_LIMIT_EXCEEDED");
    if (astPath.length > MAX_AST_PATH_CHARS) throw new SourceAnchorError("REGISTRY_SIZE_EXCEEDED");
    const identity: SourceAnchorCanonicalIdentity = {
      namespace: SOURCE_ANCHOR_NAMESPACE,
      relativeFile: input.relativeFile,
      enclosingComponent: component,
      jsxAstPath: astPath,
      intrinsicTag: tag,
      transformVersion: SOURCE_TRANSFORM_VERSION,
    };
    const identityKey = JSON.stringify(identity);
    const sourceAnchorId = sourceAnchorIdForIdentity(identity);
    const location = sourceLocation(lineStarts, opening.name.start);
    pending.push({
      identityKey,
      insertionOffset: insertionOffset(input.code, opening),
      record: {
        schemaVersion: "P0-T15-source-registry-v1",
        transformVersion: SOURCE_TRANSFORM_VERSION,
        sourceRegistryRevision: input.sourceRegistryRevision,
        sourceAnchorId,
        relativeFile: input.relativeFile,
        enclosingComponent: component,
        jsxAstPath: astPath,
        intrinsicTag: tag,
        line: location.line,
        column: location.column,
      },
    });
  });

  assertNoLocalCollisions(pending);
  const magic = new MagicString(input.code, { filename: input.relativeFile });
  for (const item of pending) {
    magic.appendLeft(item.insertionOffset, ` ${SOURCE_ANCHOR_ATTRIBUTE}="${item.record.sourceAnchorId}"`);
  }
  const generatedMap = magic.generateMap({ hires: true, includeContent: true, source: input.relativeFile });
  return {
    code: magic.toString(),
    map: {
      version: generatedMap.version,
      mappings: generatedMap.mappings,
      names: generatedMap.names,
      sources: generatedMap.sources,
      ...(generatedMap.sourcesContent === undefined
        ? {}
        : { sourcesContent: generatedMap.sourcesContent }),
    },
    records: Object.freeze(pending.map((item) => deepFreezeRecord(item.record))),
  };
}

export function sourceAnchorIdForIdentity(identity: SourceAnchorCanonicalIdentity): string {
  const digest = createHash("sha256").update(JSON.stringify(identity), "utf8").digest("hex").slice(0, 32);
  return `${SOURCE_ANCHOR_PREFIX}${digest}`;
}

export function canonicalIdentityKey(record: SourceAnchorRecord): string {
  return JSON.stringify({
    namespace: SOURCE_ANCHOR_NAMESPACE,
    relativeFile: record.relativeFile,
    enclosingComponent: record.enclosingComponent,
    jsxAstPath: record.jsxAstPath,
    intrinsicTag: record.intrinsicTag,
    transformVersion: record.transformVersion,
  } satisfies SourceAnchorCanonicalIdentity);
}

function validateInput(input: TransformIntrinsicJsxInput): void {
  if (!REVISION.test(input.sourceRegistryRevision)) throw new SourceAnchorError("SOURCE_REGISTRY_REVISION_INVALID");
  if (!RELATIVE_PATH.test(input.relativeFile.replaceAll("\\", "/"))) throw new SourceAnchorError("PARSER_ERROR");
  if (new TextEncoder().encode(input.code).byteLength > MAX_SOURCE_BYTES) throw new SourceAnchorError("PARSER_ERROR");
}

function intrinsicTag(opening: JSXOpeningElement): string | undefined {
  if (opening.name.type !== "JSXIdentifier") return undefined;
  return INTRINSIC_TAG.test(opening.name.name) ? opening.name.name.toLowerCase() : undefined;
}

function hasReservedAttribute(opening: JSXOpeningElement): boolean {
  return opening.attributes.some((attribute) => {
    if (attribute.type !== "JSXAttribute") return false;
    const jsxAttribute = attribute as JSXAttribute;
    return jsxAttribute.name.type === "JSXIdentifier" && jsxAttribute.name.name === SOURCE_ANCHOR_ATTRIBUTE;
  });
}

function insertionOffset(code: string, opening: JSXOpeningElement): number {
  const offset = opening.selfClosing ? opening.end - 2 : opening.end - 1;
  const suffix = code.slice(offset, opening.end);
  if (suffix !== (opening.selfClosing ? "/>" : ">")) throw new SourceAnchorError("PARSER_ERROR");
  return offset;
}

function walkAst(
  node: Node,
  path: string,
  component: string,
  onOpening: (node: JSXOpeningElement, path: string, component: string) => void,
): void {
  const nextComponent = enclosingComponent(node, component);
  if (node.type === "JSXOpeningElement") onOpening(node, path, nextComponent);
  for (const key of visitorKeys[node.type] ?? []) {
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        if (isNode(item)) walkAst(item, `${path}.${key}[${index}]`, nextComponent, onOpening);
      });
    } else if (isNode(child)) {
      walkAst(child, `${path}.${key}`, nextComponent, onOpening);
    }
  }
}

function enclosingComponent(node: Node, current: string): string {
  if (node.type === "FunctionDeclaration" && node.id?.name) return boundedComponent(node.id.name);
  if ((node.type === "ClassDeclaration" || node.type === "ClassExpression") && node.id?.name) {
    return boundedComponent(node.id.name);
  }
  if (node.type === "VariableDeclarator" && node.id.type === "Identifier") {
    const init = node.init;
    if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
      return boundedComponent(node.id.name);
    }
  }
  return current;
}

function boundedComponent(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/u.test(value) ? value : "module";
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

function sourceLineStarts(code: string): number[] {
  const starts = [0];
  for (let index = 0; index < code.length; index += 1) if (code.charCodeAt(index) === 10) starts.push(index + 1);
  return starts;
}

function sourceLocation(starts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: offset - (starts[lineIndex] ?? 0) + 1 };
}

function assertNoLocalCollisions(records: readonly PendingRecord[]): void {
  const seen = new Map<string, string>();
  for (const item of records) {
    const previous = seen.get(item.record.sourceAnchorId);
    if (previous !== undefined && previous !== item.identityKey) throw new SourceAnchorError("ANCHOR_HASH_COLLISION");
    seen.set(item.record.sourceAnchorId, item.identityKey);
  }
}

export function deepFreezeRecord(record: SourceAnchorRecord): SourceAnchorRecord {
  return Object.freeze({ ...record });
}
