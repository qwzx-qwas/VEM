const MAX_JSONL_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const MAX_EVENTS = 20_000;

const FORBIDDEN_MARKERS = Object.freeze([
  "AGENTS.md",
  "SKILL.md",
  ".agents/",
  ".codex/skills/",
  "/.agents/",
  "/.codex/skills/",
  "/home/",
  "/mnt/",
  "/root/",
]);

const SAFE_ABSOLUTE_PREFIXES = Object.freeze([
  "/bin/",
  "/codex-home/",
  "/dev/",
  "/lib/",
  "/lib64/",
  "/opt/codex/",
  "/proc/",
  "/tmp/",
  "/usr/",
  "/work/",
]);

const ABSOLUTE_PATH_TOKEN = /(?:^|[\s"'=])(?<path>\/[A-Za-z0-9._~:@%+,-][^\s"';)]*)/gu;
const PARAMETERIZED_ROUTE = /^\/(?:[A-Za-z][A-Za-z0-9._~-]*|:[A-Za-z][A-Za-z0-9_-]*)(?:\/(?:[A-Za-z][A-Za-z0-9._~-]*|:[A-Za-z][A-Za-z0-9_-]*))*$/u;

export function auditCodexJsonlV2({ jsonl, stderr = "" }) {
  if (typeof jsonl !== "string" || typeof stderr !== "string") {
    throw new Error("CAPSULE_AUDIT_V2_INPUT_INVALID");
  }
  if (Buffer.byteLength(jsonl) > MAX_JSONL_BYTES
    || Buffer.byteLength(stderr) > MAX_STDERR_BYTES) {
    throw new Error("CAPSULE_AUDIT_V2_INPUT_TOO_LARGE");
  }

  const lines = jsonl.split(/\r?\n/u).filter(Boolean);
  if (lines.length > MAX_EVENTS) throw new Error("CAPSULE_AUDIT_V2_EVENT_LIMIT");
  const events = lines.map((line) => {
    try {
      const event = JSON.parse(line);
      if (typeof event !== "object" || event === null || Array.isArray(event)) {
        throw new Error("not-an-object");
      }
      return event;
    } catch {
      throw new Error("CAPSULE_AUDIT_V2_JSONL_INVALID");
    }
  });

  const externalPaths = [];
  const forbiddenMarkers = [];
  const safeAbsolutePaths = [];
  const ignoredDataTokens = [];

  const inspectForbidden = (text) => {
    if (typeof text !== "string") return;
    for (const marker of FORBIDDEN_MARKERS) {
      if (text.includes(marker)) forbiddenMarkers.push(marker);
    }
  };

  const classifyPath = (path) => {
    if (isSafeAbsolutePath(path)) safeAbsolutePaths.push(path);
    else externalPaths.push(path);
  };

  const inspectPathTokens = (text) => {
    if (typeof text !== "string") return;
    for (const match of text.matchAll(ABSOLUTE_PATH_TOKEN)) {
      const path = match.groups?.path;
      if (path !== undefined) classifyPath(path);
    }
  };

  const inspectStructuredOutput = (text) => {
    if (typeof text !== "string") return;
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("/")) continue;
      const token = trimmed.split(/\s/u, 1)[0] ?? "";
      if (token === "/" || token === "/>" || isParameterizedRoute(token)) {
        ignoredDataTokens.push(token);
      } else {
        classifyPath(token);
      }
    }
  };

  for (const event of events) {
    if (event.type !== "item.started" && event.type !== "item.completed") continue;
    if (event.item?.type !== "command_execution") continue;
    const command = event.item.command;
    const output = event.item.aggregated_output;
    inspectForbidden(command);
    inspectForbidden(output);
    inspectPathTokens(command);
    inspectStructuredOutput(output);
  }
  inspectForbidden(stderr);
  inspectPathTokens(stderr);

  if (externalPaths.length > 0 || forbiddenMarkers.length > 0) {
    throw new Error("CAPSULE_AUDIT_V2_ESCAPE");
  }

  const threadIds = events
    .filter((event) => event.type === "thread.started" && typeof event.thread_id === "string")
    .map((event) => event.thread_id);

  return Object.freeze({
    schemaVersion: "P0-T17E-capsule-audit-v2",
    valid: true,
    eventCount: events.length,
    threadIds: Object.freeze(threadIds),
    safeAbsolutePathCount: safeAbsolutePaths.length,
    ignoredDataTokens: Object.freeze([...new Set(ignoredDataTokens)].sort()),
    externalPaths: Object.freeze([]),
    forbiddenMarkers: Object.freeze([]),
  });
}

function isSafeAbsolutePath(path) {
  return SAFE_ABSOLUTE_PREFIXES.some((prefix) => (
    path === prefix.slice(0, -1) || path.startsWith(prefix)
  ));
}

function isParameterizedRoute(token) {
  return token.includes("/:") && PARAMETERIZED_ROUTE.test(token);
}
