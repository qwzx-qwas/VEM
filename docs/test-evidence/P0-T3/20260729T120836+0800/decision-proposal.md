# MCP-PRIMARY-COMPAT-REVISION owner proposal

Status: accepted by the project owner at 2026-07-29T13:06:23+08:00

## Proposed decision

- Primary MCP revision: `2025-06-18`.
- Compatibility revisions: `2025-03-26` and `2025-11-25`.
- Production SDK: exact `@modelcontextprotocol/sdk@1.30.0`.
- P0 Tasks mode: `none`; the core wait path uses a bounded tool call, cancellation and later journal replay.
- Experimental `2025-11-25` Tasks and later extension Tasks remain disabled and may never be mixed in one wire adapter.
- The literal `latest` is rejected; each session uses only its explicitly negotiated revision.

## Evidence

- Codex MCP client `0.144.5` requested `2025-06-18`, advertised `elicitation`, advertised no Tasks, and initialized successfully with each proposed server revision.
- Exact SDK `1.30.0` supports all three revisions and exposes `2025-11-25` as its latest supported revision.
- Closed protocol schemas, compatibility negotiation, privacy limits, revision identity, confirmation binding, EvidenceGraph and VemError contracts pass the recorded gates.

Owner decision: accepted with the exact statement `接受`; ADR 0004 is Accepted and P0-T3 is `done`.
