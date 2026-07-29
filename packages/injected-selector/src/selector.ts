import type { RevisionContext } from "@vem/protocol";
import {
  buildSelectionSummary,
  inspectSelectableTarget,
  safeSelectorError,
  validatePrivateSelectors,
} from "./privacy.js";
import { EphemeralSelectionStore } from "./store.js";
import type {
  InjectedSelectionSummary,
  InjectedSelectorConfig,
  InjectedSelectorController,
  SafeSelectorError,
  SelectionInteractionKind,
  SelectionResult,
} from "./types.js";

const DEFAULT_MAX_TEXT_CHARS = 256;
const DEFAULT_MAX_SUMMARY_BYTES = 8_192;

interface Overlay {
  host: HTMLElement;
  box: HTMLElement;
  status: HTMLElement;
}

export function createInjectedSelector(config: InjectedSelectorConfig): InjectedSelectorController {
  return new InjectedSelector(config);
}

class InjectedSelector implements InjectedSelectorController {
  readonly #document: Document;
  readonly #window: Window;
  readonly #privateSelectors: readonly string[];
  readonly #routeCandidate: string | undefined;
  readonly #maxTextChars: number;
  readonly #maxSummaryBytes: number;
  readonly #now: () => string;
  readonly #idFactory: () => string;
  readonly #onSelection: ((summary: InjectedSelectionSummary) => void) | undefined;
  readonly #store: EphemeralSelectionStore;
  #overlay: Overlay | undefined;
  #started = false;
  #animationFrame: number | undefined;
  #latestPointer: { x: number; y: number } | undefined;

