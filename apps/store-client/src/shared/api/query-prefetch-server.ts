import {
  QueryClient,
  dehydrate,
  type DehydratedState,
  type FetchQueryOptions,
  type QueryKey,
} from "@tanstack/react-query";
import { resolveServerFetchTimeoutMs } from "./server-fetch";

/**
 * Server-side React Query prefetch for the catalogue routes (TASK-563).
 *
 * The catalogue widgets are client components fed by the Orval hooks, so until
 * TASK-563 the first HTML of `/products`, `/categories`, a PDP, the homepage and
 * `/promo` carried skeletons and not one link to a product — a crawler that
 * does not run JavaScript saw an empty shop. A route now fills a per-request
 * `QueryClient` with the SAME query options the widget will ask for, and wraps
 * the widget in `<PrefetchBoundary state={dehydrateForClient(client)}>` (a
 * `HydrationBoundary`, see `prefetch-boundary.tsx`): the server render already
 * has the data, and the client adopts it instead of refetching.
 *
 * ## The failure mode is today's behaviour, never worse
 *
 * - A prefetch that fails (API down, 4xx, timeout) leaves its query in the
 *   `error` state, and `dehydrate` ships only `success` queries — so the client
 *   simply fetches it itself, exactly as before this module existed.
 * - `retry: false`: the client retries on its own; retrying here only holds the
 *   response back (three attempts with back-off ≈ 7 s on a dead API).
 * - Every request gets a deadline ({@link serverRequestOptions}). The Orval
 *   client is axios, which has NO default timeout, and three of these routes
 *   (`/`, `/categories`, `/promo`) are prerendered by `next build`: an API that
 *   accepts the connection and then says nothing would otherwise hang the build
 *   (the TASK-327 failure `serverFetch` exists to prevent).
 *
 * ## What it does not do
 *
 * axios requests are invisible to Next's Data Cache — no tags, no dedup. On the
 * prerendered routes the data is baked into the HTML at build / revalidation
 * time, and it is the route's own revalidation (the catalogue target in
 * store-api's `revalidate-targets.ts`, and the route's `revalidate` floor) that
 * refreshes it. The client still refetches a baked copy on mount once it is
 * older than its `staleTime`, so shoppers see fresh numbers either way.
 */

/** A fresh client per request — a module-level one would leak data between shoppers. */
export function createServerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Long enough that nothing inside one render refetches.
        staleTime: 60_000,
      },
    },
  });
}

/**
 * Axios options for a server-side generated call: the same deadline
 * `serverFetch` gives native fetches (5 s, `SERVER_FETCH_TIMEOUT_MS`).
 */
export function serverRequestOptions(): { timeout: number } {
  return { timeout: resolveServerFetchTimeoutMs() };
}

/**
 * Anything `prefetchQuery` accepts. The Orval `get…QueryOptions()` builders
 * return `UseQueryOptions`, a superset for our purpose, hence the loose type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one list holds queries of different data types
type AnyPrefetch = FetchQueryOptions<any, any, any, QueryKey>;

/**
 * Prefetch every query in parallel. Never throws: `prefetchQuery` already
 * swallows fetch errors, and the `try` covers anything thrown before the fetch
 * starts — a route must render even when its data cannot be had.
 */
export async function prefetchQueries(
  client: QueryClient,
  queries: AnyPrefetch[],
): Promise<void> {
  await Promise.all(
    queries.map(async (query) => {
      try {
        await client.prefetchQuery(query);
      } catch {
        // The client fetches this one itself — today's behaviour.
      }
    }),
  );
}

/** `dehydrate` with the default filter: successful queries only. */
export function dehydrateForClient(client: QueryClient): DehydratedState {
  return dehydrate(client);
}
