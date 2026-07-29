export {
  canonicalIdentityKey,
  sourceAnchorIdForIdentity,
  transformIntrinsicJsx,
  type TransformIntrinsicJsxInput,
} from "./anchor.js";
export { PrivateInMemoryRegistry, vemSourceAnchor } from "./plugin.js";
export {
  safeSourceAnchorErrorMessage,
  SOURCE_ANCHOR_ATTRIBUTE,
  SOURCE_ANCHOR_NAMESPACE,
  SOURCE_ANCHOR_PREFIX,
  SOURCE_TRANSFORM_VERSION,
  SourceAnchorError,
  type PrivateSourceRegistrySnapshot,
  type SourceAnchorCanonicalIdentity,
  type SourceAnchorErrorCode,
  type SourceAnchorRecord,
  type SourceAnchorSourceMap,
  type SourceAnchorTransformResult,
  type VemSourceAnchorOptions,
  type VemSourceAnchorPlugin,
} from "./types.js";
