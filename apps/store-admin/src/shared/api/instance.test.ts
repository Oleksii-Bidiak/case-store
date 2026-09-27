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
    expect(post).toHaveBeenCalledWith("/api/auth/refresh");
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
});
