import Axios, {
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";

/**
 * Pre-configured Axios instance for communicating with the store-api backend.
 *
 * - baseURL: reads from NEXT_PUBLIC_API_URL env var (defaults to http://localhost:3001)
 * - withCredentials: enabled for cookie-based auth (refresh + cart tokens)
 * - Content-Type: application/json by default
 */
export const api = Axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// ─── In-memory access token ──────────────────────────────────────────────────
// The JWT access token lives only in memory (never localStorage) to avoid XSS
// theft. The AuthProvider restores it on load via the refresh cookie.

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  // Holding a token is the one event that proves a session exists — login,
  // register and every successful refresh funnel through here. The inverse is
  // NOT symmetric: `setAccessToken(null)` also runs after a transient refresh
  // failure, which must not read as a sign-out, so only `clearSessionMarker()`
  // (logout) and a 401 from refresh take the marker away.
  if (token) {
    markSessionActive();
  }
}

// ─── Session marker ──────────────────────────────────────────────────────────
// One non-secret bit in localStorage: "this browser signed in and we have not
// seen that session end". It is not a credential and grants nothing — the
// session itself is the HttpOnly refresh cookie, which JavaScript cannot read,
// and every guarantee around it (single-use, rotation, reuse detection) is
// enforced by the API and untouched by this.
//
// Why it exists (TASK-419): the app restores a session on every page load with
// POST /api/auth/refresh. A visitor who never signed in has no refresh cookie,
// so that call answers 401 — and the BROWSER writes that failed request to the
// console. The app logs nothing here; there is no console.* anywhere on this
// path, and no handler can suppress a browser's own network log. So the only
// route to a clean console for a first-time visitor (SF-UX-13) is to not make
// the request at all, which is exactly what the marker decides.
//
// A marker can outlive its cookie (the refresh token expired or was revoked
// elsewhere). That costs one 401 on one page load, after which the 401 handler
// below drops the marker and the browser is a clean guest again.

const SESSION_MARKER_KEY = "case-store:session";

/** localStorage, but only if the browser has one AND lets us touch it. */
function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Site data blocked by the browser / enterprise policy.
    return null;
  }
}

/** Remember that this browser holds a session. Best-effort. */
export function markSessionActive(): void {
  try {
    sessionStore()?.setItem(SESSION_MARKER_KEY, "1");
  } catch {
    // Quota or private-mode write failure — see shouldAttemptSessionRefresh.
  }
}

/** Forget the session (explicit sign-out, or a refresh the API rejected). */
export function clearSessionMarker(): void {
  try {
    sessionStore()?.removeItem(SESSION_MARKER_KEY);
  } catch {
    // Ignore — a marker we cannot remove costs one 401, nothing more.
  }
}

/**
 * Should the app try to restore a session from the refresh cookie?
 *
 * True when the marker is there — and equally when localStorage cannot be read
 * at all (server render, blocked site data). "Unknown" deliberately keeps the
 * old always-refresh behaviour: answering it with "no session" would sign out
 * every visitor whose browser blocks storage, which is a far worse failure
 * than a console line.
 */
export function shouldAttemptSessionRefresh(): boolean {
  const store = sessionStore();
  if (!store) {
    return true;
  }
  try {
    return store.getItem(SESSION_MARKER_KEY) !== null;
  } catch {
    return true;
  }
}

// ─── CSRF (signed double-submit cookie) ──────────────────────────────────────
// The backend protects cookie-authenticated, state-changing routes (refresh,
// cart mutations) with a CSRF token delivered in a readable cookie. We read the
// cookie and echo it back in the `x-csrf-token` header on mutating requests.
// If the cookie is missing, we lazily fetch one from GET /api/csrf-token first.

const CSRF_COOKIE_NAMES = ["__Host-csrf", "csrf"];
const CSRF_TOKEN_PATH = "/api/csrf-token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") {
    return null; // SSR — no cookie jar
  }
  for (const name of CSRF_COOKIE_NAMES) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

// Single in-flight token fetch shared across concurrent mutations.
let csrfPromise: Promise<string | null> | null = null;

