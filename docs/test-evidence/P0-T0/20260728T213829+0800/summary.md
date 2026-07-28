# P0-T0E Private Runtime ACL Summary

- Run: `20260728T213829+0800`
- Direct contract: `EDGE-PREFLIGHT-001`
- Overall result: `pass`; this private-runtime sub-gate permits P0-T0F but does not itself issue the aggregate bootstrap verdict
- Selection: the real owner-private XDG base reports `tmpfs` and was explicitly classified `xdg-non-ext4-rejected`; the selected passwd-home fallback `/home/qwzx/.cache/vem` is ext4
- Runtime root: existing owner UID/GID 1000, device 2096, mode `0700`; it was not chmodded, chowned, deleted or replaced
- Fixture: exclusive no-follow task directory `0700`, regular file `0600`, fixed harmless payload, owner read/write passed
- Other subject: WSL launched its own distribution as root and immediately used `runuser -u nobody`; observed UID 65534 was denied directory traverse, file read, file write and child creation
- Windows mount: staging reports `9p`, the current WSL Windows-mount representation, and `aclEvidenceAccepted` is false regardless of displayed mode bits
- Cleanup: only the known regular fixture and empty task child were removed; cleanup passed twice, existing runtime root identity/mode was preserved and independent task-directory residue was zero
- Tests: all 83 preflight tests passed, including mode drift, wrong owner, symlink escape/no-follow, stale file preservation, cleanup idempotency, XDG selection, Windows mount rejection, subject identity/access, secret and aggregate regressions
- Validation: dependency-free evidence/artifact validation, Draft 2020-12 cross-validation and bootstrap roadmap/requirements/decision/link validation passed
- Deferred boundary: runtime discovery remains P0-T7; aggregate bootstrap verdict remains P0-T0F; no real secret/capability was created
- Task state: `done`
