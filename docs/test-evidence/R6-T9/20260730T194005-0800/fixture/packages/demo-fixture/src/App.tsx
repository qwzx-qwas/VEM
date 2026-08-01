import { terminalChecks, terminalState } from "./fixtures";

export function App() {
  return (
    <main className="attempt-three-terminal-shell">
      <header>
        <small data-r6-attempt-three="receipt-label">Correlation: ordered receipts</small>
        <h1>Attempt-three terminal policy</h1>
      </header>
      <section aria-labelledby="fallback-heading">
        <h2 data-r6-attempt-three="fallback-heading" id="fallback-heading">WebSocket to HTTPS fallback boundary</h2>
        <p>
          Envelope:
          <code data-r6-attempt-three="envelope-code">{terminalState.envelope}</code>
        </p>
        <ul>
          {terminalChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.label}</strong>
              <output>{check.outcome}</output>
            </li>
          ))}
        </ul>
        <p>
          Observed lower bound:
          <output data-r6-attempt-three="lower-bound-output">{terminalState.lowerBound}</output>
        </p>
        <button data-r6-attempt-three="attempt-binding" type="button">Review attempt-two binding</button>
      </section>
    </main>
  );
}
