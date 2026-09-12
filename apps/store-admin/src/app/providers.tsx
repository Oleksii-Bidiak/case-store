"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { AuthProvider } from "@/entities/session";
import { dict } from "@/shared/config";
import { Toaster } from "@/shared/ui";

/**
 * How long a toast stays on screen, in ms.
 *
 * sonner's own default is 4000 ms, which is short for an operator reading a
 * sentence in Ukrainian while looking at something else on the page — the
 * message is gone before it has been read, and there is no history to recall it
 * from. 6000 ms is long enough to read a two-line message, short enough that a
 * queue of successes does not pile up.
 *
 * Paired with `closeButton` below: sonner pauses the timer while a toast is
 * hovered or focused, so the operator can hold a message open and then dismiss
 * it deliberately instead of waiting it out.
 */
const TOAST_DURATION_MS = 6000;

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
      <AuthProvider>{children}</AuthProvider>
      {/*
       * `closeButton` renders a dismiss control on every toast. Swipe-to-dismiss
       * (sonner's default) keeps working alongside it — neither prop below
       * disables it. Its accessible name has to be passed explicitly: sonner
       * falls back to an English "Close toast", which is the only untranslated
       * string the panel would expose to a screen reader.
       *
       * The duration below is the SUCCESS policy only. Errors must wait to be
       * read, and that cannot be expressed here: sonner 2.0.7's `ToastOptions`
       * is a FLAT object applied identically to every toast regardless of type
       * (no `toastOptions.error.duration` exists), and the runtime resolves a
       * single duration for all of them — only a per-call value beats it. So
       * the per-type rule lives in `@/shared/ui/toast`, the one module every
       * admin toast goes through; it passes `duration: Infinity` on `.error`.
       * Read that file before changing the number below.
       */}
      <Toaster
        richColors
        position="top-right"
        closeButton
        toastOptions={{
          duration: TOAST_DURATION_MS,
          closeButtonAriaLabel: dict.common.close,
        }}
      />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