async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCsrfCookie();
  if (existing) {
    return existing;
  }
  if (!csrfPromise) {
    csrfPromise = api
      .get<{ data?: { csrfToken?: string } }>(CSRF_TOKEN_PATH)
      .then((response) => response.data?.data?.csrfToken ?? null)
      .catch(() => null)
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

// ─── Request interceptor: attach the bearer + CSRF tokens ────────────────────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
  }

  // Complementary CSRF signal (cross-site requests cannot set custom headers).
  config.headers.set("X-Requested-With", "XMLHttpRequest");

  // CSRF is only needed for cookie-authenticated requests. When a Bearer token
  // is present the backend exempts the request (an attacker cannot set that
  // header cross-site), so we skip the token fetch to avoid a redundant call.
  const method = config.method?.toUpperCase();
  const isMutation = !!method && MUTATING_METHODS.has(method);
  const isCsrfFetch = config.url?.includes("/csrf-token") ?? false;

  if (isMutation && !isCsrfFetch && !accessToken) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) {
      config.headers.set("x-csrf-token", csrfToken);
    }
  }

  return config;
});

// ─── Response interceptor: refresh the token once on 401 and retry ───────────

/** True for auth endpoints that must never trigger the refresh-retry loop. */
function isAuthEndpoint(url: string | undefined): boolean {
  return !!url && url.includes("/auth/");
}

/** What one refresh attempt produced. `status` is set only when it failed. */
export interface RefreshOutcome {
  accessToken: string | null;
  /** HTTP status of the failure, or `undefined` when the request succeeded. */
  status?: number;
}

// Single in-flight refresh shared across concurrent 401s (avoids a stampede).
let refreshPromise: Promise<RefreshOutcome> | null = null;

/**
 * Refresh the session, sharing ONE request with every concurrent caller
 * (TASK-463).
 *
 * Exported because this must be the only place the app refreshes from. It was
 * not: `AuthProvider`'s bootstrap called the generated `authControllerRefresh()`
 * directly, so the app had two refresh paths with two separate single-flight
 * guards, each correctly deduping only its own callers. On a cold page load both
 * fire at once — the provider restoring the session, and the interceptor
 * reacting to the 401s from queries that started before the access token
 * existed.
 *
 * Two concurrent refreshes with one cookie are not a harmless race.
 * `POST /api/auth/refresh` ROTATES: the presented token is revoked and a new one
 * issued, and presenting a revoked token is correctly treated as theft, which
 * revokes EVERY session the user holds (RFC 6819 §5.2.2). Fired by hand against
 * a running API, two concurrent refreshes answered `500` and
 * `401 Token reuse detected — all sessions terminated`.
 *
 * Found via the admin panel's Playwright flake (TASK-463); the storefront
 * carries the identical shape, so it gets the identical fix. Not a dev-only
 * concern either: two tabs opened together do exactly this.
 */
export function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = api
      .post<{ data?: { accessToken?: string } }>("/api/auth/refresh")
      .then((response) => ({
        accessToken: response.data?.data?.accessToken ?? null,
      }))
      .catch((error: AxiosError) => {
        const status = error.response?.status;
        // 401 is the API saying the refresh cookie is gone, expired or revoked
        // — the one definitive "no session". Drop the marker so the next page
        // load starts as a guest and never asks again. Everything else (429,
        // 5xx, a network blip) is transient and the bootstrap retries it, so
        // the marker must survive: clearing it there would sign a signed-in
        // user out over a rate-limit hiccup (fix/196).
        if (status === 401) {
          clearSessionMarker();
        }
        return { accessToken: null, status };
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function refreshAccessToken(): Promise<string | null> {
  return (await refreshSession()).accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url) &&
      // No session marker → there is nothing to refresh, and asking would only
      // add a second failed request (and a second console line) to the first.
      shouldAttemptSessionRefresh()
    ) {
      originalRequest._retry = true;

      const newToken = await refreshAccessToken();

      if (newToken) {
        setAccessToken(newToken);
        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${newToken}`,
        };
        return api(originalRequest);
      }

      // Refresh failed — drop the stale token; caller handles the rejection.
      setAccessToken(null);
    }

    return Promise.reject(error);
  },
);

/**
 * Custom instance function for Orval-generated API calls.
 * Unwraps the response data so hooks receive typed data directly.
 */
export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const source = Axios.CancelToken.source();
  const promise = api({
    ...config,
    ...options,
    cancelToken: source.token,
  }).then(({ data }) => data);

  // @ts-expect-error cancel is not part of standard Promise
  promise.cancel = () => source.cancel("Query was cancelled");

  return promise;
};

// Export error type for Orval-generated error handling
export type ErrorType<Error> = AxiosError<Error>;

// Export body type for Orval-generated request types
export type BodyType<BodyData> = BodyData;
