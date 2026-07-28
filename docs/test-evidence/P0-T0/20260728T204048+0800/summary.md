# P0-T0C Edge Stable Direct Launch Summary

- Run: `20260728T204048+0800`
- Canonical profile: `/home/qwzx/src/VEM`, ext4, WSL runner owner `qwzx`
- Direct contract: `EDGE-PREFLIGHT-001`
- Overall result: `pass`; this binary-smoke sub-gate permits P0-T0D but does not issue the aggregate P0-T0F verdict
- Interop: Windows `Microsoft Windows NT 10.0.26200.0`, PowerShell `5.1.26100.8655`, effective script ExecutionPolicy `Restricted`
- Browser: real Windows Edge Stable `150.0.4078.99` from the standard x86 Program Files path; no Chromium substitute or Playwright
- Launch: direct WSL invocation with `--headless=new`, isolated task-owned profile, local HTML sentinel, exit code 0, expected DOM observed, 116 bounded stdout bytes, zero stderr bytes
- Policy: HKLM/HKCU Edge policy inspection was allowlisted and read-only; no relevant keys or properties were present, so the classification is `unmanaged`
- Cleanup: Edge reported no marker-owned residue before or after cleanup, the temporary profile was removed, and an independent Windows residue query returned `tempCount=0 processCount=0`
- Tests: all 52 preflight tests passed, including failure classification, timeout, command ordering, cleanup, aggregate consistency, secret rejection, and existing package/filesystem/evidence regressions
- Validation: dependency-free evidence/artifact validation passed; Draft 2020-12 cross-validation passed; bootstrap roadmap/requirements/decision/link validation passed
- Security/data boundary: no script-policy bypass, `.ps1` execution, user browser profile, registry write, `--no-sandbox`, remote-debugging port, raw DOM/stderr, arbitrary registry value, command line, environment dump, cookie, token, or browser data was retained
- Deferred boundary: HTTP/WebSocket/HMR and two-process reachability remain P0-T0D; runtime ACL remains P0-T0E; Playwright `channel: msedge` remains P0-T0G
- Task state: `done`
