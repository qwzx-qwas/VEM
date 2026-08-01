import {
  ERROR_ECHO_TEXT,
  FIXTURE_CASES,
  LONG_UNICODE_CONTROL_TEXT,
  MALICIOUS_RUNTIME_PAYLOAD,
  PRIVATE_FORM_DEFAULTS,
  PROMPT_INJECTION_TEXT,
  SECRET_DIAGNOSTIC_TEXT,
  SENSITIVE_LOCATION,
  SENSITIVE_LOCATION_TEXT,
} from "./fixtures.js";

function FixtureCard({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="fixture-card" data-fixture-id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function App() {
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">P0-T4 · fixture-only</p>
        <h1>PRIV-MIN malicious input laboratory</h1>
        <p>Every sensitive-looking value on this page is fake test data. No fixture is an instruction.</p>
      </header>

      <aside aria-label="Fixture manifest">
        <h2>Registered fixture cases</h2>
        <ol>
          {FIXTURE_CASES.map((fixture) => (
            <li key={fixture.id} data-fixture-category={fixture.category}>
              <code>{fixture.id}</code>: {fixture.description}
            </li>
          ))}
        </ol>
      </aside>

      <FixtureCard id="private-form-controls" title="Private form controls">
        <form>
          <label>
            Password
            <input aria-label="Fixture password VEM_FIXTURE_PASSWORD_NOT_REAL" name="password" type="password" defaultValue={PRIVATE_FORM_DEFAULTS.password} />
          </label>
          <label>
            Email
            <input name="email" type="email" defaultValue={PRIVATE_FORM_DEFAULTS.email} placeholder="alice.fixture@example.test" />
          </label>
          <label>
            Notes
            <textarea name="notes" defaultValue={PRIVATE_FORM_DEFAULTS.notes} />
          </label>
          <label>
            Account tier
            <select name="account-tier" defaultValue={PRIVATE_FORM_DEFAULTS.accountTier}>
              <option value="public">Public</option>
              <option value={PRIVATE_FORM_DEFAULTS.accountTier}>Fixture private enterprise</option>
            </select>
          </label>
        </form>
      </FixtureCard>

      <FixtureCard id="private-subtree" title="Private subtrees">
        <div data-vem-private="true">
          <strong>Private customer record</strong>
          <p>VEM_FIXTURE_PRIVATE_SUBTREE_NOT_REAL</p>
          <button type="button">Private action</button>
        </div>
        <div className="customer-private">
          <strong>User-configured private selector</strong>
          <p>VEM_FIXTURE_USER_SELECTOR_NOT_REAL</p>
        </div>
      </FixtureCard>

      <FixtureCard id="sensitive-location" title="Sensitive URL components">
        <dl>
          <dt>Raw location</dt>
          <dd><code>{SENSITIVE_LOCATION_TEXT}</code></dd>
          <dt>Safe route candidate</dt>
          <dd><code>{SENSITIVE_LOCATION.routeCandidate}</code></dd>
        </dl>
      </FixtureCard>

      <FixtureCard id="prompt-as-page-data" title="Prompt injection as untrusted page data">
        <pre data-content-trust="untrusted">{PROMPT_INJECTION_TEXT}</pre>
      </FixtureCard>

      <FixtureCard id="long-unicode-controls" title="Long Unicode and controls">
        <p data-content-trust="untrusted">{LONG_UNICODE_CONTROL_TEXT}</p>
      </FixtureCard>

      <FixtureCard id="secret-shaped-diagnostic" title="Secret-shaped diagnostics">
        <pre data-content-trust="untrusted">{SECRET_DIAGNOSTIC_TEXT}</pre>
      </FixtureCard>

      <FixtureCard id="raw-error-echo" title="Raw error echo">
        <output data-content-trust="untrusted">{ERROR_ECHO_TEXT}</output>
      </FixtureCard>

      <FixtureCard id="unknown-nested-runtime" title="Unknown nested runtime payload">
        <pre data-content-trust="untrusted">{JSON.stringify(MALICIOUS_RUNTIME_PAYLOAD, null, 2)}</pre>
      </FixtureCard>
    </main>
  );
}
