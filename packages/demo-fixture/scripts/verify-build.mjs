import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const outputRoot = resolve("dist");
const files = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile()) files.push(path);
    else throw new Error("DEMO_BUILD_UNEXPECTED_OUTPUT_TYPE");
  }
}

collect(outputRoot);
const indexPath = resolve(outputRoot, "index.html");
const index = readFileSync(indexPath, "utf8");
const totalBytes = files.reduce((sum, path) => sum + statSync(path).size, 0);
const relativeFiles = files.map((path) => path.slice(outputRoot.length + 1).replaceAll("\\", "/")).sort();

if (!relativeFiles.includes("index.html")) throw new Error("DEMO_BUILD_INDEX_MISSING");
if (!relativeFiles.some((path) => /^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(path))) {
  throw new Error("DEMO_BUILD_SCRIPT_MISSING");
}
if (/\b(?:https?:)?\/\//iu.test(index)) throw new Error("DEMO_BUILD_EXTERNAL_URL");
if (totalBytes > 1_500_000) throw new Error("DEMO_BUILD_SIZE_EXCEEDED");
if (files.length > 12) throw new Error("DEMO_BUILD_FILE_COUNT_EXCEEDED");

console.log(
  [
    "DEMO_BUILD=passed",
    `files=${files.length}`,
    `bytes=${totalBytes}`,
    "externalUrls=0",
  ].join(" "),
);
