# P0-T3 evidence summary

## Scope delivered

- Real Codex MCP initialization evidence for one proposed primary and two compatibility revisions, retained as bounded one-line JSONL records.
- Exact production SDK lock plus a checked-in compatibility matrix whose P0 task mode is always `none`.
- Strict TypeScript contracts and closed Draft 2020-12 JSON Schema for revision identity, privacy-bounded context, minimum EvidenceGraph, ConfirmationBinding and VemError.
- Deterministic schema generation, runtime/schema cross-validation, privacy guard, bounded handshake probe and regression tests.
- Confirmation binding includes protocol/project/session/connection epoch, claim/selection/document identity, direct-or-degraded source union, prompt hash, trusted reporter, five-minute example TTL with a 15-minute hard maximum, single-use state and one allowed action.
- Minimum evidence edges retain observer, timestamp, optional document/revision provenance, integrity, freshness, corroboration, conflicts and limitations.

## Compatibility observation

The supported Codex MCP client `0.144.5` requested `2025-06-18`, advertised `elicitation` and no Tasks. It completed initialization when the bounded probe selected `2025-03-26`, `2025-06-18` or `2025-11-25`.

## Verification

All recorded protocol, workspace, governance, dependency and preflight gates passed. See `test-results.txt` for bounded results and `commands.txt` for the reproducible command inventory.

## Privacy and boundaries

Handshake records retain only protocol versions, client name/version, top-level capability keys and a derived Tasks boolean. They contain no environment values, full initialize payload, authorization data, prompt text, page content or source path.

P0-T3 does not start an MCP server, advertise product tools/resources/Tasks, or implement runtime confirmation lifecycle, coordinator state, claims, source resolution or wait replay.

## Owner decision

The project owner explicitly answered `接受` at 2026-07-29T13:06:23+08:00. ADR 0004 is Accepted, `MCP-PRIMARY-COMPAT-REVISION` is decided, and P0-T3 is complete.
