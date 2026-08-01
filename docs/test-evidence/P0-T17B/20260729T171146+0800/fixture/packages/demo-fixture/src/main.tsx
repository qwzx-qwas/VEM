import { createInjectedSelector } from "@vem/injected-selector";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { SENSITIVE_LOCATION, SENSITIVE_PAGE_TITLE } from "./fixtures.js";
import "./styles.css";

document.title = SENSITIVE_PAGE_TITLE;

const root = document.querySelector("#root");
if (!root) throw new Error("DEMO_ROOT_MISSING");

createRoot(root).render(
  <StrictMode><App /></StrictMode>,
);

const selector = createInjectedSelector({
  document,
  window,
  revision: {
    projectInstanceId: "p0-t5-demo-project",
    coordinatorSequence: 1,
    buildRevision: "p0-t5-demo-build",
    sourceRegistryRevision: "registry-unavailable-p0-t5",
    documentId: "p0-t5-demo-document",
    documentGeneration: "p0-t5-demo-generation",
  },
  routeCandidate: SENSITIVE_LOCATION.routeCandidate,
  privateSelectors: [".customer-private"],
});

selector.start();

if (import.meta.hot) import.meta.hot.dispose(() => selector.stop());
