"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
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
    /* ThemeProvider is the OUTERMOST provider (TASK-412): it renders an inline
       script that sets `data-theme` on <html> before first paint, so it must be
       able to run without waiting on anything else, and every consumer below —
       the header switch, the account settings, <Toaster /> — reads its context.
       `attribute="data-theme"` matches the selectors in globals.css;
       `enableSystem` + `defaultTheme="system"` keep "follow the OS" the default
       for a first-time visitor (the storefront behaved that way before a manual
       choice existed); `disableTransitionOnChange` suppresses every CSS
       transition for the duration of the switch, so flipping the theme repaints
       once instead of animating a few hundred colours at different speeds.
       The choice is persisted by next-themes in localStorage under `theme`.
       NOTE: <html> in layout.tsx needs `suppressHydrationWarning` because that
       script mutates the element the server just rendered. */
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <QueryRecovery />
        <AuthProvider>
          {children}
          <Toaster />
          <ReactQueryDevtools initialIsOpen={false} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
