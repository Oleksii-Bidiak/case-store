import * as Sentry from "@sentry/nextjs";

/**
 * Sentry init for the Node.js server runtime (RSC / route handlers / SSR).
 *
 * Config-gated no-op: when `NEXT_PUBLIC_SENTRY_DSN` is unset, `enabled` is false,
 * so the SDK never initialises a transport and every capture is inert. The app
 * builds, boots, and runs identically with no DSN configured.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  // Performance tracing off by default; opt in via env (0..1).
  tracesSampleRate:
    Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) || 0,
});
