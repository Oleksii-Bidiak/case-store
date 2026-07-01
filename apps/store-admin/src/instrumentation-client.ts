import * as Sentry from "@sentry/nextjs";

/**
 * Next.js client instrumentation (Next 16 `instrumentation-client.ts` convention).
 *
 * Runs in the browser after the document loads and before hydration. Config-gated
 * no-op: when `NEXT_PUBLIC_SENTRY_DSN` is unset nothing is captured or sent.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate:
    Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) || 0,
});

// Adds router-navigation instrumentation for client transitions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
