import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { stringify } from "yaml";

import { ValidationError, validateModel } from "./validator-core.mjs";

let root;
let roadmap;
let requirements;

function write(path, value) {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, value);
}

function validate() { return validateModel(root, roadmap, requirements); }
function code(expected, action = validate) {
  try { action(); throw new Error("expected validation error"); }
  catch (error) { expect(error).toBeInstanceOf(ValidationError); expect(error.code).toBe(expected); }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vem-roadmap-test-"));
  write("docs/A.md", "# Alpha\nMUST keep alpha.\n");
  write("docs/B.md", "# Beta Stable\n必须 keep beta.\n");
  write("docs/README.md", "[beta](B.md#beta-stable)\n");
  roadmap = {
    status_values: { task: ["todo", "in_progress", "blocked", "done"], phase: ["todo", "in_progress", "blocked", "passed", "failed"], decision: ["pending", "continue", "adjust", "stop"] },
    decisions: {},
    phases: [{ id: "P0", status: "in_progress", depends_on: [], tasks: [{ id: "P0-T1", status: "in_progress", contracts: ["C-1"], depends_on: [], tests: ["valid"] }] }],
  };
  requirements = {
    schema_version: 4,
    design_source: "docs/A.md",
    coverage_policy: {
      authority_reference: "path-stable-anchor-v1",
      legacy_string_authority_base: "design_source",
      internal_link_sources: ["docs/README.md"],
      normative_terms: ["MUST", "必须"],
    },
    contracts: [{ id: "C-1", authorities: [{ path: "docs/A.md", anchor: "Alpha" }, { path: "docs/B.md", anchor: "Beta Stable" }], introduced_phase: "P0", roadmap_tasks: ["P0-T1"], required_tests: ["valid"] }],
  };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("REQ-TRACE-001 validator", () => {
  test("accepts valid multi-source path and stable anchors", () => {
    expect(validate()).toEqual({ phases: 1, tasks: 1, contracts: 1, authorityFiles: 2 });
  });

  test("keeps explicit legacy design-source headings compatible", () => {
    requirements.contracts[0].authoritative_sections = ["Alpha"];
    delete requirements.contracts[0].authorities;
    write("docs/A.md", "# Alpha\nMUST keep alpha.\n# Beta Stable\n必须 keep beta.\n");
    requirements.contracts[0].authoritative_sections.push("Beta Stable");
    expect(validate().authorityFiles).toBe(1);
  });

  test("rejects unknown contracts and non-bidirectional mappings", () => {
    roadmap.phases[0].tasks[0].contracts = ["UNKNOWN"];
    code("unknown-contract");
    roadmap.phases[0].tasks[0].contracts = ["C-1"];
    requirements.contracts[0].roadmap_tasks = [];
    code("missing-test-map");
  });

  test("rejects uncovered normative headings", () => {
    write("docs/A.md", "# Alpha\nMUST keep alpha.\n# Uncovered\nMUST be mapped.\n");
    code("normative-section-coverage");
  });

  test("rejects missing test maps", () => {
    requirements.contracts[0].required_tests = [];
    code("missing-test-map");
    requirements.contracts[0].required_tests = ["valid"];
    roadmap.phases[0].tasks[0].tests = "none";
    code("missing-test-map");
  });

  test("rejects broken internal links", () => {
    write("docs/README.md", "[missing](missing.md)\n");
    code("internal-link");
  });

  test("rejects unsafe missing and duplicate authority anchors", () => {
    requirements.contracts[0].authorities[0].path = "../outside.md";
    code("authority-path");
    requirements.contracts[0].authorities[0].path = "docs/A.md";
    requirements.contracts[0].authorities[0].anchor = "Missing";
    code("stable-anchor");
    requirements.contracts[0].authorities[0].anchor = "Alpha";
    write("docs/A.md", "# Alpha\nMUST one.\n# Alpha\nMUST two.\n");
    code("stable-anchor");
  });

  test("rejects orphan tasks and dependency cycles", () => {
    roadmap.phases[0].tasks[0].contracts = [];
    code("orphan-task");
    roadmap.phases[0].tasks[0].status = "todo";
    roadmap.phases[0].tasks[0].contracts = ["C-1"];
    roadmap.phases[0].tasks.push({ id: "P0-T2", status: "todo", contracts: ["C-1"], depends_on: ["P0-T1"], tests: ["cycle"] });
    roadmap.phases[0].tasks[0].depends_on = ["P0-T2"];
    requirements.contracts[0].roadmap_tasks.push("P0-T2");
    code("dependency-cycle");
  });

  test("rejects inconsistent task and phase states", () => {
    roadmap.phases[0].tasks.push({ id: "P0-T0", status: "todo", contracts: ["C-1"], depends_on: [], tests: ["state"] });
    requirements.contracts[0].roadmap_tasks.push("P0-T0");
    roadmap.phases[0].tasks[0].status = "done";
    roadmap.phases[0].tasks[0].depends_on = ["P0-T0"];
    code("roadmap-state");
    roadmap.phases[0].tasks[0].depends_on = [];
    roadmap.phases[0].status = "passed";
    code("roadmap-state");
  });

  test("rejects decision reference attempt and verdict drift", () => {
    const task = roadmap.phases[0].tasks[0];
    roadmap.decisions.DECISION = { phase: "P0", current_attempt: task.id };
    Object.assign(task, { decision_key: "DECISION", decision_attempt: 2, supersedes_attempt: null, decision: "pending", status: "done" });
    code("decision-attempt");
    task.decision_attempt = 1;
    code("decision-verdict");
    task.status = "todo"; task.decision = "continue";
    code("decision-verdict");
  });

  test("accepts an owner-authorized recovery phase without reopening the failed phase", () => {
    addRecoveryPhase();
    expect(validate()).toEqual({
      phases: 2,
      tasks: 3,
      contracts: 1,
      authorityFiles: 2,
    });
  });

  test("rejects recovery from a non-failed phase or through a phase dependency", () => {
    addRecoveryPhase();
    roadmap.phases[0].status = "in_progress";
    code("recovery-boundary");
    roadmap.phases[0].status = "failed";
    roadmap.phases[1].depends_on = ["P0"];
    code("recovery-boundary");
  });

  test("rejects recovery decision drift and dependency leakage into existing work", () => {
    addRecoveryPhase();
    roadmap.decisions.RECOVERY.does_not_supersede = "RECOVERY";
    code("recovery-boundary");
    roadmap.decisions.RECOVERY.does_not_supersede = "P0-VALUE";
    roadmap.phases.push({
      id: "P1",
      status: "todo",
      depends_on: ["R0"],
      tasks: [],
    });
    code("recovery-boundary");
  });

  test("accepts additional terminal decision exclusions and rejects non-terminal drift", () => {
    addRecoveryPhase();
    const p0Task = roadmap.phases[0].tasks[0];
    roadmap.decisions.RECOVERY.also_does_not_supersede = ["P0-VALUE"];
    expect(validate()).toMatchObject({ phases: 2, tasks: 3 });
    p0Task.decision = "adjust";
    code("recovery-boundary");
  });

  test("YAML serializer fixtures remain deterministic", () => {
    expect(stringify(requirements)).toBe(stringify(requirements));
  });
});

function addRecoveryPhase() {
  write("docs/decisions.yaml", "owner: authorized\n");
  const p0Task = roadmap.phases[0].tasks[0];
  Object.assign(p0Task, {
    status: "done",
    decision_key: "P0-VALUE",
    decision_attempt: 1,
    supersedes_attempt: null,
    decision: "stop",
  });
  roadmap.phases[0].status = "failed";
  const charter = {
    id: "R0-T1",
    status: "in_progress",
    contracts: ["C-1"],
    depends_on: ["P0-T1"],
    tests: ["recovery-charter"],
  };
  const verdict = {
    id: "R0-T2",
    status: "todo",
    contracts: ["C-1"],
    depends_on: ["R0-T1"],
    tests: ["recovery-verdict"],
    decision_key: "RECOVERY",
    decision_attempt: 1,
    supersedes_attempt: null,
    decision: "pending",
  };
  roadmap.phases.push({
    id: "R0",
    status: "in_progress",
    depends_on: [],
    recovery_of_failed_phase: "P0",
    authorization_ref: "docs/decisions.yaml",
    scope_boundary: "independent-research-no-product-unlock",
    gate: { requires_decisions: { RECOVERY: "continue" } },
    tasks: [charter, verdict],
  });
  roadmap.decisions["P0-VALUE"] = { phase: "P0", current_attempt: "P0-T1" };
  roadmap.decisions.RECOVERY = {
    phase: "R0",
    current_attempt: "R0-T2",
    scope: "independent-research",
    does_not_supersede: "P0-VALUE",
  };
  requirements.contracts[0].roadmap_tasks.push("R0-T1", "R0-T2");
}
