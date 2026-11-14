/**
 * Session-marker unit tests (TASK-528 — port of the storefront's TASK-419).
 *
 * The marker decides one thing: whether a page load is allowed to ask
 * POST /api/auth/refresh at all. Getting it wrong is asymmetric — too eager and
 * every visit to /login without a session collects a 401 in the browser console
 * (the bug this fixes); too shy and a signed-in operator is silently logged out
 * on reload. So each transition is pinned here, including the "we cannot read
 * storage" case, which must fall back to the old always-refresh behaviour
 * rather than guess "no session".
 *
 * Unlike the storefront's copy this runs in jsdom (store-admin has a single
 * jsdom Jest project), so it uses the real `window.localStorage` and models a
 * browser that refuses storage by making the getter throw.
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

const MARKER_KEY = "case-store-admin:session";

/** An axios-shaped rejection carrying just the status the code reads. */
function refreshFailure(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

/** Make the next refresh fail with `status`, without touching the network. */
function failRefreshWith(status: number): jest.SpyInstance {
  return jest
    .spyOn(api, "post")
    .mockImplementation(() => Promise.reject(refreshFailure(status)));
}

/** A browser that throws on any storage access (blocked site data). */
function blockStorage(): void {
  jest.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new Error("Access to storage is not allowed from this context");
  });
}

describe("session marker", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setAccessToken(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it("stays silent for a browser that has never signed in", () => {
    expect(shouldAttemptSessionRefresh()).toBe(false);
  });

  it("is written whenever an access token is stored", () => {
    setAccessToken("header.payload.sig");

    expect(window.localStorage.getItem(MARKER_KEY)).toBe("1");
    expect(shouldAttemptSessionRefresh()).toBe(true);
  });

  it("uses its own key, not the storefront's", () => {
    setAccessToken("header.payload.sig");

    expect(window.localStorage.getItem("case-store:session")).toBeNull();
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

    expect(window.localStorage.getItem(MARKER_KEY)).toBeNull();
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

  it("keeps the old always-refresh behaviour when the browser refuses storage", () => {
    blockStorage();

    // "Blocked" must read as unknown, never as "no session" — otherwise every
    // operator with site data disabled is signed out on every page load.
    expect(shouldAttemptSessionRefresh()).toBe(true);
    expect(() => markSessionActive()).not.toThrow();
    expect(() => clearSessionMarker()).not.toThrow();
    expect(() => setAccessToken("header.payload.sig")).not.toThrow();
  });
});

/**
 * The response interceptor refreshes once on a 401 — but only when there is a
 * session to refresh. Without the marker the refresh would add a second failed
 * request (and a second console line) to the first.
 */
describe("401 interceptor", () => {
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
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setAccessToken(null);
    window.localStorage.clear();
  });

  it("does not attempt a refresh when this browser holds no session", async () => {
    const post = failRefreshWith(401);

    await expect(
      api.get("/api/users/me", { adapter: unauthorized }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(post).not.toHaveBeenCalled();
  });

  it("refreshes once and drops the token when the marker is there but the cookie is not", async () => {
    setAccessToken("stale-token");
    const post = failRefreshWith(401);

    await expect(
      api.get("/api/users/me", { adapter: unauthorized }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      "/api/auth/refresh",
      undefined,
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(getAccessToken()).toBeNull();
    // The 401 from refresh ended the session: the next page load stays quiet.
    expect(shouldAttemptSessionRefresh()).toBe(false);
  });

  it("retries the original request with the new token after a successful refresh", async () => {
    markSessionActive();
    jest.spyOn(api, "post").mockResolvedValue({
      data: { data: { accessToken: "fresh-token" } },
    });
    const seen: Array<string | undefined> = [];
    const adapter: AxiosAdapter = (config) => {
      const auth = config.headers?.Authorization as string | undefined;
      seen.push(auth);
      if (!auth || auth !== "Bearer fresh-token") {
        return unauthorized(config);
      }
      return Promise.resolve({
        status: 200,
        statusText: "OK",
        data: { data: { ok: true } },
        headers: {},
        config,
      } as AxiosResponse);
    };

    const response = await api.get("/api/users/me", { adapter });

    expect(response.data).toEqual({ data: { ok: true } });
    expect(seen.at(-1)).toBe("Bearer fresh-token");
    expect(getAccessToken()).toBe("fresh-token");
  });

  // Wave 198 (TASK-528 + TASK-974): the UI learns that the session ENDED, so
  // it can say «Сесія закінчилась» instead of failing quietly in place.
  describe("session expiry signal", () => {
    it("fires when the refresh answers 401", async () => {
      setAccessToken("stale-token");
      failRefreshWith(401);
      const listener = jest.fn();
      const unsubscribe = onSessionExpired(listener);

      await expect(
        api.get("/api/users/me", { adapter: unauthorized }),
      ).rejects.toBeInstanceOf(AxiosError);

      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it.each([429, 500])(
      "stays quiet when the refresh fails with a transient %i",
      async (status) => {
        setAccessToken("stale-token");
        failRefreshWith(status);
        const listener = jest.fn();
        const unsubscribe = onSessionExpired(listener);

        await expect(
          api.get("/api/users/me", { adapter: unauthorized }),
        ).rejects.toBeInstanceOf(AxiosError);

        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
      },
    );

    it("stays quiet for a direct refresh — the bootstrap is not an expiry", async () => {
      markSessionActive();
      failRefreshWith(401);
      const listener = jest.fn();
      const unsubscribe = onSessionExpired(listener);

      await refreshSession();

      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("stops calling a listener after it unsubscribes", async () => {
      setAccessToken("stale-token");
      failRefreshWith(401);
      const listener = jest.fn();
      onSessionExpired(listener)();

      await expect(
        api.get("/api/users/me", { adapter: unauthorized }),
      ).rejects.toBeInstanceOf(AxiosError);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});

// ─── Two tabs, one refresh cookie (TASK-2405) ────────────────────────────────
// Two admin tabs that bootstrapped together refresh at the same moment with the
// same cookie. The in-tab single-flight above cannot see the other tab, so the
// second request presented a cookie the first had just rotated — and the API
// read that as theft. `navigator.locks` serialises the refresh across tabs: the
// second tab's request leaves only after the first one's response (and its
// Set-Cookie) has landed, so it presents the NEW cookie.

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
   * carrying Set-Cookie ARRIVES. The server rotates on every refresh and
   * answers 401 to anything but the current token, as strict reuse detection
   * did before the API's grace window.
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

  function installLocks(locks: ReturnType<typeof createLockManager>): void {
    Object.defineProperty(window.navigator, "locks", {
      value: locks,
      configurable: true,
    });
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    delete (window.navigator as { locks?: unknown }).locks;
    window.localStorage.clear();
  });

  it("serialises two tabs' refreshes so both get a token and neither presents a rotated cookie", async () => {
    const server = createSessionServer();
    const locks = createLockManager();
    installLocks(locks);
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
    // Its own name — the storefront's lock must not hold up the admin.
    expect(new Set(locks.names)).toEqual(
      new Set(["case-store-admin:auth-refresh"]),
    );
  });

  it("still sends ONE request for concurrent callers within a tab", async () => {
    const server = createSessionServer();
    installLocks(createLockManager());
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
    installLocks(createLockManager());
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
    const tab = openTab();
    tab.api.defaults.adapter = server.adapter;

    await expect(tab.refreshSession()).resolves.toEqual({ accessToken: "A1" });
    expect(server.presented).toEqual(["C0"]);
  });
});
