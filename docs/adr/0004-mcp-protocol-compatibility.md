# ADR 0004: MCP protocol compatibility and minimum P0 contracts

- Status: Accepted
- Date: 2026-07-29
- Contracts: `CORE-BOUND-001`, `REV-ID-001`, `EVIDENCE-TRUST-001`, `PRIV-MIN-001`, `MCP-COMPAT-001`, `CONF-BIND-001`
- Decision owner: project owner

## Context

VEM needs a stable wire baseline before product handlers exist. The supported local Codex CLI `0.144.5` was initialized three times against a bounded stdio probe. It requested `2025-06-18`, advertised only the top-level `elicitation` capability, and did not advertise Tasks. It completed initialization when the server echoed `2025-06-18` and when the server selected either `2025-03-26` or `2025-11-25`.

The official MCP versioning page identifies `2025-11-25` as the current stable protocol. The locked production v1 SDK `@modelcontextprotocol/sdk@1.30.0` exposes `2025-11-25` as latest and supports all three tested revisions. Split SDK v2 and the `2026-07-28` wire era were newly released, require explicit opt-in, and are outside this evidence-backed Codex client matrix.

## Proposed decision

- Primary revision: `2025-06-18`, because it is the revision actually requested by the supported Codex client.
- Compatibility revisions: `2025-03-26` and `2025-11-25`, both accepted by the same client and supported by the locked SDK.
- SDK: exact `@modelcontextprotocol/sdk@1.30.0`; upgrades require regeneration of the initialization matrix and all protocol contract tests.
- P0 task mode: `none`. The complete P0 wait path uses a bounded ordinary tool call, MCP cancellation and later journal replay.
- Experimental `2025-11-25` Tasks and later `io.modelcontextprotocol/tasks` extensions remain disabled. A future adapter may expose exactly one explicitly negotiated vocabulary and may never reuse or mix their wire shapes.
- Every session binds to the explicitly negotiated revision. The string `latest` is invalid input and no revision is inferred from SDK defaults after initialization.

## Minimum protocol decisions

- `ProjectRevisionContext.coordinatorSequence` orders events only within one `projectInstanceId`; build and registry revisions are opaque equality identities. `RevisionContext` adds document identity and generation.
- `ConfirmationBinding` binds protocol/project, MCP client session and connection epoch, claim, selection snapshot, document generation, source registry revision, opaque relative-file identity, prompt summary hash, trusted reporter, TTL, state and one consumption. Direct source resolution carries anchor plus evidence hash; degraded resolution instead carries the exact ordered candidate-set hash and chosen rank. The only P0 action is `prepare-source-edit`.
- Confirmation IDs are opaque identifiers whose generator must provide at least 128 bits of unpredictability. Canonical hashes use `vem-confirmation-v1-sha256`; the default TTL is five minutes and the schema rejects any TTL beyond the 15-minute hard limit.
- The minimum EvidenceGraph preserves edge-level observer, observation time, optional document/revision provenance, integrity, freshness, corroboration, conflicts and limitations. Registry membership cannot upgrade a page/DOM binding, and conflicts override high confidence.
- Default context output contains origin, redacted path and bounded summaries only. Query, fragment, raw path, form values, credentials and source paths are excluded.
- Closed Draft 2020-12 schemas reject unknown keys and bound identifiers, strings, arrays, graph nodes/edges, error limitations, source-binding variants and confirmation rank.
- Protocol errors remain JSON-RPC errors; stale/capability/business/provider failures use bounded `VemError` tool execution errors. Structured content always has a compatible bounded text representation.

## Consequences and boundaries

P0-T3 produces specifications, schemas, types, a compatibility matrix and contract tests only. It does not start an MCP server, advertise tools/resources/Tasks, implement coordinator state, claims, confirmation consumption, source resolution, wait replay or product runtime capability. P0-T12A/B/C consume these contracts later.

The project owner explicitly accepted the proposed primary/compatibility revisions, exact SDK and no-Tasks P0 boundary on 2026-07-29.
