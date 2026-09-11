"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { AuthProvider } from "@/entities/session";
import { Toaster } from "@/shared/ui";
import { useRecoverStrandedQueries } from "@/shared/lib/use-recover-stranded-queries";
import { useRefreshOnBackNavigation } from "@/shared/lib/use-refresh-on-back-navigation";

/**
 * Renderless glue: revives queries left wedged by a tab freeze / bfcache restore
 * (TASK-120), and re-validates everything the shopper returns to with the Back
 * button (TASK-409). Must live inside QueryClientProvider so it can read the
 * client.
 */
function QueryRecovery() {
  useRecoverStrandedQueries();
  useRefreshOnBackNavigation();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            // Keep an UNUSED query's data for half an hour (TASK-409). The
            // default gcTime is 5 minutes — the same as `staleTime` above — so
            // leaving a page dropped its cache entry at roughly the moment it
            // went stale, and stepping between sibling positions on the PDP
            // re-fetched each one from a skeleton every single time. With a
            // longer gcTime the entry is still there on return: the page paints
            // from cache at once and revalidates in the background if stale.
            // Correctness is unaffected — `staleTime` still decides when data is
            // re-fetched, `gcTime` only how long an idle copy is kept.
            gcTime: 1000 * 60 * 30, // 30 minutes
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <QueryRecovery />
      <AuthProvider>
        {children}
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
