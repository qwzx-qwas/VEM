# P0-T17D attempt 2 post-hoc capsule-audit analysis

Date: 2026-07-29

This analysis is outside the preregistered evidence directory and does not alter its plan, inputs, raw events, hashes, canonical bundle, or verdict. The authoritative attempt remains `docs/test-evidence/P0-T17D/20260729T174733+0800/`, whose immutable verdict is `stop`.

## Observed result

- All 10 Codex processes exited successfully with 10 unique thread IDs.
- All 10 structured responses matched evaluator ground truth.
- All 5 VEM responses matched the direct-primary source; wrong attribution was zero.
- VEM was faster on 2 of 5 pairs. Direct median was `41,985,459,470 ns`, VEM median was `44,209,203,458 ns`, median saving was zero, total setup was `119,319,692 ns`, and amortized setup was `23,863,938 ns`.
- Seven runs recorded `CAPSULE_COMMAND_PATH_ESCAPE`, activating the preregistered capsule-integrity stop rule.

## Post-hoc audit finding

An independent read-only replay of the exact audit tokenization found that the seven flagged runs were triggered by source/output strings interpreted as absolute paths:

- `ux-01-manifest-row-1-vem-assisted`: `/`
- `ux-01-manifest-row-2-direct-search`: `/>`
- `ux-02-email-input-1-direct-search`: `/>`
- `ux-02-email-input-2-vem-assisted`: `/`
- `ux-03-safe-route-1-vem-assisted`: `/` and `/projects/:projectId`
- `ux-04-prompt-data-2-vem-assisted`: `/`
- `ux-05-raw-error-1-vem-assisted`: `/`

A separate literal scan of all attempt-two stdout and stderr found no `AGENTS.md`, `SKILL.md`, `/.agents/`, `/.codex/skills/`, `/home/`, `/mnt/`, or `/root/` marker. The observed flags are therefore consistent with an over-broad audit parser matching the redacted route `/`, JSX close syntax `/>`, and a fixture route string—not evidence that the process reached repository, home, rule, or skill paths.

## Decision impact

This is a known audit-quality limitation, not grounds to rewrite the preregistered result. The fail-closed rule was frozen before outcomes were observed, so `P0-VALUE=stop` remains authoritative and P0 fails.

Even if the post-hoc parser interpretation were excluded, attempt 2 independently missed all three preregistered cost conditions: fewer than three VEM-faster pairs, a slower VEM median, and zero median saving relative to setup cost. The counterfactual would therefore be `adjust`, never `continue`.

The follow-up P0-T17E remediation preserves this conclusion. Its active non-authoritative replay is `docs/test-evidence/P0-T17E/20260729T182851+0800/`: all 10 immutable streams pass the versioned v2 audit, while the original `stop` verdict and failed P0 phase remain unchanged.

P0-T17F separately replayed the immutable run/event timing at `docs/test-evidence/P0-T17F/20260729T183822+0800/`. It reproduces the canonical medians and 2/5 VEM-faster result, but the events contain no per-event timestamps; command, token/cache and output-byte counts therefore remain descriptive and cannot attribute total duration to a command or model phase.
