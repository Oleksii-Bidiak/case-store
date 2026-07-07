import { trackEvent } from "./analytics";

/**
 * Facade unit tests (TASK-261). Runs in the `unit` (node) Jest project, where
 * `window` is undefined by default — so we control it explicitly by assigning
 * `globalThis.window`, exercising all three no-op paths and the happy path.
 */
describe("trackEvent — analytics facade", () => {
  const g = globalThis as { window?: unknown };
  const originalWindow = g.window;

  afterEach(() => {
    if (originalWindow === undefined) delete g.window;
    else g.window = originalWindow;
  });

  it("is a silent no-op when window is undefined (SSR / server render)", () => {
    delete g.window;
    expect(() =>
      trackEvent("view_product", { slug: "iphone-case" }),
    ).not.toThrow();
  });

  it("is a silent no-op when window.umami is undefined (script not loaded / ad-blocked)", () => {
    g.window = {};
    expect(() =>
      trackEvent("add_to_cart", { productId: "p1", quantity: 1 }),
    ).not.toThrow();
  });

  it("forwards the event name and payload to window.umami.track", () => {
    const track = jest.fn();
    g.window = { umami: { track } };

    trackEvent("purchase", { orderId: "order-1", amount: 199.5 });

    expect(track).toHaveBeenCalledTimes(1);
    // The `amount` payload is the load-bearing detail for the purchase funnel step.
    expect(track).toHaveBeenCalledWith("purchase", {
      orderId: "order-1",
      amount: 199.5,
    });
  });

  it("forwards an event with no payload as undefined data", () => {
    const track = jest.fn();
    g.window = { umami: { track } };

    trackEvent("begin_checkout");

    expect(track).toHaveBeenCalledWith("begin_checkout", undefined);
  });
});

/**
 * UMAMI_ENABLED is derived from two build-time env reads in shared/config/site.
 * Re-require the module under isolated env states to assert the both-present /
 * either-absent gate.
 */
describe("UMAMI_ENABLED — env gate", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  function loadSite() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../config/site") as typeof import("../config/site");
  }

  it("is false when both keys are absent", () => {
    delete process.env.NEXT_PUBLIC_UMAMI_SRC;
    delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
    expect(loadSite().UMAMI_ENABLED).toBe(false);
  });

  it("is false when only the script URL is set", () => {
    process.env.NEXT_PUBLIC_UMAMI_SRC = "https://analytics.example/script.js";
    delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
    expect(loadSite().UMAMI_ENABLED).toBe(false);
  });

  it("is false when only the website id is set", () => {
    delete process.env.NEXT_PUBLIC_UMAMI_SRC;
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = "abc-123";
    expect(loadSite().UMAMI_ENABLED).toBe(false);
  });

  it("is true and exposes both values when both keys are set", () => {
    process.env.NEXT_PUBLIC_UMAMI_SRC = "https://analytics.example/script.js";
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = "abc-123";
    const site = loadSite();
    expect(site.UMAMI_ENABLED).toBe(true);
    expect(site.UMAMI_SRC).toBe("https://analytics.example/script.js");
    expect(site.UMAMI_WEBSITE_ID).toBe("abc-123");
  });
});
