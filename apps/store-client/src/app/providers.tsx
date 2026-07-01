"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { AuthProvider } from "@/entities/session";
import { Toaster } from "@/shared/ui";
import { useRecoverStrandedQueries } from "@/shared/lib/use-recover-stranded-queries";

/**
 * Renderless glue: revives queries left wedged by a tab freeze / bfcache restore
 * (TASK-120). Must live inside QueryClientProvider so it can read the client.
 */
function QueryRecovery() {
  useRecoverStrandedQueries();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
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
