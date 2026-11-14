/**
 * Session-marker unit tests (TASK-419).
 *
 * The marker decides one thing: whether a page load is allowed to ask
 * POST /api/auth/refresh at all. Getting it wrong is asymmetric — too eager and
 * every first-time visitor collects a 401 in the browser console (the bug this
 * fixes); too shy and a signed-in shopper is silently logged out on reload. So
 * each transition is pinned here, including the two "we cannot read storage"
 * cases, which must fall back to the old always-refresh behaviour rather than
 * guess "no session".
 *
 * Runs in the `unit` (node) Jest project, which has no DOM: `window` is
 * installed by hand per test, which is also the cheapest way to model a browser
 * that refuses storage entirely.
 */
import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";
import {
  api,
  clearSessionMarker,
  getAccessToken,
  markSessionActive,
  onSessionExpired,
  refreshSession,
  setAccessToken,
  shouldAttemptSessionRefresh,
} from "./instance";

const MARKER_KEY = "case-store:session";

type GlobalWithWindow = { window?: unknown };

/** Install a minimal in-memory localStorage and return its backing map. */
function installStorage(): Map<string, string> {
  const data = new Map<string, string>();
  const storage: Storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  (globalThis as GlobalWithWindow).window = { localStorage: storage };
  return data;
}

/** A browser that throws on any storage access (blocked site data). */
function installBlockedStorage(): void {
  (globalThis as GlobalWithWindow).window = {
    get localStorage(): Storage {
      throw new Error("Access to storage is not allowed from this context");
    },
  };
}

function removeWindow(): void {
  delete (globalThis as GlobalWithWindow).window;
}

/** An axios-shaped rejection carrying just the status the code reads. */
function refreshFailure(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

/** Make the next refresh fail with `status`, without touching the network. */
function failRefreshWith(status: number): void {
  jest
    .spyOn(api, "post")
    .mockImplementation(() => Promise.reject(refreshFailure(status)));
}

describe("session marker", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installStorage();
    setAccessToken(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    removeWindow();
  });

  it("stays silent for a browser that has never signed in", () => {
    expect(shouldAttemptSessionRefresh()).toBe(false);
  });

  it("is written whenever an access token is stored", () => {
    setAccessToken("header.payload.sig");

    expect(store.get(MARKER_KEY)).toBe("1");
    expect(shouldAttemptSessionRefresh()).toBe(true);
  });

  it("survives dropping the access token — that is not a sign-out", () => {
    setAccessToken("header.payload.sig");
    // What the response interceptor does when a refresh fails transiently.
    setAccessToken(null);

    expect(shouldAttemptSessionRefresh()).toBe(true);
  });

  it("is forgotten on an explicit sign-out", () => {
    markSessionActive();
    clearSessionMarker();

    expect(store.has(MARKER_KEY)).toBe(false);
    expect(shouldAttemptSessionRefresh()).toBe(false);
  });

  it("is dropped when refresh answers 401 — the cookie outlived by the marker", async () => {
    markSessionActive();
    failRefreshWith(401);

    const outcome = await refreshSession();

    expect(outcome).toEqual({ accessToken: null, status: 401 });
    expect(shouldAttemptSessionRefresh()).toBe(false);
  });

  it("survives a rate-limited refresh — 429 is transient, not a sign-out", async () => {
    markSessionActive();
    failRefreshWith(429);

    await refreshSession();

    expect(shouldAttemptSessionRefresh()).toBe(true);
  });

  it("survives a server-error refresh — 5xx is transient too", async () => {
    markSessionActive();
    failRefreshWith(503);

    await refreshSession();

    expect(shouldAttemptSessionRefresh()).toBe(true);
  });

  it("keeps the old always-refresh behaviour where there is no storage at all", () => {
    removeWindow();

    expect(shouldAttemptSessionRefresh()).toBe(true);
    expect(() => markSessionActive()).not.toThrow();
    expect(() => clearSessionMarker()).not.toThrow();
  });

  it("keeps it too when the browser refuses storage access", () => {
    installBlockedStorage();

    // "Blocked" must read as unknown, never as "no session" — otherwise every
    // visitor with site data disabled is signed out on every page load.
    expect(shouldAttemptSessionRefresh()).toBe(true);
    expect(() => markSessionActive()).not.toThrow();
    expect(() => clearSessionMarker()).not.toThrow();
  });
});

