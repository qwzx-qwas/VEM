import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { parseDocument } from "yaml";

export class ValidationError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}

const fail = (code, message) => { throw new ValidationError(code, message); };
const array = (value, code, label) => Array.isArray(value) ? value : fail(code, `${label} must be an array`);
const object = (value, code, label) => value && typeof value === "object" && !Array.isArray(value) ? value : fail(code, `${label} must be an object`);
const strings = (value, code, label) => array(value, code, label).map((item) => typeof item === "string" && item ? item : fail(code, `${label} needs strings`));
const unique = (items, code, label) => new Set(items).size === items.length ? items : fail(code, `${label} contains duplicates`);

export function parseYaml(text, label) {
  const document = parseDocument(text, { uniqueKeys: true, maxAliasCount: 0 });
  if (document.errors.length) fail("yaml-parse", `${label}: ${document.errors[0].message}`);
  return object(document.toJS({ maxAliasCount: 0 }), "schema", label);
}

function safePath(root, path, code = "authority-path") {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.split(/[\\/]/u).includes("..")) fail(code, `unsafe path ${String(path)}`);
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) fail(code, `path escapes root: ${path}`);
  try { if (!statSync(absolute).isFile()) fail(code, `not a file: ${path}`); } catch { fail(code, `missing file: ${path}`); }
  return absolute;
}

export function markdownSections(text) {
  const sections = [];
  let current = null;
  for (const line of text.split(/\r?\n/u)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
    if (match) {
      current = { anchor: match[2], body: "" };
      sections.push(current);
    } else if (current) current.body += `${line}\n`;
  }
  return sections;
}

function authority(contract, designSource) {
  const raw = contract.authorities ?? contract.authoritative_sections;
  return array(raw, "contract-schema", `${contract.id}.authorities`).map((item) => {
    if (typeof item === "string") return { path: designSource, anchor: item };
    const ref = object(item, "authority-schema", `${contract.id}.authority`);
    if (new Set(Object.keys(ref)).size !== 2 || !("path" in ref) || !("anchor" in ref)) fail("authority-schema", `${contract.id} authority needs only path and anchor`);
    if (typeof ref.path !== "string" || typeof ref.anchor !== "string" || !ref.anchor) fail("authority-schema", `${contract.id} authority is malformed`);
    return ref;
  });
}

function visitGraph(ids, dependencies, code) {
  const visiting = new Set(); const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) fail(code, `cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of dependencies(id)) {
      if (!ids.has(dep)) fail("unknown-dependency", `${id} -> ${dep}`);
      visit(dep);
    }
    visiting.delete(id); visited.add(id);
  };
  for (const id of ids) visit(id);
}

function slug(value) {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s+/gu, "-");
}

function validateLinks(root, sources) {
  for (const source of sources) {
    const absolute = safePath(root, source, "internal-link");
    const text = readFileSync(absolute, "utf8");
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      const target = match[1].split(/\s+["']/u)[0];
      if (/^(?:https?:|mailto:|#)/iu.test(target)) continue;
      const [rawPath, fragment] = target.split("#", 2);
      const targetPath = resolve(dirname(absolute), decodeURIComponent(rawPath));
      const rel = relative(root, targetPath);
      if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) fail("internal-link", `${source}: path escapes root`);
      try { if (!statSync(targetPath).isFile()) fail("internal-link", `${source}: missing ${rawPath}`); } catch { fail("internal-link", `${source}: missing ${rawPath}`); }
      if (fragment) {
        const anchors = markdownSections(readFileSync(targetPath, "utf8")).map((section) => slug(section.anchor));
        if (!anchors.includes(decodeURIComponent(fragment).toLowerCase())) fail("internal-link", `${source}: missing #${fragment}`);
      }
    }
  }
}

