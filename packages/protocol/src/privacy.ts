const FORBIDDEN_KEYS = /(?:password|token|cookie|authorization|formvalue|rawpath|query|fragment|sourcepath|privatekey)/iu;

export function assertPrivacySafe(value: unknown, depth = 0): void {
  if (depth > 8) throw new Error("PRIVACY_DEPTH_EXCEEDED");
  if (typeof value === "string") {
    if (value.length > 2048) throw new Error("PRIVACY_STRING_EXCEEDED");
    if (/\bBearer\s+[A-Za-z0-9._~+/-]+=*/iu.test(value)) throw new Error("PRIVACY_BEARER_VALUE");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 64) throw new Error("PRIVACY_ARRAY_EXCEEDED");
    for (const item of value) assertPrivacySafe(item, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.test(key)) throw new Error(`PRIVACY_FORBIDDEN_KEY:${key}`);
      assertPrivacySafe(item, depth + 1);
    }
  }
}
