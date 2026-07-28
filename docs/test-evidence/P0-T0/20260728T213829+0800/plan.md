# P0-T0E Atomic Plan

## Task identity and observable boundary

- ID/status: `P0-T0E` / `done`; phase `P0` / `in_progress`.
- Dependency: P0-T0A1 is `done`; P0-T0B–D are also complete but are not declared dependencies. No phase dependency or decision gate applies.
- Direct contract: `EDGE-PREFLIGHT-001`, mapped bidirectionally between `ROADMAP.yaml` and `docs/requirements.yaml`; authoritative text is `docs/DESIGN.md` sections 3.1 and 3.1.1 plus `docs/adr/0001-edge-execution-preflight.md`.
- Observable result: prove a task-owned runtime fixture under `${XDG_RUNTIME_DIR:-$HOME/.cache}/vem` uses ext4, the effective owner, directory `0700`, file `0600`, owner read/write, actual non-owner denial and idempotent cleanup, while a Windows-mounted `9p`/DrvFS path is rejected as POSIX ACL evidence.

## Existing capability and safe target

- The effective user is `qwzx` UID/GID 1000. The real command environment has an owner-private XDG base on `tmpfs`, which cannot supply this task's required ext4 evidence. The probe records `xdg-non-ext4-rejected` and explicitly selects the documented owner-derived fallback `/home/qwzx/.cache/vem`, which already exists as ext4, owner 1000:1000, mode `0700`; no environment dump or XDG path value is retained. An XDG candidate on `9p`/DrvFS remains a hard failure without fallback.
- The existing runtime root is user data and will not be deleted, recursively cleaned, chmodded or chowned. The probe creates one exclusive `.preflight-*` child with `0700` and one fixed harmless fixture with `0600`, then deletes only that known file and empty child.
- `sudo -n` cannot switch subjects, but the Tier-1 WSL runner can invoke its own distribution through `wsl.exe -u root`; the probe immediately uses `runuser -u nobody` and verifies observed UID 65534 before testing traverse/read/write/create denial. It never performs a root-owned write or changes ownership.
- `/mnt/d/VEM` reports filesystem type `9p`, the current WSL Windows-mount representation. The probe performs read-only classification and must reject `9p` and `drvfs` as ACL evidence regardless of displayed mode bits.

## Capability, trust, privacy and lifecycle

- Runtime selection accepts only an absolute owner-derived XDG path or the passwd-derived home fallback, rejects symlink components/escape, wrong owner and group/other permission bits, and never trusts `$HOME` text. A non-ext4, non-Windows XDG base is visibly rejected for this ext4 gate before selecting the home fallback; a Windows-mounted XDG base fails closed.
- The fixture uses exclusive no-follow creation, a fixed non-secret payload, owner read/write checks and closed bounded observations. No token, capability, socket, project discovery record, environment dump, directory listing, unrelated filename, ACL body or secret is created or retained.
- Other-subject commands use argv arrays and a fixed `nobody` identity. A missing root/drop capability, unexpected UID, successful traverse/read/write/create, ambiguous exit, or remaining task child is separately classified and prevents pass; no chmod relaxation or owner-only simulated assertion is accepted as fallback.
- Cleanup is conservative and idempotent: it unlinks only the exact known regular fixture, refuses symlinks or unexpected stale entries, removes only the empty task child, confirms the existing runtime root remains, and repeats successfully. No persistent lifecycle, runtime discovery or product protocol is introduced.

## Planned changes and tests

1. Add a dependency-free Python probe for runtime selection, filesystem/owner/mode validation, secure fixture creation, owner access, real WSL root-to-`nobody` denial checks, Windows-mount evidence rejection, conservative cleanup and shared preflight evidence emission.
2. Add fixtures for mode drift, symlink escape, wrong owner, stale/unexpected file, cleanup idempotency, Windows `9p`/DrvFS rejection, ext4 acceptance, malformed subject UID/result, denied and unexpectedly allowed access, aggregate mismatch and secret rejection.
3. Run the real probe without altering the existing runtime root, verify zero `.preflight-*` residue and unchanged root identity/mode, run the complete preflight suite, both evidence validators, bootstrap validation and SHA-256 verification.

## Pass/block rule

- Pass only when the selected runtime root and child are ext4 and owner-private, the fixture is owner-private and owner-readable/writable, UID 65534 is observed and denied directory traverse, file read/write and child creation, the Windows mount is explicitly rejected, cleanup succeeds twice and the pre-existing root remains unchanged.
- Any symlink, non-ext4 selected root, wrong owner/mode, unavailable or ambiguous subject drop, unexpected non-owner access, unsafe stale entry or cleanup residue fails closed. This task does not implement runtime discovery, store a real secret, claim product ACL behavior, or issue the aggregate P0-T0F verdict.
