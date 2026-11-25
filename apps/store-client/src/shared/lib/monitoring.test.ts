/**
 * TASK-2524 — the lazy Sentry front door. Calls made before the SDK is ready
 * are queued (up to the cap) and replayed in order once `init` has run; after
 * that they go straight through.
 */
const mockSdk = {
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureRouterTransitionStart: jest.fn(),
};

jest.mock("@sentry/nextjs", () => mockSdk);

type Monitoring = typeof import("./monitoring");

/** A fresh copy of the module, so every test starts with an empty queue. */
function load(): Monitoring {
  let mod!: Monitoring;
  jest.isolateModules(() => {
    mod = jest.requireActual<Monitoring>("./monitoring");
  });
  return mod;
}

describe("shared/lib/monitoring", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queues calls until the SDK is initialised", () => {
    const m = load();

    m.captureException(new Error("early"));
    m.captureMessage("csp", { level: "warning" });
    m.addBreadcrumb({ message: "crumb" });

    expect(mockSdk.captureException).not.toHaveBeenCalled();
    expect(mockSdk.captureMessage).not.toHaveBeenCalled();
    expect(mockSdk.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("runs init first, then replays the queue in call order", async () => {
    const m = load();
    const order: string[] = [];
    mockSdk.init.mockImplementation(() => order.push("init"));
    mockSdk.captureException.mockImplementation((e: Error) =>
      order.push(`exception:${e.message}`),
    );
    mockSdk.addBreadcrumb.mockImplementation((b: { message: string }) =>
      order.push(`breadcrumb:${b.message}`),
    );

    const error = new Error("first");
    m.captureException(error, { tags: { feature: "x" } });
    m.addBreadcrumb({ message: "second" });
    m.captureException(new Error("third"));

    await m.initMonitoring((s) => s.init({ dsn: "https://k@o.ingest/1" }));

    expect(order).toEqual([
      "init",
      "exception:first",
      "breadcrumb:second",
      "exception:third",
    ]);
    expect(mockSdk.captureException).toHaveBeenCalledWith(error, {
      tags: { feature: "x" },
    });
  });

  it("forwards calls immediately once ready", async () => {
    const m = load();
    await m.initMonitoring(() => {});

    m.captureMessage("late", { level: "warning" });
    expect(mockSdk.captureMessage).toHaveBeenCalledWith("late", {
      level: "warning",
    });
  });

  it("keeps at most the cap and drops the rest", async () => {
    const m = load();
    for (let i = 0; i < m.MONITORING_QUEUE_CAP + 10; i++) {
      m.captureException(new Error(String(i)));
    }

    await m.initMonitoring(() => {});

    expect(mockSdk.captureException).toHaveBeenCalledTimes(
      m.MONITORING_QUEUE_CAP,
    );
    expect(mockSdk.captureException.mock.calls.at(-1)?.[0]).toEqual(
      new Error(String(m.MONITORING_QUEUE_CAP - 1)),
    );
  });

  it("loads the SDK once for every caller", async () => {
    const m = load();
    const [a, b] = await Promise.all([m.loadSentry(), m.loadSentry()]);
    expect(a).toBe(b);
  });

  it("drops router transitions before the SDK is ready, forwards them after", async () => {
    const m = load();
    m.captureRouterTransitionStart("/cart", "push");
    expect(mockSdk.captureRouterTransitionStart).not.toHaveBeenCalled();

    await m.initMonitoring(() => {});
    expect(mockSdk.captureRouterTransitionStart).not.toHaveBeenCalled();

    m.captureRouterTransitionStart("/checkout", "push");
    expect(mockSdk.captureRouterTransitionStart).toHaveBeenCalledWith(
      "/checkout",
      "push",
    );
  });
});
