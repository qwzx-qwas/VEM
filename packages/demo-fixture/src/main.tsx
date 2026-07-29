import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { SENSITIVE_PAGE_TITLE } from "./fixtures.js";
import "./styles.css";

document.title = SENSITIVE_PAGE_TITLE;

const root = document.querySelector("#root");
if (!root) throw new Error("DEMO_ROOT_MISSING");

createRoot(root).render(
  <StrictMode><App /></StrictMode>,
);
