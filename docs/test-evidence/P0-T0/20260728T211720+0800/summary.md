# P0-T0D Windows/WSL Network and Restart Summary

- Run: `20260728T211720+0800`
- Canonical profile: WSL Node `24.18.0` on `/home/qwzx/src/VEM` ext4 plus Windows Edge Stable `150.0.4078.99`
- Direct contract: `EDGE-PREFLIGHT-001`
- Overall result: `pass`; this network/restart sub-gate permits P0-T0E but does not issue the aggregate P0-T0F verdict
- Topology: WSL server PIDs `36352` and `36391`; independently observed Windows Edge PIDs `24720` and `40428`; no same-process substitute
- Transport: both generations used the same OS-assigned `127.0.0.1` port `46335`; Windows Edge reached it through `http://localhost`, completed a strict same-origin WebSocket upgrade, received a generation/update-correlated native-watch frame, acknowledged it over HTTP and returned the expected DOM sentinel
- Restart: Windows observed the port open for each generation and closed after each server exit; generation IDs, update IDs and WSL process IDs changed while the port was deliberately reused
- Isolation: the live port refused the WSL non-loopback IPv4 path; no fallback to `0.0.0.0`, a public bind, polling, Chromium or same-process simulation occurred
- Filesystem adjustment: an initial bounded run machine-classified `watch-timeout` when the watch fixture shared Windows temporary DrvFS storage; the final probe places only Edge profiles there and keeps the watched fixture in canonical-root-adjacent ext4
- Cleanup: WSL temp/server residue and Windows Edge profile/process residue all independently measured zero; both Edge and server generations exited with code 0
- Tests: all 67 preflight tests passed, including real server HTTP/WebSocket/watch/ACK, invalid origin, blocked identity, restart, loopback, cleanup, secret, Edge, package/filesystem and evidence regressions
- Validation: dependency-free evidence/artifact validation, Draft 2020-12 cross-validation and bootstrap roadmap/requirements/decision/link validation passed
- Deferred boundary: private runtime ACL remains P0-T0E; aggregate bootstrap verdict remains P0-T0F; Playwright `channel: msedge` remains P0-T0G
- Task state: `done`
