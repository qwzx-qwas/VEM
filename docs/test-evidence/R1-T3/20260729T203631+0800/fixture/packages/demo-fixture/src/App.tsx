import { runnerChecks, runnerState } from "./fixtures";

export function App() {
  return (
    <main className="runner-remediation-shell">
      <header>
        <small data-r1-task="boundary-label">Independent R1 runner remediation</small>
        <h1>Sealed execution evidence</h1>
      </header>
      <section aria-labelledby="finalization-heading">
        <h2 data-r1-task="finalization-heading" id="finalization-heading">Final-response selection</h2>
        <p>
          Evidence streams:
          <span data-r1-task="stream-status">{runnerState.streamStatus}</span>
        </p>
        <ul>
          {runnerChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.label}</strong>
              <output>{check.outcome}</output>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="failure-heading">
        <h2 id="failure-heading">Failure replay</h2>
        <p>
          Latest synthetic category:
          <code data-r1-task="failure-code">{runnerState.failureCode}</code>
        </p>
        <button data-r1-task="export-control" type="button">Export sealed evidence</button>
      </section>
    </main>
  );
}
