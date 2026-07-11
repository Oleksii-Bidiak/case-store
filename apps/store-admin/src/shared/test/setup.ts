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
