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
