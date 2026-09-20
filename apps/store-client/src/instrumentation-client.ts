import * as Sentry from "@sentry/nextjs";

/**
 * Next.js client instrumentation (Next 16 `instrumentation-client.ts` convention).
 *
 * Runs in the browser after the document loads and before hydration — the ideal
 * point to initialise error tracking. Config-gated no-op: when
 * `NEXT_PUBLIC_SENTRY_DSN` is unset, `enabled` is false and nothing is sent.
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

/**
 * CSP violations → Sentry (TASK-452).
 *
 * The storefront's policy is ENFORCING and deliberately ships one live
 * breakage: an image on a host outside `NEXT_PUBLIC_IMAGE_HOSTS` is blocked
 * (TASK-745). Without a report channel the only detector is a person with
 * DevTools open, and the manual check runs once per deploy — not on the day a
 * content manager pastes a foreign cover URL. `report-to` would need an
 * endpoint to host; this needs nothing, because Sentry is already here.
 *
 * Deduplicated per directive+host so one blocked hero image in a loop cannot
 * flood the quota.
 */
if (dsn && typeof document !== "undefined") {
  const seen = new Set<string>();

  document.addEventListener("securitypolicyviolation", (event) => {
    const key = `${event.effectiveDirective}|${event.blockedURI}`;
    if (seen.has(key)) return;
    seen.add(key);

    Sentry.captureMessage(
      `CSP blocked ${event.effectiveDirective}: ${event.blockedURI}`,
      {
        level: "warning",
        tags: {
          csp_directive: event.effectiveDirective,
          csp_disposition: event.disposition,
        },
        extra: {
          blockedURI: event.blockedURI,
          documentURI: event.documentURI,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
        },
      },
    );
  });
}

// Adds router-navigation breadcrumbs / instrumentation for client transitions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
