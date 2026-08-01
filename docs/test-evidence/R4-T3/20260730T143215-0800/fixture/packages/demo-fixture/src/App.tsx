import { transportChecks, transportState } from "./fixtures";

export function App() {
  return (
    <main className="transport-remediation-shell">
      <header>
        <small data-r4-task="reachability-label">Provider reachability not probed</small>
        <h1>Bounded external transport recovery</h1>
      </header>
      <section aria-labelledby="preflight-heading">
        <h2 data-r4-task="preflight-heading" id="preflight-heading">Transport preflight summary</h2>
        <p>
          Retry budget:
          <span data-r4-task="retry-budget">{transportState.retryBudget}</span>
        </p>
        <ul>
          {transportChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.label}</strong>
              <output>{check.outcome}</output>
            </li>
          ))}
        </ul>
        <p>
          Retryable category:
          <code data-r4-task="timeout-code">{transportState.timeoutCode}</code>
        </p>
        <button data-r4-task="attempt-evidence" type="button">Review attempt evidence</button>
      </section>
    </main>
  );
}
