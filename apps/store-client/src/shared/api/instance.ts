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
}

// ─── Request interceptor: attach the bearer token ────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
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
