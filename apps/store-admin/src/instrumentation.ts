import * as Sentry from "@sentry/nextjs";

/**
 * Next.js server instrumentation hook (Next 16 `instrumentation.ts` convention).
 *
 * `register` runs once per server instance before requests are served. Runtime-
 * specific Sentry config is lazily imported so the correct SDK loads per runtime.
 * All init is DSN-gated — a no-op without `NEXT_PUBLIC_SENTRY_DSN`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports errors thrown during RSC rendering / route handlers to Sentry.
export const onRequestError = Sentry.captureRequestError;
