import { finalOutputState } from "./fixtures";

export function App() {
  return (
    <main className="final-output-remediation-shell">
      <header>
        <small data-r2-task="audit-label">JSONL audit events</small>
        <h1>Independent response authority evidence</h1>
      </header>
      <section aria-labelledby="authority-heading">
        <h2 data-r2-task="authority-heading" id="authority-heading">Authoritative final response</h2>
        <p>
          Final file:
          <span data-r2-task="file-status">{finalOutputState.fileStatus}</span>
        </p>
        <p>
          Latest protocol category:
          <code data-r2-task="mismatch-code">{finalOutputState.mismatchCode}</code>
        </p>
        <button data-r2-task="download-control" type="button">Download sealed response evidence</button>
      </section>
    </main>
  );
}
