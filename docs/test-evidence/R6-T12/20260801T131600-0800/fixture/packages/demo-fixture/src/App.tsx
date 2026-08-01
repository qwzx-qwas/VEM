import { failureChecks, failureState } from "./fixtures";

export function App() {
  return (
    <main className="attempt-four-terminal-shell">
      <header>
        <small data-r6-attempt-four="evidence-label">Evidence: conjunctive and sealed</small>
        <h1>Attempt-four provider-terminal policy</h1>
      </header>
      <section aria-labelledby="policy-heading">
        <h2 data-r6-attempt-four="policy-heading" id="policy-heading">Non-timeout terminal policy</h2>
        <p>
          Timeout separation:
          <code data-r6-attempt-four="timeout-code">{failureState.timeoutSeparation}</code>
        </p>
        <ul>
          {failureChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.label}</strong>
              <output>{check.outcome}</output>
            </li>
          ))}
        </ul>
        <p>
          Selected class:
          <output data-r6-attempt-four="terminal-output">{failureState.selectedClass}</output>
        </p>
        <button data-r6-attempt-four="attempt-binding" type="button">Review attempt-three binding</button>
      </section>
    </main>
  );
}
