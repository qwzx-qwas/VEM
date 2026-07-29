# ADR 0003: Playwright Windows Edge Stable channel gate

- Status: Accepted
- Date: 2026-07-29
- Contracts: `EDGE-PREFLIGHT-001`
- Depends on: ADR 0001 exact Node/pnpm decision and the P0-T0F aggregate preflight verdict

## Context

P0-T0C proved a direct Windows Edge binary smoke, not Playwright automation. P0-T0G must independently prove that the locked workspace can drive the installed Windows Edge Stable through Playwright's formal `msedge` channel in both required display modes, without using the user's browser profile or weakening cleanup and policy checks.

## Decision

- Playwright is fixed at exact version `1.62.0`; its Apache-2.0 package metadata remains inside the workspace dependency audit.
- The installed Windows Edge Stable is selected only with Playwright `channel: "msedge"`. A bundled Chromium executable, explicit `executablePath`, CDP attachment or remote-debugging-port substitute cannot satisfy the gate.
- One `headless: true` and one `headless: false` launch are required. Each uses an isolated task-owned profile and an in-page sentinel assertion, and both must report the same browser version as independent Edge Stable discovery.
- A checksum-verified official portable Windows Node `24.18.0` runs a bounded task-local copy of locked `playwright-core` and the runner from Windows TEMP. This is a gate harness, not a system installation or product runtime.
- The runner removes Playwright's default `--no-sandbox` argument instead of weakening the Edge sandbox.
- Enterprise policy is classified independently. An unmanaged machine is acceptable, while discovery or policy uncertainty blocks the gate.
- The probe closes each persistent context and removes task profiles, staged modules and matching residual Edge processes. Any remaining owned process, profile or staging directory fails the gate.

Directly spawning Windows Edge from WSL Node through Playwright's pipe transport was tested and rejected because Edge exited before opening the required debugging pipe. That failed seam is not evidence of success and is not a fallback. The accepted Windows-side harness preserves Playwright's native launch contract while keeping execution and cleanup in a bounded task-owned temporary directory.

## Evidence and acceptance

- `playwright-results.json` records exact tool versions, Edge identity, channel, both mode verdicts, policy classification and cleanup.
- `environment.json` uses the shared closed preflight schema and hashes this ADR, the exact lockfile, probe, runner and detailed result.
- Both required modes and cleanup must be `pass`; the shared overall result is machine-derived and must also be `pass`.
- The retained evidence contains no portable Node binary, browser profile, raw environment dump or credential material.

## Consequences and boundaries

- The product topology remains WSL Node/Vite/MCP plus Windows Edge; Windows Node is limited to this preflight harness.
- P0-T0G adds no selector, protocol, extension, source-resolution or other product capability.
- A direct Edge smoke or Playwright-bundled Chromium cannot override a failed `msedge` channel result.
- A future Playwright, Node or Edge-channel decision requires a new recorded decision plus regenerated evidence and tests.
