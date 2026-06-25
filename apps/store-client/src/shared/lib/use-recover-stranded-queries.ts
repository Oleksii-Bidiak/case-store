"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Recovers React Query data that was stranded by a tab freeze / bfcache restore.
 *
 * When the browser freezes a backgrounded tab (memory pressure, "reopen last
 * session", back/forward cache) it kills any in-flight network requests but does
 * NOT re-evaluate the JS or re-mount the React tree on thaw. A query that was
 * `pending` at freeze time keeps a dead promise that never settles, so React
 * Query still reports `fetchStatus: 'fetching'` and — because it dedupes — never
 * retries on its own. The widget spins on its skeleton forever until a manual
 * reload (which re-evaluates the module). See TASK-120.
 *
 * `visibilitychange → visible` is the one signal every restore path emits
 * (unlike `pageshow.persisted` or Page Lifecycle `resume`, which fire only for
 * some scenarios). On becoming visible, if any query is still `pending` (no data
 * yet), we cancel the abandoned fetches and re-issue the active ones against the
 * live network. The `pending` guard makes a normal tab switch — where every
 * query already resolved — a no-op, so we don't refetch-storm on every focus.
 */
export function useRecoverStrandedQueries(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;

      const hasStranded = queryClient
        .getQueryCache()
        .getAll()
        .some((query) => query.state.status === "pending");
      if (!hasStranded) return;

      void queryClient.cancelQueries();
      void queryClient.refetchQueries({ type: "active" });
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient]);
}
