import { deadlineChecks, deadlineState } from "./fixtures";

export function App() {
  return (
    <main className="attempt-two-deadline-shell">
      <header>
        <small data-r6-attempt-two="margin-label">Observation margin: 120000 ms</small>
        <h1>Attempt-two deadline policy</h1>
      </header>
      <section aria-labelledby="horizon-heading">
        <h2 data-r6-attempt-two="horizon-heading" id="horizon-heading">Bounded provider observation horizon</h2>
        <p>
          Provenance:
          <code data-r6-attempt-two="provenance-code">{deadlineState.provenance}</code>
        </p>
        <ul>
          {deadlineChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.label}</strong>
              <output>{check.outcome}</output>
            </li>
          ))}
        </ul>
        <p>
          Outer deadline:
          <output data-r6-attempt-two="deadline-output">{deadlineState.deadline}</output>
        </p>
        <button data-r6-attempt-two="attempt-binding" type="button">Review attempt-one binding</button>
      </section>
    </main>
  );
}
