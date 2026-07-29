import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const EXPECTED_PLAYWRIGHT = "1.62.0";
const EXPECTED_NODE = "24.18.0";
const SENTINEL = "VEM_PLAYWRIGHT_MSEDGE_OK";
const runnerRoot = dirname(fileURLToPath(import.meta.url));

function boundedMode(value) {
  if (!new Set(["headed", "headless"]).has(value)) {
    throw new Error("mode must be headed or headless");
  }
  return value;
}

const mode = boundedMode(process.argv[2]);
const profilePath = process.argv[3];
if (typeof profilePath !== "string" || !profilePath.includes("vem-playwright-preflight-")) {
  throw new Error("profile path must be task-owned");
}

const packageMetadata = JSON.parse(
  readFileSync(resolve(runnerRoot, "node_modules/playwright-core/package.json"), "utf8"),
);
if (packageMetadata.version !== EXPECTED_PLAYWRIGHT || process.versions.node !== EXPECTED_NODE) {
  throw new Error("runner toolchain version mismatch");
}

let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "msedge",
    headless: mode === "headless",
    timeout: 30_000,
    ignoreDefaultArgs: ["--no-sandbox"],
    acceptDownloads: false,
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.setContent(
    `<!doctype html><html><head><title>${SENTINEL}</title></head><body><main id="sentinel">${SENTINEL}</main></body></html>`,
  );
  const browserVersion = context.browser()?.version() ?? null;
  const title = await page.title();
  const text = await page.locator("#sentinel").textContent();
  const sentinelObserved = title === SENTINEL && text === SENTINEL;
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "P0-T0G-windows-runner-v1",
    result: sentinelObserved ? "pass" : "fail",
    classification: sentinelObserved ? "msedge-channel-sentinel" : "sentinel-mismatch",
    mode,
    channel: "msedge",
    nodeVersion: process.versions.node,
    playwrightVersion: packageMetadata.version,
    browserVersion,
    sentinelObserved,
    sandboxBypassRemoved: true,
  })}\n`);
  if (!sentinelObserved) process.exitCode = 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "P0-T0G-windows-runner-v1",
    result: "blocked",
    classification: error instanceof Error && error.name === "TimeoutError" ? "launch-timeout" : "launch-failed",
    mode,
    channel: "msedge",
    nodeVersion: process.versions.node,
    playwrightVersion: packageMetadata.version,
    browserVersion: null,
    sentinelObserved: false,
    sandboxBypassRemoved: true,
  })}\n`);
  process.exitCode = 2;
} finally {
  await context?.close().catch(() => undefined);
}
