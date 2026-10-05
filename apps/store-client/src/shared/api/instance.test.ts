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