  constructor(config: InjectedSelectorConfig) {
    this.#document = config.document;
    this.#window = config.window;
    this.#privateSelectors = Object.freeze([...(config.privateSelectors ?? [])]);
    validatePrivateSelectors(this.#document, this.#privateSelectors);
    this.#routeCandidate = config.routeCandidate;
    this.#maxTextChars = boundedInteger(config.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS, 1, 512, "MAX_TEXT_CHARS_INVALID");
    this.#maxSummaryBytes = boundedInteger(config.maxSummaryBytes ?? DEFAULT_MAX_SUMMARY_BYTES, 1_024, 16_384, "MAX_SUMMARY_BYTES_INVALID");
    this.#now = config.now ?? (() => new Date().toISOString());
    this.#idFactory = config.idFactory ?? (() => this.#window.crypto.randomUUID());
    this.#onSelection = config.onSelection;
    this.#store = new EphemeralSelectionStore(config.revision);
  }

  get activeSelectionId(): string | undefined {
    return this.#store.activeSelectionId;
  }

  get selectionCount(): number {
    return this.#store.size;
  }

  start(): void {
    if (this.#started) return;
    this.#overlay = createOverlay(this.#document);
    this.#document.documentElement.append(this.#overlay.host);
    this.#document.addEventListener("pointermove", this.#onPointerMove, true);
    this.#document.addEventListener("click", this.#onClick, true);
    this.#document.addEventListener("keydown", this.#onKeyDown, true);
    this.#window.addEventListener("pagehide", this.#onPageHide);
    this.#started = true;
  }

  stop(): void {
    if (!this.#started) {
      this.clear();
      return;
    }
    this.#document.removeEventListener("pointermove", this.#onPointerMove, true);
    this.#document.removeEventListener("click", this.#onClick, true);
    this.#document.removeEventListener("keydown", this.#onKeyDown, true);
    this.#window.removeEventListener("pagehide", this.#onPageHide);
    if (this.#animationFrame !== undefined) this.#window.cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
    this.#latestPointer = undefined;
    this.#overlay?.host.remove();
    this.#overlay = undefined;
    this.#started = false;
    this.clear();
  }

  preview(element: Element): SafeSelectorError | null {
    const inspected = inspectSelectableTarget(element, this.#window, this.#privateSelectors);
    if ("code" in inspected) {
      this.#hideOverlay();
      return inspected;
    }
    const overlay = this.#overlay;
    if (!overlay) return null;
    overlay.box.style.transform = `translate(${inspected.box.x}px, ${inspected.box.y}px)`;
    overlay.box.style.width = `${inspected.box.width}px`;
    overlay.box.style.height = `${inspected.box.height}px`;
    overlay.box.hidden = false;
    overlay.status.textContent = "Page-untrusted target; trusted external confirmation is required before editing.";
    return null;
  }

  select(
    element: Element,
    interactionKind: SelectionInteractionKind = "programmatic",
    reportedEventIsTrusted = false,
  ): SelectionResult {
    const result = buildSelectionSummary({
      element,
      window: this.#window,
      revision: this.#store.revision,
      ...(this.#routeCandidate ? { routeCandidate: this.#routeCandidate } : {}),
      privateSelectors: this.#privateSelectors,
      maxTextChars: this.#maxTextChars,
      maxSummaryBytes: this.#maxSummaryBytes,
      selectionId: this.#idFactory(),
      observedAt: this.#now(),
      interactionKind,
      reportedEventIsTrusted,
    });
    if (!result.ok) {
      this.#hideOverlay();
      return result;
    }
    this.#store.save(element, result.summary);
    this.#onSelection?.(result.summary);
    return result;
  }

  getSelection(selectionId: string): InjectedSelectionSummary | undefined {
    return this.#store.get(selectionId);
  }

  clear(): void {
    this.#store.clear();
    this.#hideOverlay();
  }

  resetDocument(revision: RevisionContext): void {
    this.#store.resetDocument(revision);
    this.#hideOverlay();
  }

  resetProject(revision: RevisionContext): void {
    this.#store.resetProject(revision);
    this.#hideOverlay();
  }

  readonly #onPointerMove = (event: PointerEvent): void => {
    this.#latestPointer = { x: event.clientX, y: event.clientY };
    if (this.#animationFrame !== undefined) return;
    this.#animationFrame = this.#window.requestAnimationFrame(() => {
      this.#animationFrame = undefined;
      const pointer = this.#latestPointer;
      this.#latestPointer = undefined;
      if (!pointer) return;
      try {
        const target = this.#document.elementsFromPoint(pointer.x, pointer.y)
          .find((element) => !element.closest("[data-vem-overlay-root]"));
        if (target) this.preview(target);
        else this.#hideOverlay();
      } catch {
        this.#hideOverlay();
      }
    });
  };

  readonly #onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!target || !("nodeType" in target) || (target as Node).nodeType !== 1) return;
    const element = target as Element;
    const result = this.select(element, "click", event.isTrusted);
    if (!result.ok) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.stop();
  };

  readonly #onPageHide = (): void => {
    this.clear();
  };

  #hideOverlay(): void {
    if (this.#overlay) {
      this.#overlay.box.hidden = true;
      this.#overlay.status.textContent = "";
    }
  }
}

function boundedInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function createOverlay(document: Document): Overlay {
  const host = document.createElement("div");
  host.setAttribute("data-vem-overlay-root", "p0-injected-selector");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = [
    ":host{all:initial}",
    ".box{position:fixed;left:0;top:0;box-sizing:border-box;border:2px solid #12b8a6;background:rgb(18 184 166 / 12%);pointer-events:none}",
    ".status{position:fixed;left:12px;bottom:12px;max-width:420px;padding:8px 10px;color:#fff;background:#172136;border-radius:6px;font:12px/1.4 system-ui;pointer-events:none}",
  ].join("");
  const box = document.createElement("div");
  box.className = "box";
  box.hidden = true;
  const status = document.createElement("div");
  status.className = "status";
  status.setAttribute("role", "status");
  shadow.append(style, box, status);
  return { host, box, status };
}

export function staleSelectionError(kind: "document" | "project"): SafeSelectorError {
  return safeSelectorError(kind === "document" ? "STALE_DOCUMENT" : "STALE_PROJECT");
}
