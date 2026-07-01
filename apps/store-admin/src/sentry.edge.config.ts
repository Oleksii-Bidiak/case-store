import * as Sentry from "@sentry/nextjs";

/**
 * Sentry init for the Edge runtime (middleware / edge routes).
 *
 * Config-gated no-op: inert when `NEXT_PUBLIC_SENTRY_DSN` is unset.
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