export function validateModel(root, roadmap, requirements) {
  if (requirements.schema_version !== 4) fail("requirements-schema", "schema_version must be 4");
  const policy = object(requirements.coverage_policy, "requirements-schema", "coverage_policy");
  if (policy.authority_reference !== "path-stable-anchor-v1") fail("requirements-schema", "authority reference version mismatch");
  const designSource = requirements.design_source;
  safePath(root, designSource);
  const contracts = array(requirements.contracts, "requirements-schema", "contracts");
  const contractIds = new Set(unique(contracts.map((item) => item.id), "contract-reference", "contract ids"));
  const phases = array(roadmap.phases, "roadmap-schema", "phases");
  const phaseIds = new Set(unique(phases.map((phase) => phase.id), "roadmap-schema", "phase ids"));
  const tasks = phases.flatMap((phase) => array(phase.tasks, "roadmap-schema", `${phase.id}.tasks`).map((task) => ({ ...task, phaseId: phase.id })));
  const taskIds = new Set(unique(tasks.map((task) => task.id), "orphan-task", "task ids"));
  const byTask = new Map(tasks.map((task) => [task.id, task]));
  const byContract = new Map(contracts.map((contract) => [contract.id, contract]));
  const taskReachesDependency = (fromTaskId, targetTaskId) => {
    const seen = new Set();
    const pending = [...(byTask.get(fromTaskId)?.depends_on ?? [])];
    while (pending.length) {
      const candidate = pending.pop();
      if (candidate === targetTaskId) return true;
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      pending.push(...(byTask.get(candidate)?.depends_on ?? []));
    }
    return false;
  };

  for (const task of tasks) {
    const bindings = unique(strings(task.contracts, "contract-reference", `${task.id}.contracts`), "contract-reference", `${task.id}.contracts`);
    if (!bindings.length) fail("orphan-task", `${task.id} has no contract`);
    for (const id of bindings) if (!contractIds.has(id)) fail("unknown-contract", `${task.id}: ${id}`);
    strings(task.tests, "missing-test-map", `${task.id}.tests`);
    if (!roadmap.status_values.task.includes(task.status)) fail("roadmap-state", `${task.id}: ${task.status}`);
    const deps = strings(task.depends_on ?? [], "roadmap-schema", `${task.id}.depends_on`);
    if (["in_progress", "done"].includes(task.status)) for (const dep of deps) if (byTask.get(dep)?.status !== "done") fail("roadmap-state", `${task.id} requires done ${dep}`);
  }
  visitGraph(taskIds, (id) => byTask.get(id).depends_on ?? [], "dependency-cycle");
  visitGraph(phaseIds, (id) => phases.find((phase) => phase.id === id).depends_on ?? [], "phase-cycle");

  const recoveryPhases = phases.filter((phase) => phase.recovery_of_failed_phase !== undefined);
  const blockedRemediationPhases = phases.filter(
    (phase) => phase.remediation_of_blocked_phase !== undefined,
  );
  if (phases.some((phase) => (
    phase.recovery_of_failed_phase !== undefined
      && phase.remediation_of_blocked_phase !== undefined
  ))) {
    fail("recovery-boundary", "phase cannot recover failed and remediate blocked state together");
  }
  for (const phase of recoveryPhases) {
    if (typeof phase.recovery_of_failed_phase !== "string"
      || phases.find((item) => item.id === phase.recovery_of_failed_phase)?.status !== "failed"
      || (phase.depends_on ?? []).length !== 0
      || phase.scope_boundary !== "independent-research-no-product-unlock"
      || typeof phase.authorization_ref !== "string") {
      fail("recovery-boundary", `${phase.id} recovery declaration invalid`);
    }
    safePath(root, phase.authorization_ref, "recovery-boundary");
    const recoveryTaskIds = new Set(tasks
      .filter((task) => task.phaseId === phase.id)
      .map((task) => task.id));
    if (phases.some((candidate) => (
      candidate.id !== phase.id && (candidate.depends_on ?? []).includes(phase.id)
    )) || tasks.some((task) => (
      task.phaseId !== phase.id
      && (task.depends_on ?? []).some((dependency) => recoveryTaskIds.has(dependency))
    ))) {
      fail("recovery-boundary", `${phase.id} leaks into an existing product dependency`);
    }
  }
  for (const phase of blockedRemediationPhases) {
    if (typeof phase.remediation_of_blocked_phase !== "string"
      || phases.find((item) => item.id === phase.remediation_of_blocked_phase)?.status !== "blocked"
      || (phase.depends_on ?? []).length !== 0
      || phase.scope_boundary !== "independent-research-no-product-unlock"
      || typeof phase.authorization_ref !== "string") {
      fail("recovery-boundary", `${phase.id} blocked remediation declaration invalid`);
    }
    safePath(root, phase.authorization_ref, "recovery-boundary");
    const remediationTaskIds = new Set(tasks
      .filter((task) => task.phaseId === phase.id)
      .map((task) => task.id));
    if (phases.some((candidate) => (
      candidate.id !== phase.id && (candidate.depends_on ?? []).includes(phase.id)
    )) || tasks.some((task) => (
      task.phaseId !== phase.id
      && (task.depends_on ?? []).some((dependency) => remediationTaskIds.has(dependency))
    ))) {
      fail("recovery-boundary", `${phase.id} leaks into an existing product dependency`);
    }
  }

  for (const phase of phases) {
    if (!roadmap.status_values.phase.includes(phase.status)) fail("roadmap-state", `${phase.id}: ${phase.status}`);
    if (["in_progress", "passed"].includes(phase.status)) for (const dep of phase.depends_on ?? []) if (phases.find((item) => item.id === dep)?.status !== "passed") fail("roadmap-state", `${phase.id} requires passed ${dep}`);
    if (phase.status === "todo" && phase.tasks.some((task) => task.status !== "todo")) fail("roadmap-state", `${phase.id} todo has active task`);
    if (phase.status === "passed" && phase.tasks.some((task) => task.status !== "done")) fail("roadmap-state", `${phase.id} passed has incomplete task`);
  }

  const covered = new Set(); const authorityPaths = new Set();
  for (const contract of contracts) {
    const mapped = unique(strings(contract.roadmap_tasks, "contract-reference", `${contract.id}.roadmap_tasks`), "contract-reference", `${contract.id}.roadmap_tasks`);
    if (!mapped.length || !strings(contract.required_tests, "missing-test-map", `${contract.id}.required_tests`).length) fail("missing-test-map", contract.id);
    for (const taskId of mapped) {
      if (!taskIds.has(taskId)) fail("contract-reference", `${contract.id}: unknown ${taskId}`);
      if (!(byTask.get(taskId).contracts ?? []).includes(contract.id)) fail("contract-reference", `${contract.id}/${taskId} not bidirectional`);
    }
    for (const ref of authority(contract, designSource)) {
      const absolute = safePath(root, ref.path); authorityPaths.add(ref.path);
      const matching = markdownSections(readFileSync(absolute, "utf8")).filter((section) => section.anchor === ref.anchor);
      if (matching.length !== 1) fail("stable-anchor", `${ref.path}#${ref.anchor} count=${matching.length}`);
      covered.add(`${ref.path}\0${ref.anchor}`);
    }
  }
  for (const task of tasks) for (const id of task.contracts) if (!(byContract.get(id).roadmap_tasks ?? []).includes(task.id)) fail("contract-reference", `${task.id}/${id} not bidirectional`);

  const terms = strings(policy.normative_terms, "requirements-schema", "normative_terms");
  for (const path of authorityPaths) {
    const text = readFileSync(safePath(root, path), "utf8");
    for (const section of markdownSections(text)) {
      const body = section.body.toLowerCase();
      if (terms.some((term) => body.includes(term.toLowerCase())) && !covered.has(`${path}\0${section.anchor}`)) fail("normative-section-coverage", `${path}#${section.anchor}`);
    }
  }

  const decisions = object(roadmap.decisions, "decision-reference", "decisions");
  for (const [key, rawDescriptor] of Object.entries(decisions)) {
    const descriptor = object(rawDescriptor, "decision-reference", key);
    const attempts = tasks.filter((task) => task.decision_key === key).sort((a, b) => a.decision_attempt - b.decision_attempt);
    if (!attempts.length || descriptor.current_attempt !== attempts.at(-1).id) fail("decision-reference", `${key} current attempt mismatch`);
    if (attempts.some((task) => task.phaseId !== descriptor.phase)) {
      fail("decision-reference", `${key} phase mismatch`);
    }
    attempts.forEach((task, index) => {
      if (task.decision_attempt !== index + 1) fail("decision-attempt", `${task.id} attempt sequence`);
      if ((index ? attempts[index - 1].id : null) !== task.supersedes_attempt) fail("decision-attempt", `${task.id} supersedes mismatch`);
      if (!roadmap.status_values.decision.includes(task.decision)) fail("decision-verdict", `${task.id} invalid verdict`);
      if (task.status === "done" && task.decision === "pending") fail("decision-verdict", `${task.id} done pending`);
      if (task.status !== "done" && task.decision !== "pending") fail("decision-verdict", `${task.id} verdict before done`);
    });
    attempts.forEach((task, index) => {
      if (task.decision !== "adjust") return;
      const nextAttempt = attempts[index + 1];
      const owningPhase = phases.find((phase) => phase.id === descriptor.phase);
      if (nextAttempt === undefined) {
        if (owningPhase?.status !== "failed") {
          fail(
            "decision-adjust",
            `${task.id} adjust requires remediation and a new attempt`,
          );
        }
        return;
      }
      const remediationExists = tasks.some((candidate) => (
        candidate.phaseId === descriptor.phase
          && candidate.decision_key === undefined
          && taskReachesDependency(candidate.id, task.id)
          && taskReachesDependency(nextAttempt.id, candidate.id)
      ));
      if (!remediationExists) {
        fail(
          "decision-adjust",
          `${task.id} adjust has no remediation task before ${nextAttempt.id}`,
        );
      }
    });
    const recoveryPhase = recoveryPhases.find((phase) => phase.id === descriptor.phase);
    if (recoveryPhase !== undefined) {
      const excludedDecision = decisions[descriptor.does_not_supersede];
      const excludedAttempt = excludedDecision === undefined
        ? undefined
        : byTask.get(excludedDecision.current_attempt);
      const additionalExcludedKeys = descriptor.also_does_not_supersede ?? [];
      const inheritedExcludedKeys = excludedDecision?.scope === "independent-research"
        ? [
            excludedDecision.does_not_supersede,
            ...(excludedDecision.also_does_not_supersede ?? []),
          ]
        : [];
      if (descriptor.scope !== "independent-research"
        || typeof descriptor.does_not_supersede !== "string"
        || excludedDecision === undefined
        || excludedDecision.phase !== recoveryPhase.recovery_of_failed_phase
        || excludedAttempt?.decision !== "stop"
        || !Array.isArray(additionalExcludedKeys)
        || additionalExcludedKeys.length !== inheritedExcludedKeys.length
        || additionalExcludedKeys.some((excludedKey, index) => (
          excludedKey !== inheritedExcludedKeys[index]
        ))
        || additionalExcludedKeys.some((excludedKey) => {
          const additionalDecision = decisions[excludedKey];
          const additionalAttempt = additionalDecision === undefined
            ? undefined
            : byTask.get(additionalDecision.current_attempt);
          const additionalPhase = phases.find(
            (phase) => phase.id === additionalDecision?.phase,
          );
          const preservedTerminalStop = additionalPhase?.status === "failed"
            && additionalAttempt?.status === "done"
            && additionalAttempt?.decision === "stop";
          const preservedBlockedPending = additionalPhase?.status === "blocked"
            && additionalAttempt?.status === "blocked"
            && additionalAttempt?.decision === "pending";
          return typeof excludedKey !== "string"
            || excludedKey === key
            || additionalDecision === undefined
            || (!preservedTerminalStop && !preservedBlockedPending);
        })
        || new Set(additionalExcludedKeys).size !== additionalExcludedKeys.length
        || recoveryPhase.gate?.requires_decisions?.[key] !== "continue"
        || Object.keys(recoveryPhase.gate.requires_decisions).length !== 1) {
        fail("recovery-boundary", `${key} recovery decision isolation invalid`);
      }
    }
    const blockedRemediationPhase = blockedRemediationPhases.find(
      (phase) => phase.id === descriptor.phase,
    );
    if (blockedRemediationPhase !== undefined) {
      const excludedDecision = decisions[descriptor.does_not_supersede];
      const excludedAttempt = excludedDecision === undefined
        ? undefined
        : byTask.get(excludedDecision.current_attempt);
      const additionalExcludedKeys = descriptor.also_does_not_supersede ?? [];
      const inheritedExcludedKeys = excludedDecision?.scope === "independent-research"
        ? [
            excludedDecision.does_not_supersede,
            ...(excludedDecision.also_does_not_supersede ?? []),
          ]
        : [];
      const blockedPhase = phases.find(
        (phase) => phase.id === blockedRemediationPhase.remediation_of_blocked_phase,
      );
      if (descriptor.scope !== "independent-research"
        || typeof descriptor.does_not_supersede !== "string"
        || excludedDecision === undefined
        || excludedDecision.phase !== blockedRemediationPhase.remediation_of_blocked_phase
        || blockedPhase?.status !== "blocked"
        || excludedAttempt?.status !== "blocked"
        || excludedAttempt?.decision !== "pending"
        || !Array.isArray(additionalExcludedKeys)
        || additionalExcludedKeys.length !== inheritedExcludedKeys.length
        || additionalExcludedKeys.some((excludedKey, index) => (
          excludedKey !== inheritedExcludedKeys[index]
        ))
        || additionalExcludedKeys.some((excludedKey) => {
          const additionalDecision = decisions[excludedKey];
          const additionalAttempt = additionalDecision === undefined
            ? undefined
            : byTask.get(additionalDecision.current_attempt);
          return typeof excludedKey !== "string"
            || excludedKey === key
            || additionalDecision === undefined
            || phases.find((phase) => phase.id === additionalDecision.phase)?.status !== "failed"
            || additionalAttempt?.decision !== "stop";
        })
        || new Set(additionalExcludedKeys).size !== additionalExcludedKeys.length
        || blockedRemediationPhase.gate?.requires_decisions?.[key] !== "continue"
        || Object.keys(blockedRemediationPhase.gate.requires_decisions).length !== 1) {
        fail("recovery-boundary", `${key} blocked remediation decision isolation invalid`);
      }
    }
  }
  for (const task of tasks) {
    for (const [key, verdict] of Object.entries(task.requires_decisions ?? {})) {
      if (!(key in decisions)) fail("decision-reference", `${task.id}: ${key}`);
      if (verdict !== "continue") fail("decision-reference", `${task.id}: ${key} requires unsupported ${verdict}`);
    }
  }
  for (const phase of phases) {
    for (const [key, verdict] of Object.entries(phase.gate?.requires_decisions ?? {})) {
      if (!(key in decisions)) fail("decision-reference", `${phase.id}: ${key}`);
      if (verdict !== "continue") fail("decision-reference", `${phase.id}: ${key} requires unsupported ${verdict}`);
    }
  }
  validateLinks(root, strings(policy.internal_link_sources, "requirements-schema", "internal_link_sources"));
  return { phases: phases.length, tasks: tasks.length, contracts: contracts.length, authorityFiles: authorityPaths.size };
}

export function validateRepository(root) {
  const roadmap = parseYaml(readFileSync(resolve(root, "ROADMAP.yaml"), "utf8"), "ROADMAP.yaml");
  const requirements = parseYaml(readFileSync(resolve(root, "docs/requirements.yaml"), "utf8"), "docs/requirements.yaml");
  return validateModel(root, roadmap, requirements);
}
