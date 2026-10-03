"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { Home, RotateCw, TriangleAlert } from "lucide-react";
import { dict, H1_CLASS, PAGE_CONTAINER } from "@/shared/config";
import { Button } from "@/shared/ui";

/**
 * Segment error boundary (TASK-880).
 *
 * Wraps every page under the root layout, so a render or data error in one
 * route shows this block in `<main>` while the Header and Footer stay — the
 * shopper keeps the catalogue, search and cart one click away. Errors in the
 * root layout itself escape to `global-error.tsx`.
 *
 * `retry` (stable since Next 16.3) refreshes the router before re-rendering, so
 * a Server Component that failed on a flaky API read is fetched again; the
 * older `reset` would only re-render the cached failure.
 */
export default function SegmentError({
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
    <section className={`${PAGE_CONTAINER} py-16 md:py-24`}>
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="mb-5 inline-flex size-18 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <TriangleAlert className="size-8" strokeWidth={1.6} />
        </span>
        {/* Announced on arrival: the shopper may have clicked a link and
            landed here with focus still on the page body. */}
        <div role="alert">
          <h1 className={`${H1_CLASS} text-foreground`}>{c.errorTitle}</h1>
          <p className="mt-3 text-base text-muted-foreground">{c.errorBody}</p>
        </div>

        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
          <Button
            type="button"
            size="lg"
            onClick={() => retry()}
            className="h-12 rounded-cta px-6 text-base font-bold"
          >
            <RotateCw aria-hidden="true" />
            {c.retry}
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-cta px-6 text-base font-semibold"
          >
            <Link href="/">
              <Home aria-hidden="true" />
              {c.goHome}
            </Link>
          </Button>
        </div>

        {error.digest && (
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            {c.errorCode(error.digest)}
          </p>
        )}
      </div>
    </section>
  );
}
