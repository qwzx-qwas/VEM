#!/usr/bin/env node
import { resolve } from "node:path";
import { validateRepository, ValidationError } from "./validator-core.mjs";

try {
  const result = validateRepository(resolve(process.cwd()));
  console.log(`ROADMAP_VALIDATION=passed phases=${result.phases} tasks=${result.tasks} contracts=${result.contracts} authorityFiles=${result.authorityFiles}`);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(`ROADMAP_VALIDATION=failed code=${error.code}`);
    process.exitCode = 2;
  } else throw error;
}
