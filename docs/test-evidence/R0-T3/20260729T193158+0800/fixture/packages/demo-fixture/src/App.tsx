import { recoveryCases, recoveryState } from "./fixtures";

export function App() {
  return (
    <main className="recovery-shell">
      <header>
        <p>Independent recovery research fixture</p>
        <h1>Runner receipt review</h1>
      </header>
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading">Recovery summary</h2>
        <dl>
          <div>
            <dt>Current synchronization</dt>
            <dd><strong data-recovery-task="sync-state">{recoveryState.syncState}</strong></dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd><a data-recovery-task="owner-link" href={recoveryState.ownerPath}>Open recovery owner</a></dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="queue-heading">
        <h2 id="queue-heading">Probe queue</h2>
        <ul>
          {recoveryCases.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>
              <code>{item.status}</code>
            </li>
          ))}
        </ul>
        <button data-recovery-task="retry-control" type="button">Retry bounded probe</button>
      </section>
      <section aria-labelledby="operator-heading">
        <h2 id="operator-heading">Operator review</h2>
        <label>
          Private operator note
          <textarea data-recovery-task="private-note" defaultValue={recoveryState.privateNote} />
        </label>
        <p>
          Latest observation:
          <output data-recovery-task="last-observation">{recoveryState.lastObservation}</output>
        </p>
      </section>
    </main>
  );
}
