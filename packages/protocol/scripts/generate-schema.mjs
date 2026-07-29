import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { protocolJsonSchema } from "../dist/schemas.js";

const output = `${JSON.stringify(protocolJsonSchema, null, 2)}\n`;
const target = resolve("schemas/protocol.schema.json");
if (process.argv.includes("--write")) writeFileSync(target, output, "utf8");
else if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== output) throw new Error("protocol.schema.json is stale");
} else throw new Error("use --write or --check");
