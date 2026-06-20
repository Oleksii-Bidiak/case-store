import Axios, {
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";

/**
 * Pre-configured Axios instance for communicating with the store-api backend.
 *
 * - baseURL: reads from NEXT_PUBLIC_API_URL env var (defaults to http://localhost:3001)
 * - withCredentials: enabled for cookie-based auth (refresh tokens)
 * - Content-Type: application/json by default
 *
 * Note: the backend mounts every route under the `/api` global prefix, and Axios
 * builds the request URL by concatenating baseURL + path. The baseURL is therefore
 * the bare origin (no `/api`), and every endpoint path carries `/api` itself
 * (e.g. `/api/auth/refresh`) — matching the Orval-generated paths.
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
// theft. The AuthProvider restores it on load via the HttpOnly refresh cookie.

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
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

// Single in-flight refresh shared across concurrent 401s (avoids a stampede).
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = api
      .post<{ data?: { accessToken?: string } }>("/api/auth/refresh")
      .then((response) => response.data?.data?.accessToken ?? null)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (AxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
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
