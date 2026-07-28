# P0-T0C Atomic Plan

## Eligibility and one-result boundary

- ID/status: `P0-T0C` / `done`; phase `P0` / `in_progress`.
- Dependency: `P0-T0A1` is `done`; P0-T0B is also `done` but is not a declared dependency.
- Direct contract: `EDGE-PREFLIGHT-001`.
- Independently observable result: classify whether WSL can directly launch the real Windows Edge Stable binary with a disposable profile, return an expected DOM sentinel, exit/kill within a hard timeout, clean every task-owned process/profile artifact, and record relevant enterprise-policy impact.
- This task does not install/use Playwright, start a Vite/MCP server, test Windows/WSL HTTP/WebSocket/HMR, install an extension, or access the user's normal Edge profile.

## Capabilities and security/data lifecycle

- Read-only discovery already observed Windows PowerShell `5.1.26100.8655`, Windows `10.0.26200.0`, and Edge Stable `150.0.4078.99` at the standard x86 Program Files path.
- The real smoke uses a unique Windows temporary user-data directory and a task-owned local HTML sentinel. It passes `--no-first-run`, `--no-default-browser-check`, `--headless=new`, `--disable-gpu`, and `--dump-dom` only.
- Discovery found effective Windows script execution policy `Restricted`. The probe therefore launches the standard `msedge.exe` path directly from WSL and uses only fixed inline PowerShell for bounded read-only discovery and marker-scoped cleanup; it neither executes a `.ps1` adapter nor supplies `-ExecutionPolicy Bypass`.
- A hard timeout kills only the process tree launched by the probe; cleanup additionally matches only the unique task profile marker. The profile and HTML/output fixtures are removed in `finally` behavior.
- Policy evidence is read-only and bounded: HKLM/HKCU Edge policy-key presence, property count, and an allowlisted coarse automation-impact classification. No arbitrary registry values, URLs, browser data, command lines, environment dump, cookies, tokens, or raw profile contents are retained.

## Implementation and tests

1. Add a dependency-free Python probe that performs exact binary discovery, version/OS/interop classification, allowlisted policy classification, direct bounded Edge launch/timeout, expected DOM assertion, residue check, and idempotent cleanup.
2. Keep Windows interop fail-closed with fixed inline PowerShell for bounded read-only discovery and marker-scoped cleanup, while launching the real Edge executable directly from WSL so the observed `Restricted` policy is respected rather than bypassed.
3. Add tests for missing binary, interop failure, malformed output, direct-launch nonzero/DOM mismatch, timeout/kill, managed/unmanaged policy fixtures, profile/process cleanup, aggregate mismatch, and secret rejection.
4. Run the real direct Edge smoke from the canonical ext4 Git root, validate shared evidence with both validators, run the bootstrap validator and SHA-256 verification, then update roadmap/status/progress and the corresponding prompt only after all gates pass.

## Pass/block rule

- Pass only when the exact Windows Edge binary exists, version is observed, interop succeeds, the launched process returns the expected DOM sentinel, no task-owned process/profile residue remains, policy impact is machine classified, and all evidence/tests validate.
- Missing binary, interop failure, enterprise-policy block, launch/profile lock, timeout/kill failure, malformed evidence, residue, or indeterminate policy impact stays distinctly classified and prevents completion.
