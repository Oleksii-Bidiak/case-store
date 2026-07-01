import * as Sentry from '@sentry/nestjs';

/**
 * Sentry initialisation for the NestJS API.
 *
 * This module is imported FIRST in `main.ts` (before `AppModule`) so the SDK can
 * patch Node internals and NestJS before any application code runs — that is a
 * hard requirement of `@sentry/nestjs`.
 *
 * Config-gated no-op: when `SENTRY_DSN` is absent, `enabled` is `false`, so
 * `Sentry.init` performs no network setup and every `captureException` call
 * becomes inert. The whole feature is therefore dormant in local dev / CI and
 * needs no live Sentry account to build, boot, or test.
 */
const dsn = process.env.SENTRY_DSN;

// Traces are off by default (0). Operators opt into performance tracing by
// setting SENTRY_TRACES_SAMPLE_RATE (0..1); an unparseable value falls back to 0.
const parsedTracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
const tracesSampleRate = Number.isFinite(parsedTracesSampleRate) ? parsedTracesSampleRate : 0;

Sentry.init({
  dsn,
  // Only active when a DSN is configured — keeps the SDK a no-op otherwise.
  enabled: !!dsn,
  // Prefer an explicit SENTRY_ENVIRONMENT, else fall back to the runtime env.
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  tracesSampleRate,
});
