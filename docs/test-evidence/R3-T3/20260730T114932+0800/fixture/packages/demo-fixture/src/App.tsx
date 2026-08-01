import { containmentChecks, containmentState } from "./fixtures";

export function App() {
  return (
    <main className="audit-containment-shell">
      <header>
        <small data-r3-task="discovery-warning">Bounded discovery warning</small>
        <h1>Contained runner observations</h1>
      </header>
      <section aria-labelledby="containment-heading">
        <h2 data-r3-task="containment-heading" id="containment-heading">Capsule audit containment</h2>
        <p>
          Permission profile:
          <span data-r3-task="profile-status">{containmentState.profileStatus}</span>
        </p>
        <ul>
          {containmentChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.label}</strong>
              <output>{check.outcome}</output>
            </li>
          ))}
        </ul>
        <p>
          Latest contained category:
          <code data-r3-task="seal-code">{containmentState.sealCode}</code>
        </p>
        <button data-r3-task="evidence-control" type="button">Review contained evidence</button>
      </section>
    </main>
  );
}
