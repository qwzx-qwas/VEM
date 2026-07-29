# P0-T4 evidence summary

## Delivered fixture

- Private `@vem/demo-fixture` workspace package using exact React/React DOM `19.2.8`, Vite `8.1.5` and plugin-react `6.0.4`.
- Nine stable fixture IDs and a closed category union covering private forms, `data-vem-private`, a user private selector, URL secrets, prompt injection, Unicode/control overflow, secret-shaped diagnostics, raw error echo and unknown nested runtime payloads.
- Password, input, textarea and select current values; sensitive accessible name/placeholder/title/path/query/fragment; fake bearer/cookie/CSS URL tokens; Windows-like raw path; oversized combining/emoji/bidi/control text.
- React renders all instruction-shaped content as text. SSR proves the script-shaped payload is escaped, and rendered markup contains no external `src` or `href`.
- A real Vite production build plus bounded verifier: 17 transformed modules, four files, 1,053,984 total bytes including sourcemap, no external URL in entry HTML, 1.5 MB and 12-file hard caps.

## Verification

- Six P0-T4 tests and 31 existing tests passed across seven source test files.
- Seven workspace/license tests, root build/typecheck/lint, workspace/roadmap validation, 224-package license audit, offline clean frozen install and 98 bootstrap preflight regressions passed.
- Generated `dist` and `dist-types` are excluded from Git, lint, duplicate test collection and clean-install fixture copying.

## Failure calibration retained

The first build verifier run correctly failed because a 1 MB total-output cap included the 855 KB sourcemap. The final hard cap is 1.5 MB, while the executable JavaScript remains about 196 KB. The first root test run also exposed duplicate collection from `dist-types`; generated compiler output is now explicitly excluded while source tests remain compiled and executed.

## Privacy and safety

Every credential-like value contains the `VEM_FIXTURE` namespace and is intentionally fake. The app makes no external fetch, link, image, stylesheet or script request. The unsafe data is deliberately present only so later selector/proxy/MCP boundaries can prove fail-closed redaction and untrusted-data marking.

## Boundary

P0-T4 is fixture-only. It does not implement or claim selector, privacy projection, proxy, MCP, Vite marker transform, source registry, browser automation, production non-participation or any other runtime capability.
