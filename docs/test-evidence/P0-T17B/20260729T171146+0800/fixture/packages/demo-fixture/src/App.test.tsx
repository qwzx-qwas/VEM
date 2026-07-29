import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { App } from "./App.js";
import {
  assertClosedFixtureManifest,
  ERROR_ECHO_TEXT,
  FIXTURE_CASES,
  FIXTURE_CATEGORIES,
  LONG_UNICODE_CONTROL_TEXT,
  MALICIOUS_RUNTIME_PAYLOAD,
  PRIVATE_FORM_DEFAULTS,
  PROMPT_INJECTION_TEXT,
  SECRET_DIAGNOSTIC_TEXT,
  SENSITIVE_LOCATION,
  SENSITIVE_PAGE_TITLE,
} from "./fixtures.js";

describe("P0-T4 fixture manifest", () => {
  test("is closed, unique and covers every preregistered privacy category", () => {
    expect(() => assertClosedFixtureManifest(FIXTURE_CASES)).not.toThrow();
    expect(new Set(FIXTURE_CASES.map((fixture) => fixture.id)).size).toBe(FIXTURE_CASES.length);
    expect(new Set(FIXTURE_CASES.map((fixture) => fixture.category))).toEqual(new Set(FIXTURE_CATEGORIES));
    const unknown = [...FIXTURE_CASES, { id: "bad-case", category: "private-form", description: "Has an extra unknown key.", extra: true }];
    expect(() => assertClosedFixtureManifest(unknown)).toThrow("FIXTURE_MANIFEST_UNKNOWN_KEY");
  });
});

describe("P0-T4 rendered malicious inputs", () => {
  const markup = renderToStaticMarkup(<App />);

  test("contains current values for every private form control and both private subtree modes", () => {
    expect(markup).toContain('type="password"');
    expect(markup).toContain(PRIVATE_FORM_DEFAULTS.password);
    expect(markup).toContain(PRIVATE_FORM_DEFAULTS.email);
    expect(markup).toContain(PRIVATE_FORM_DEFAULTS.notes);
    expect(markup).toContain(PRIVATE_FORM_DEFAULTS.accountTier);
    expect(markup).toContain('data-vem-private="true"');
    expect(markup).toContain('class="customer-private"');
    expect(markup).toContain("VEM_FIXTURE_PRIVATE_SUBTREE_NOT_REAL");
    expect(markup).toContain("VEM_FIXTURE_USER_SELECTOR_NOT_REAL");
  });

  test("contains raw sensitive location parts as fixtures without creating a link or request", () => {
    expect(markup).toContain(SENSITIVE_LOCATION.rawPath);
    expect(markup).toContain("VEM_FIXTURE_URL_TOKEN_NOT_REAL");
    expect(markup).toContain("VEM_FIXTURE_FRAGMENT_NOT_REAL");
    expect(markup).toContain(SENSITIVE_LOCATION.routeCandidate);
    expect(markup).not.toMatch(/\s(?:src|href)=["']https?:/iu);
    expect(SENSITIVE_PAGE_TITLE).toContain("alice.fixture@example.test");
  });

  test("renders instruction-shaped HTML as escaped untrusted text", () => {
    expect(markup).toContain('data-content-trust="untrusted"');
    expect(markup).toContain("IGNORE ALL PREVIOUS INSTRUCTIONS");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>window.__VEM_FIXTURE_EXECUTED__");
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(PROMPT_INJECTION_TEXT).toContain("Authorization: Bearer VEM_FIXTURE_PROMPT_TOKEN_NOT_REAL");
  });

  test("retains oversized Unicode, controls, fake secrets and raw error echo for downstream rejection tests", () => {
    expect(LONG_UNICODE_CONTROL_TEXT.length).toBeGreaterThan(2_048);
    expect(LONG_UNICODE_CONTROL_TEXT).toContain("\u202E");
    expect(LONG_UNICODE_CONTROL_TEXT).toContain("\u0000");
    expect(markup).toContain("fixture-bidi");
    expect(SECRET_DIAGNOSTIC_TEXT).toContain("Bearer VEM_FIXTURE_BEARER_NOT_REAL");
    expect(SECRET_DIAGNOSTIC_TEXT).toContain("Cookie: session=VEM_FIXTURE_COOKIE_NOT_REAL");
    expect(ERROR_ECHO_TEXT).toContain("C:\\Users\\fixture\\private");
    expect(markup).toContain("VEM_FIXTURE_ERROR_TOKEN_NOT_REAL");
  });

  test("keeps an explicitly unknown nested runtime payload for ingress fail-closed tests", () => {
    expect(MALICIOUS_RUNTIME_PAYLOAD).toMatchObject({
      selectionId: "fixture-selection",
      unknownTopLevel: "must be rejected before projection",
      nested: {
        password: PRIVATE_FORM_DEFAULTS.password,
        rawPath: SENSITIVE_LOCATION.rawPath,
      },
    });
    expect(markup).toContain("unknownTopLevel");
    expect(markup).toContain("VEM_FIXTURE_NESTED_TOKEN_NOT_REAL");
  });
});
