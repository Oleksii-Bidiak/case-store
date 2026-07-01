"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * App Router global error boundary.
 *
 * Catches errors thrown in the root layout/template that escape nested `error.tsx`
 * boundaries. It must render its own `<html>`/`<body>` because it replaces the
 * root layout. The error is forwarded to Sentry (no-op when the SDK is disabled,
 * i.e. no `NEXT_PUBLIC_SENTRY_DSN`).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="uk">
      <body className="min-h-screen bg-background text-foreground">
        <main
          role="alert"
          className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <h1 className="font-sans text-2xl font-bold">Щось пішло не так</h1>
          <p className="text-muted-foreground">
            Сталася неочікувана помилка. Спробуйте оновити сторінку.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Спробувати ще раз
          </button>
        </main>
      </body>
    </html>
  );
}
