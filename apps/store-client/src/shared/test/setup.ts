import "@testing-library/jest-dom";
import { server } from "./msw-server";

// ─── jsdom gaps used by Radix UI primitives (Dialog, etc.) ───────────────────
// jsdom implements neither the Pointer Capture API, scrollIntoView, nor
// ResizeObserver. Radix calls them during open/close; stub them so dialog and
// popover interactions don't throw in component tests.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
Element.prototype.scrollIntoView =
  Element.prototype.scrollIntoView ?? (() => {});
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// jsdom has no matchMedia; sonner's <Toaster> reads it on mount.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

/**
 * Global setup for the `component` Jest project (jsdom env). Loads jest-dom
 * matchers and runs the MSW server for the whole suite: start before all tests,
 * reset per-test handler overrides after each, and close at the end.
 */
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
