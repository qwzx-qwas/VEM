import type { RevisionContext } from "@vem/protocol";
import type { InjectedSelectionSummary } from "./types.js";

interface SelectionRecord {
  summary: InjectedSelectionSummary;
  element: WeakRef<Element>;
}

export class EphemeralSelectionStore {
  #records = new Map<string, SelectionRecord>();
  #handles = new WeakMap<Element, string>();
  #revision: RevisionContext;
  #activeSelectionId: string | undefined;

  constructor(revision: RevisionContext) {
    this.#revision = { ...revision };
  }

  get revision(): RevisionContext {
    return { ...this.#revision };
  }

  get activeSelectionId(): string | undefined {
    return this.#activeSelectionId;
  }

  get size(): number {
    return this.#records.size;
  }

  save(element: Element, summary: InjectedSelectionSummary): void {
    this.#records.set(summary.selectionId, {
      summary,
      element: new WeakRef(element),
    });
    this.#handles.set(element, summary.selectionId);
    this.#activeSelectionId = summary.selectionId;
  }

  get(selectionId: string): InjectedSelectionSummary | undefined {
    const record = this.#records.get(selectionId);
    if (!record) return undefined;
    if (!record.element.deref()?.isConnected) {
      this.#records.delete(selectionId);
      if (this.#activeSelectionId === selectionId) this.#activeSelectionId = undefined;
      return undefined;
    }
    return record.summary;
  }

  selectionIdFor(element: Element): string | undefined {
    return this.#handles.get(element);
  }

  clear(): void {
    this.#records.clear();
    this.#handles = new WeakMap();
    this.#activeSelectionId = undefined;
  }

  resetDocument(revision: RevisionContext): void {
    this.clear();
    this.#revision = { ...revision };
  }

  resetProject(revision: RevisionContext): void {
    this.clear();
    this.#revision = { ...revision };
  }
}
