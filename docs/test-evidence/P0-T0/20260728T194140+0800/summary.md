# P0-T0A2 Evidence and Toolchain Summary

- Run: `20260728T194140+0800`
- Canonical Git root/profile: `/home/qwzx/src/VEM`, ext4, WSL runner owner `qwzx`
- Direct contract: `EDGE-PREFLIGHT-001`
- Schema: closed bounded JSON Schema/validator v`1.0.0`; standard Draft 2020-12 cross-validation passed
- Target tests: 20 passed, including invalid schema, unknown key/result, version range/mismatch, path traversal, aggregate mismatch, duplicate key, depth, bearer/credential URL/camelCase secret-key and no-pnpm-execution cases
- Bootstrap validation: passed for 9 phases, 136 tasks, 25 contracts, dependency/decision chains, bidirectional mappings, normative headings and 27 internal links
- Node candidate: exact `24.18.0`; locally observed `24.18.0`; official 24.x LTS release source recorded
- pnpm candidate: exact `10.34.0`; activation fixed as `corepack prepare pnpm@10.34.0 --activate`
- Local machine classification: `pass`
- Package-manager boundary: pnpm activation, registry access and `pnpm --version` were not run; those are P0-T0B evidence
- Browser boundary: no Edge/Playwright/network probe or browser capability claim
- Security/data boundary: no environment dump, registry auth, token, cookie, password, private key, credential URL or unbounded raw log is retained; artifact paths are canonical-root-relative and hashed
- Owner decision: accepted Node `24.18.0` and pnpm `10.34.0`; see `owner-decision.json`
- Task state: `done`
