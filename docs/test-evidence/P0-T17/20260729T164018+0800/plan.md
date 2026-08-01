# P0-T17A execution plan

## Task identity

- ID: `P0-T17A`
- Phase/status: `P0` / `in_progress`
- Observable result: a versioned, read-only harness can validate immutable pilot inputs and completed trial records, then produce the same schema-valid canonical evidence bundle and SHA-256 content hash for the same inputs without exposing participant ground truth or physical paths.
- Dependencies: `P0-T5` and `P0-T16` are `done`; P0 has no phase dependency and this task has no decision dependency.
- Contract: `UX-GATE-001`, directly and bidirectionally mapped in `ROADMAP.yaml` and `docs/requirements.yaml`.
- Authoritative design: `docs/DESIGN.md` sections 2.7, 2.7.1, 2.9 and 16.7.
- Task prompt: `docs/tasks/ATOMIC_TASK_PROMPTS.md` section `P0-T17A — 两层只读 pilot harness`.

## Atomic boundary

This task introduces one offline evaluation boundary: read immutable preregistration/task/selection/registry/ground-truth/trial inputs and build immutable raw records plus one canonical bundle. It does not execute the 3–5 task pilot, calculate a decision, modify fixture/source/registry content, access the network, start Coordinator/MCP, add browser ingress, or consume later P1/P3/P4 holdouts.

## Capabilities, trust, privacy and lifecycle

- The harness is offline and local; no browser, transport, MCP, pairing, capture, artifact or fallback capability is added.
- Input JSON and Git fixture identity are untrusted until closed-shape, size, hash, path-confinement, symlink, revision and semantic checks pass.
- The only allowed operations are bounded read/hash/validate/rank/evaluate operations. Source writes, arbitrary commands, URLs and output paths are not accepted by the harness API.
- Participant-visible records exclude evaluator ground truth. Final post-trial bundles expose only hashes and match/error booleans, never ground-truth source paths, prompt text, selection text, raw URL paths, absolute paths or registry relative paths.
- Physical input paths are root-relative and remain outside canonical output and errors. Selection text and page path are projected to bounded structural metadata.
- All inputs are rehashed after processing; concurrent mutation, fixture commit mismatch, missing/tampered ground truth, holdout overlap, divergent timing boundary/cache policy or forbidden degraded candidates when direct source exists fail closed.
- Outputs are immutable return values/stdout data. P0-T17 evidence files are task documentation written by Codex, not by the harness. No persistent product state, TTL, lease, quota, journal or crash-recovery capability is introduced.

## Planned changes and tests

1. Add a private strict TypeScript pilot-harness package with closed input/output types, bounded validators, confined read-only snapshot loader and deterministic canonical JSON/SHA-256 support.
2. Implement the raw-record layer and canonical bundle builder, including fixture-commit binding, selection/registry/ground-truth hashes, common monotonic-nanosecond timing boundary, later-holdout exclusion and redacted human summary.
3. Add JSON Schemas and synthetic fixtures/tests for determinism, schema agreement, tamper/concurrent-change rejection, path/symlink confinement, write/unknown-field rejection, ground-truth withholding, timing mismatch, privacy projection and holdout overlap.
4. Add a stdout-only CLI/check command if needed for reproducible bundle generation. Do not add T17B plans, real trial results or a verdict.

## Verification commands

```bash
pnpm roadmap:validate
pnpm --filter @vem/pilot-harness test
pnpm --filter @vem/pilot-harness typecheck
pnpm lint
pnpm test
pnpm build
pnpm typecheck
pnpm workspace:check
pnpm license:check
pnpm test:install
python3 -m unittest discover -s scripts/preflight/tests -p 'test_*.py'
git diff --check
```

Edge/browser verification is not required because this is an offline read-only harness; the already-passed P0-T0G channel evidence remains unchanged. Completion requires targeted and affected full gates to pass before roadmap/progress/prompt completion records are written.
