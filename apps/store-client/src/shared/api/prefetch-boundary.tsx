"use client";

import { useState, type ReactNode } from "react";
import {
  HydrationBoundary,
  hydrate,
  useQueryClient,
  type DehydratedState,
} from "@tanstack/react-query";

/**
 * `HydrationBoundary` for the server-prefetched catalogue routes (TASK-563),
 * plus one rule it does not have: a prefetched query that is already in the
 * cache WITHOUT data is filled in render, not after it.
 *
 * ## Why the stock boundary is not enough
 *
 * `HydrationBoundary` hydrates a query in render only when the cache has never
 * seen it. A query that already exists is hydrated in an effect — deliberately,
 * so a transition does not repaint the current page with the next page's data.
 * But the root layout renders BEFORE the page, and the header asks for the
 * category tree (its catalogue flyout). By the time `/categories` reaches its
 * boundary, the tree query exists — empty, `pending` — so the stock boundary
 * defers it to an effect. Effects never run on the server: the first HTML of
 * `/categories` was the skeleton, with the tree sitting unused in the payload.
 * Measured with `curl` on a production build before this component existed.
 *
 * ## Why filling an empty query in render is safe
 *
 * The reason for deferring does not apply to it. There is no data on screen for
 * the new data to replace — whoever observes the query is showing its loading
 * state — so filling it during a transition cannot flash the wrong page's
 * content. Queries that DO hold data keep the stock behaviour (deferred), which
 * is also why this is not a blanket `hydrate()` in render.
 *
 * `hydrate` notifies observers through React Query's batched scheduler, i.e.
 * after the render; and during the hydration pass the layout's observers have
 * not subscribed yet (that happens on commit). Nothing is set during another
 * component's render. The layout's consumers of the same key render their empty
 * state on both server and client (the header's flyout is closed), so the two
 * HTMLs agree.
 */
export function PrefetchBoundary({
  state,
  children,
}: {
  state: DehydratedState;
  children: ReactNode;
}) {
  const client = useQueryClient();

  // Once per mount, in render (a lazy `useState` initializer). Idempotent, so a
  // StrictMode double render changes nothing.
  useState(() => {
    const cache = client.getQueryCache();
    const emptyInCache = state.queries.filter((query) => {
      const existing = cache.get(query.queryHash);
      return existing !== undefined && existing.state.data === undefined;
    });
    if (emptyInCache.length > 0) {
      hydrate(client, { mutations: [], queries: emptyInCache });
    }
    return null;
  });

  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
