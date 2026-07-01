import * as Sentry from "@sentry/nextjs";

/**
 * Next.js server instrumentation hook (Next 16 `instrumentation.ts` convention).
 *
 * `register` runs once per server instance before requests are served. We lazily
 * import the runtime-specific Sentry config so the Node SDK is only loaded in the
 * Node runtime and the Edge SDK only in the Edge runtime. All init is DSN-gated,
 * so this is a no-op without `NEXT_PUBLIC_SENTRY_DSN`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports errors thrown during React Server Component rendering / route handlers
// to Sentry. No-op when the SDK is disabled (no DSN).
export const onRequestError = Sentry.captureRequestError;