/**
 * TASK-773: the interceptor's failed refresh must tell the AuthProvider, which
 * owns the React copy of the session (`isAuthenticated`). The provider side is
 * covered in `auth.context.test.tsx`; this pins the signal itself.
 */
describe("session-expired signal", () => {
  /** Answers every request with a 401 without touching the network. */
  const unauthorized: AxiosAdapter = (config) =>
    Promise.reject(
      new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
        status: 401,
        statusText: "Unauthorized",
        data: {},
        headers: {},
        config,
      } as AxiosResponse),
    );

  beforeEach(() => {
    installStorage();
    markSessionActive();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setAccessToken(null);
    removeWindow();
  });

  it("fires, and drops the token, when the refresh behind a 401 fails", async () => {
    setAccessToken("stale-token");
    failRefreshWith(401);
    const listener = jest.fn();
    const unsubscribe = onSessionExpired(listener);

    await expect(
      api.get("/api/users/me", { adapter: unauthorized }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    unsubscribe();
  });

  it("stops calling a listener once it unsubscribes", async () => {
    failRefreshWith(401);
    const listener = jest.fn();
    onSessionExpired(listener)();

    await expect(
      api.get("/api/users/me", { adapter: unauthorized }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not sign out a session that began while the refresh was in flight", async () => {
    setAccessToken("stale-token");
    // A sign-in lands while the old session's refresh is still out: the
    // failure belongs to the old session and must not end the new one.
    jest.spyOn(api, "post").mockImplementation(() => {
      setAccessToken("fresh-token");
      return Promise.reject(refreshFailure(401));
    });
    const listener = jest.fn();
    const unsubscribe = onSessionExpired(listener);

    await expect(
      api.get("/api/users/me", { adapter: unauthorized }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(listener).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("fresh-token");
    unsubscribe();
  });
});

describe("api paramsSerializer (TASK-217)", () => {
  it("sends array params as repeated keys, not `key[]`", () => {
    // The API's whitelist validation rejects a literal `status[]` key with 400.
    const url = api.getUri({
      url: "/api/orders",
      params: { status: ["PENDING", "SHIPPED"], page: 2 },
    });

    expect(url).toContain("status=PENDING&status=SHIPPED");
    expect(url).not.toContain("status%5B%5D");
    expect(url).toContain("page=2");
  });
});

// ─── Two tabs, one refresh cookie (TASK-2405) ────────────────────────────────
// Two storefront tabs that refresh at the same moment with the same cookie. The
// in-tab single-flight cannot see the other tab, so the second request presented
// a cookie the first had just rotated — and the API read that as theft.
// `navigator.locks` serialises the refresh across tabs: the second tab's request
// leaves only after the first one's response (and its Set-Cookie) has landed.

describe("cross-tab refresh (TASK-2405)", () => {
  type InstanceModule = typeof import("./instance");

  /** A fresh copy of the module — what a second tab of the same origin runs. */
  function openTab(): InstanceModule {
    let tab: InstanceModule | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      tab = require("./instance") as InstanceModule;
    });
    return tab!;
  }

  /**
   * The API plus the browser's cookie jar, shared by every tab: the jar's
   * cookie rides on a request when it LEAVES, and is replaced when a response
   * carrying Set-Cookie ARRIVES. The server rotates on every refresh and answers
   * 401 to anything but the current token, as strict reuse detection did before
   * the API's grace window.
   */
  function createSessionServer() {
    let current = "C0";
    let seq = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const jar = { refreshToken: "C0" };
    const presented: string[] = [];

    const respond = (config: Parameters<AxiosAdapter>[0], data: unknown) =>
      ({
        status: 200,
        statusText: "OK",
        data,
        headers: {},
        config,
      }) as AxiosResponse;

    const adapter: AxiosAdapter = async (config) => {
      if (config.url?.includes("/csrf-token")) {
        return respond(config, { data: { csrfToken: "csrf" } });
      }
      const cookie = jar.refreshToken;
      presented.push(cookie);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // The network round trip — long enough for the other tab to fire.
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      if (cookie !== current) {
        throw new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
          status: 401,
          statusText: "Unauthorized",
          data: {},
          headers: {},
          config,
        } as AxiosResponse);
      }
      seq += 1;
      current = `C${seq}`;
      jar.refreshToken = current;
      return respond(config, { data: { accessToken: `A${seq}` } });
    };

    return {
      adapter,
      presented,
      get maxInFlight() {
        return maxInFlight;
      },
    };
  }

  /** A minimal FIFO `navigator.locks`: one holder per name, in arrival order. */
  function createLockManager() {
    const tails = new Map<string, Promise<unknown>>();
    const names: string[] = [];
    return {
      names,
      request<T>(name: string, callback: () => Promise<T>): Promise<T> {
        names.push(name);
        const run = (tails.get(name) ?? Promise.resolve()).then(() =>
          callback(),
        );
        tails.set(
          name,
          run.catch(() => undefined),
        );
        return run;
      },
    };
  }

  // Node itself ships a `navigator` (with real Web Locks in recent versions),
  // so each test installs the one it means and the original is put back.
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );

  function installNavigator(value: object): void {
    Object.defineProperty(globalThis, "navigator", {
      value,
      configurable: true,
    });
  }

  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    } else {
      delete (globalThis as { navigator?: unknown }).navigator;
    }
    removeWindow();
  });

  it("serialises two tabs' refreshes so both get a token and neither presents a rotated cookie", async () => {
    const server = createSessionServer();
    const locks = createLockManager();
    installNavigator({ locks });
    const tabA = openTab();
    const tabB = openTab();
    tabA.api.defaults.adapter = server.adapter;
    tabB.api.defaults.adapter = server.adapter;

    const [a, b] = await Promise.all([
      tabA.refreshSession(),
      tabB.refreshSession(),
    ]);

    expect(a).toEqual({ accessToken: "A1" });
    expect(b).toEqual({ accessToken: "A2" });
    expect(server.presented).toEqual(["C0", "C1"]);
    expect(server.maxInFlight).toBe(1);
    // Its own name — the admin's lock must not hold up the storefront.
    expect(new Set(locks.names)).toEqual(
      new Set(["case-store-client:auth-refresh"]),
    );
  });

  it("still sends ONE request for concurrent callers within a tab", async () => {
    const server = createSessionServer();
    installNavigator({ locks: createLockManager() });
    const tab = openTab();
    tab.api.defaults.adapter = server.adapter;

    const [first, second] = await Promise.all([
      tab.refreshSession(),
      tab.refreshSession(),
    ]);

    expect(first).toEqual({ accessToken: "A1" });
    expect(second).toEqual({ accessToken: "A1" });
    expect(server.presented).toEqual(["C0"]);
  });

  it("bounds a hung refresh, so the lock is released and the session survives", async () => {
    const server = createSessionServer();
    installNavigator({ locks: createLockManager() });
    const tab = openTab();
    tab.setAccessToken("header.payload.sig");
    const timeouts: Array<number | undefined> = [];
    let hung = true;
    tab.api.defaults.adapter = async (config) => {
      if (config.url?.includes("/csrf-token")) return server.adapter(config);
      timeouts.push(config.timeout);
      if (hung) {
        hung = false;
        // What Axios raises when `timeout` elapses: no response at all.
        throw new AxiosError("timeout exceeded", "ECONNABORTED", config);
      }
      return server.adapter(config);
    };

    await expect(tab.refreshSession()).resolves.toEqual({
      accessToken: null,
      status: undefined,
    });
    expect(timeouts).toEqual([tab.REFRESH_TIMEOUT_MS]);
    // A timeout is transient, like any network failure — not a sign-out.
    expect(tab.shouldAttemptSessionRefresh()).toBe(true);
    // The lock was released: the next refresh reaches the network.
    await expect(tab.refreshSession()).resolves.toEqual({ accessToken: "A1" });
    expect(server.presented).toEqual(["C0"]);
  });

  it("works as before where the browser has no navigator.locks", async () => {
    const server = createSessionServer();
    installNavigator({});
    const tab = openTab();
    tab.api.defaults.adapter = server.adapter;

    await expect(tab.refreshSession()).resolves.toEqual({ accessToken: "A1" });
    expect(server.presented).toEqual(["C0"]);
  });
});
