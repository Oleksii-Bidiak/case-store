import Axios, { AxiosError, AxiosRequestConfig } from "axios";

/**
 * Pre-configured Axios instance for communicating with the store-api backend.
 *
 * - baseURL: reads from NEXT_PUBLIC_API_URL env var (defaults to http://localhost:3001/api)
 * - withCredentials: enabled for cookie-based auth (refresh tokens)
 * - Content-Type: application/json by default
 */
export const api = Axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// TODO(auth): add a request interceptor that injects
// `Authorization: Bearer <accessToken>` for admin-protected endpoints once the
// admin login flow exists. Refresh tokens already travel via HttpOnly cookie
// (withCredentials: true); only the access token needs wiring here.

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
