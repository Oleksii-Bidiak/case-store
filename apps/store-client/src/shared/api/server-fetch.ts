/**
 * Time-boxed `fetch` for every server-side request the storefront makes
 * (TASK-327).
 *
 * ## Why this exists
 *
 * The dangerous failure mode is not an API that *refuses* connections — that one
 * is harmless: the socket errors immediately, `fetch` rejects, and each caller's
 * `catch` returns its fallback. The dangerous one is an API that *accepts* the
 * connection and then says nothing: a half-started container, a paused VPS, an
 * API booting in parallel with the frontend in CI. `fetch` has no default
 * timeout, so such a request hangs forever.
 *
 * During `next build` that hang is fatal. The root layout reads SEO settings, so
 * *every* prerendered page inherits it; each page then burns Next's whole
 * `staticPageGenerationTimeout` (60 s by default), is retried 3 times, and the
 * build dies with `Failed to build /<page> after 3 attempts` — the observed
 * blocker that stopped the frontend images from building.
 *
 * `serverFetch` makes that impossible by construction: every request carries an
 * `AbortSignal.timeout(...)`, so a silent API costs one budget and then falls
 * through to the same `catch` an outright refusal would have hit.
 *
 * ## Rules
 *
 * - Raw `fetch` is banned in `src/**` by the `no-restricted-syntax` rule in
 *   `eslint.config.mjs`; this file and `shared/api/generated/**` are the only
 *   exceptions. That is what stops a 14th un-timed-out call site from appearing.
 * - This is a thin wrapper, not an error handler. A timeout rejects with a
 *   `TimeoutError` `DOMException`, which every existing caller already treats as
 *   "API unavailable" and answers with its own fallback. Keeping the failure
 *   shape identical is why no call site needed new error handling.
 */

/**
 * Default per-request budget. Sized for the storefront → store-api hop, which is
 * same-host (docker network / localhost) in every deployment we ship: 5 s is
 * already ~50x a healthy response. It also bounds the whole prerender: no page
 * chains more than ~3 sequential server fetches, so the worst case stays well
 * inside Next's 60 s per-page budget instead of blowing past it.
 */
export const DEFAULT_SERVER_FETCH_TIMEOUT_MS = 5000;

/** `RequestInit` plus the per-call timeout override. */
export interface ServerFetchInit extends RequestInit {
  /**
   * Per-request budget in milliseconds. Defaults to
   * {@link DEFAULT_SERVER_FETCH_TIMEOUT_MS}, overridable at runtime via the
   * `SERVER_FETCH_TIMEOUT_MS` env var (server-only — deliberately not
   * `NEXT_PUBLIC_`, since nothing in the browser may widen it).
   */
  timeoutMs?: number;
}

/**
 * Resolve the effective budget: explicit argument → `SERVER_FETCH_TIMEOUT_MS`
 * → the built-in default. Read on every call (not at module load) so an operator
 * can raise it on a slow box without a rebuild, and so tests can vary it.
 *
 * Anything non-numeric, zero, or negative is ignored rather than obeyed — a
 * typo in an env var must not silently restore the unbounded behaviour this
 * module exists to prevent.
 */
export function resolveServerFetchTimeoutMs(explicitMs?: number): number {
  if (typeof explicitMs === "number" && explicitMs > 0) {
    return explicitMs;
  }

  const configured = Number(process.env.SERVER_FETCH_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_SERVER_FETCH_TIMEOUT_MS;
}

/**
 * `fetch` that always carries a deadline.
 *
 * A caller-supplied `signal` (React `cache`/route cancellation, an explicit
 * `AbortController`) is preserved: the request aborts on whichever fires first,
 * combined via `AbortSignal.any`. Both `AbortSignal.timeout` and
 * `AbortSignal.any` are available on the `node:22-slim` runtime the storefront
 * image is built on.
 *
 * Cache directives (`next: { tags, revalidate }`) pass through untouched, so
 * on-demand ISR revalidation keeps working exactly as before.
 */
export async function serverFetch(
  input: string | URL | Request,
  init: ServerFetchInit = {},
): Promise<Response> {
  const { timeoutMs, signal, ...rest } = init;

  const deadline = AbortSignal.timeout(resolveServerFetchTimeoutMs(timeoutMs));
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;

  // The single sanctioned raw `fetch` in the app — this file is the one
  // exception carved out of the `no-restricted-syntax` guard (see
  // `eslint.config.mjs`), because it is the wrapper that guard points at.
  return fetch(input, { ...rest, signal: combined });
}
