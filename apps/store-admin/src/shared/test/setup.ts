import "@testing-library/jest-dom";
import { server } from "./msw-server";

// ─── jsdom gaps used by Radix UI primitives (Dialog, Select, etc.) ───────────
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
Element.prototype.scrollIntoView =
  Element.prototype.scrollIntoView ?? (() => {});
// jsdom ships no `matchMedia`; components that mirror a CSS breakpoint in the
// a11y tree (shared/ui/table card mode) read it. Default: nothing matches
// (desktop). Individual tests override `window.matchMedia` to simulate a
// narrow viewport.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
// ─── jsdom gaps used by ProseMirror / Tiptap (shared/ui/rich-text-editor) ────
// jsdom implements `document.createRange()` but ships a `Range` carrying no
// layout methods at all. ProseMirror needs them on every "scroll to selection"
// transaction — `EditorView.scrollToSelection` → `coordsAtPos` → `singleRect`,
// which calls `range.getClientRects()` — and every toolbar command runs through
// `.chain().focus()`, which emits exactly such a transaction.
// `scrollToSelection` returns early while the DOM selection is not inside the
// editor yet, so the missing method only *sometimes* reaches the crash: leaving
// the gap open makes editor tests latently flaky rather than reliably red. An
// empty rect list plus a zero-sized bounding rect is what a document that never
// lays out should report anyway.
if (typeof Range !== "undefined") {
  if (typeof Range.prototype.getClientRects !== "function") {
    Range.prototype.getClientRects = () =>
      Object.assign([], { item: () => null }) as unknown as DOMRectList;
  }
  if (typeof Range.prototype.getBoundingClientRect !== "function") {
    // A literal, not `new DOMRect()`: the jsdom build bundled with
    // jest-environment-jsdom exposes no global `DOMRect` constructor.
    Range.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// MSW lifecycle for the whole suite.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
