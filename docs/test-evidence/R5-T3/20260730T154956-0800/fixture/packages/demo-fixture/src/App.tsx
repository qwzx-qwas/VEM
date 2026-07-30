import { terminalChecks, terminalState } from "./fixtures";

export function App() {
  return (
    <main className="process-terminal-shell">
      <header>
        <small data-r5-task="grace-label">Grace window: five seconds</small>
        <h1>Bounded process termination recovery</h1>
      </header>
      <section aria-labelledby="deadline-heading">
        <h2 data-r5-task="deadline-heading" id="deadline-heading">Runner-owned deadline summary</h2>
        <p>
          Signal ladder:
          <code data-r5-task="signal-ladder">{terminalState.signalLadder}</code>
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
          Process tree:
          <output data-r5-task="tree-state">{terminalState.treeState}</output>
        </p>
        <button data-r5-task="sealed-evidence" type="button">Review sealed terminal evidence</button>
      </section>
    </main>
  );
}
