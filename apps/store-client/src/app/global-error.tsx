"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { dict, H1_CLASS } from "@/shared/config";
// global-error replaces the root layout, and with it the layout's stylesheet
// import — without this the token classes below would render unstyled.
import "./globals.css";

/**
 * App Router global error boundary — the last-resort fallback.
 *
 * Catches only what escapes `app/error.tsx` (TASK-880): errors thrown in the
 * root layout itself. It replaces that layout, so it renders its own
 * `<html>`/`<body>` with no Providers, Header or Footer, and stays
 * dependency-light on purpose — plain elements, the dictionary and the
 * stylesheet; nothing that needs a provider or could fail the same way the
 * layout just did. The home link is a plain `<a>`: a full reload is the
 * recovery when the layout is broken. The error is forwarded to Sentry (no-op
 * when the SDK is disabled, i.e. no `NEXT_PUBLIC_SENTRY_DSN`).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const c = dict.common;

  return (
    <html lang="uk">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {/* No `metadata` export in an error boundary — React hoists this. */}
        <title>{c.errorTitle}</title>
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <div role="alert" className="flex flex-col gap-4">
            <h1 className={H1_CLASS}>{c.errorTitle}</h1>
            <p className="text-muted-foreground">{c.errorBody}</p>
          </div>
          <div className="mt-4 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-12 items-center justify-center rounded-cta bg-primary px-6 font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {c.retry}
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the layout is what failed: reload fully, not a soft navigation */}
            <a
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-cta border border-border bg-background px-6 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {c.goHome}
            </a>
          </div>
          {error.digest && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {c.errorCode(error.digest)}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
