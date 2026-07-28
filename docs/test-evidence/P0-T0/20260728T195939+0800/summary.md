# P0-T0B Package, Filesystem, and Watcher Profile Summary

- Run: `20260728T195939+0800`
- Canonical profile: `/home/qwzx/src/VEM`, ext4, WSL runner owner `qwzx`
- Direct contract: `EDGE-PREFLIGHT-001`
- Overall result: `pass`; this package/network/filesystem sub-gate permits the later P0-T1 workspace task, but roadmap dependencies still require P0-T0C through P0-T0F first
- Registry/default CA: HTTPS 200 for exact pnpm `10.34.0`; no HTTP/HTTPS/no-proxy setting was configured; only boolean proxy presence and bounded response size/hash were retained
- Package manager: isolated temporary `COREPACK_HOME`; exact pnpm `10.34.0`; lockfile SHA-256 `88818e6e51b71df8b8120ce055aeb14e3fdccc193f10d1ba65bc0e3b294ed5fc`; `is-number@7.0.0` frozen install passed
- Network diagnostic: the 4,582,819-byte pnpm tarball measured about 30,395 bytes/second on a 1 MiB bounded sample, so the isolated bootstrap timeout was set to 300 seconds; no global proxy or CA state changed
- Filesystem: ext4, 992,385,945,600 bytes available, case-sensitive, symlink and greater-than-260-character path probes passed
- Watcher readiness: native `node:fs.watch`, polling disabled, 10 iterations each for create/modify/rename, 30 events total, p50 `0.290 ms`, p95 `0.564 ms`
- Cleanup: temporary package and watcher fixtures were removed; a regression test proves blocked package activation also takes the cleanup path
- Tests: 36 complete preflight tests passed, including DNS/TLS/proxy/timeout classification, wrong-CA classification, case/symlink/long-path behavior, watcher sample integrity, secret rejection, isolated Corepack, failure short-circuit, evidence construction, and timeout cleanup
- Validation: dependency-free evidence/artifact validation passed; Draft 2020-12 cross-validation passed; bootstrap roadmap/requirements/decision/link validation passed
- Security/data boundary: no environment dump, raw CA, registry credential, proxy URL, response header/cookie, package fixture, node_modules tree, or unbounded command log was retained
- Browser boundary: no Edge process was launched; direct Edge classification remains P0-T0C, cross-OS HTTP/WebSocket/HMR remains P0-T0D, ACL remains P0-T0E, and only P0-T0F may issue the aggregate preflight verdict
- Task state: `done`
