# P0-T3 Execution Plan

- Starting commit: `5c929d8ea994e038abc60d9ba7f1d3d6878368f1`
- Task state was changed from `todo` to `in_progress` before protocol implementation.
- Measure the supported Codex client's actual initialize revision and capability keys with an ephemeral read-only bounded stdio probe.
- Test server-selected compatibility revisions independently; do not infer support from compilation or SDK constants alone.
- Lock a production v1 SDK supported by current OpenAI guidance; keep the newly released v2/2026 wire era outside scope without a tested Codex client.
- Define private strict types and closed Draft 2020-12 schemas for revision identity, confirmation, bounded privacy output, VemError and minimum EvidenceGraph.
- Keep the entire P0 path task-free; do not mix experimental Tasks and extension wire shapes.
- Run code/matrix/ADR/evidence contract tests, schema cross-validation, workspace regressions and dependency/license checks.
- Present the evidence-backed primary/compat/task proposal to the project owner. Keep ADR Proposed and task incomplete until explicitly accepted.
- After acceptance, update the decision inbox and ADR, rerun all gates, annotate the P0-T3 prompt and commit the atomic stage.
