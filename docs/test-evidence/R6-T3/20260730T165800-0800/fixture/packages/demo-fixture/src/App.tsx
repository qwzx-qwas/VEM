import { invocationChecks, invocationState } from "./fixtures";

export function App() {
  return (
    <main className="invocation-contract-shell">
      <header>
        <small data-r6-task="path-label">Outer PATH: /usr/bin:/bin</small>
        <h1>Pre-spawn invocation contract recovery</h1>
      </header>
      <section aria-labelledby="env-heading">
        <h2 data-r6-task="env-heading" id="env-heading">Fixed outer invocation environment</h2>
        <p>
          Shared validator:
          <code data-r6-task="predicate-code">{invocationState.predicate}</code>
        </p>
        <ul>
          {invocationChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.label}</strong>
              <output>{check.outcome}</output>
            </li>
          ))}
        </ul>
        <p>
          Preflight:
          <output data-r6-task="preflight-state">{invocationState.preflight}</output>
        </p>
        <button data-r6-task="compatibility-evidence" type="button">Review compatibility evidence</button>
      </section>
    </main>
  );
}
