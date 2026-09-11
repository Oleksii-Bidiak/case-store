"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Re-validates the storefront after a Back/Forward navigation (TASK-409,
 * AD-PROD-16).
 *
 * The live run: an operator hid a product while the shopper was on its page.
 * The shopper went back to the listing — the product was still there — then
 * forward to the product page — still there. Only a hard reload made it
 * disappear, even though the API had been answering 404 the whole time.
 *
 * Why the obvious knob does nothing here: Next's Client Router Cache is often
 * blamed for this, but `experimental.staleTimes.dynamic` already defaults to 0
 * in Next 15+, and these pages are client components anyway — the catalogue and
 * the PDP both read their data from React Query, not from the RSC payload. What
 * the shopper saw was a `staleTime: 5 min` cache entry being served without a
 * refetch, which is correct behaviour for a forward navigation and wrong for a
 * return to a page that may have changed underneath.
 *
 * So both caches are addressed, each by its own mechanism:
 *   - every React Query entry is marked stale, and the ones currently mounted
 *     refetch. Marking is what matters for a restore: the page being restored
 *     has not mounted yet at `popstate` time, and its queries refetch on mount
 *     precisely because they are stale by then.
 *   - `router.refresh()` re-fetches the RSC payload, which is where the
 *     server-rendered parts live (JSON-LD, prerendered rails).
 *
 * Scoped to `popstate`, so it costs nothing on ordinary in-app navigation: a
 * shopper who clicks their way forward keeps every cached page as-is.
 */
export function useRefreshOnBackNavigation(): void {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const onPopState = () => {
      // Default `refetchType: 'active'` — mounted observers refetch now,
      // everything else is simply marked stale for its next mount.
      void queryClient.invalidateQueries();
      router.refresh();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [queryClient, router]);
}
