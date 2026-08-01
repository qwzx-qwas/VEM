import { isolationChecks, isolationState } from "./fixtures";

export function App() {
  return (
    <main className="retry-isolation-shell">
      <header>
        <small data-r7-retry="budget-label">Retry authorization is not process start</small>
        <h1>Retry capsule isolation</h1>
      </header>
      <section aria-labelledby="retry-control-root">
        <h2 data-r7-retry="control-root" id="retry-control-root">Per-attempt control root</h2>
        <p>
          Batch sealing:
          <code data-r7-retry="sealing-code">{isolationState.batchSealing}</code>
        </p>
        <ul>
          {isolationChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.label}</strong>
              <output>{check.outcome}</output>
            </li>
          ))}
        </ul>
        <p>
          Final output:
          <output data-r7-retry="final-output">{isolationState.finalOutput}</output>
        </p>
        <button data-r7-retry="history-binding" type="button">Review immutable R6 stop</button>
      </section>
    </main>
  );
}
