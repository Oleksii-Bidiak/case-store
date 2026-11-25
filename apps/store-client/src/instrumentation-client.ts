import {
  captureException,
  captureMessage,
  captureRouterTransitionStart,
  initMonitoring,
} from "@/shared/lib/monitoring";

/**
 * Next.js client instrumentation (Next 16 `instrumentation-client.ts` convention).
 *
 * Runs in the browser after the document loads and before hydration. Config-gated
 * no-op: when `NEXT_PUBLIC_SENTRY_DSN` is unset, the SDK is never loaded and
 * nothing is sent.
 *
 * The Sentry SDK is NOT imported here (TASK-2524): a static import put ~70 kB
 * gzipped into the first-load JavaScript of every page. It is loaded once the
 * page has painted (`load`, then an idle slot). Until then two listeners catch
 * uncaught errors and rejections into the `monitoring` queue, so an error
 * during hydration is still reported; they step aside the moment `Sentry.init`
 * runs, because Sentry's own GlobalHandlers take over from there.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Upper bound for the idle wait, so a busy page still gets error tracking. */
const IDLE_TIMEOUT_MS = 3000;

if (dsn && typeof window !== "undefined") {
  const onEarlyError = (event: ErrorEvent) =>
    captureException(event.error ?? event.message);
  const onEarlyRejection = (event: PromiseRejectionEvent) =>
    captureException(event.reason);

  window.addEventListener("error", onEarlyError);
  window.addEventListener("unhandledrejection", onEarlyRejection);

  const start = () => {
    initMonitoring((Sentry) => {
      Sentry.init({
        dsn,
        enabled: !!dsn,
        environment:
          process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
        tracesSampleRate:
          Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) || 0,
      });
      // Same task as init: no error can slip between the two handlers.
      window.removeEventListener("error", onEarlyError);
      window.removeEventListener("unhandledrejection", onEarlyRejection);
    }).catch(() => {
      // The SDK chunk failed to load: there is nothing left to report with.
    });
  };

  const schedule = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
    } else {
      setTimeout(start, 0);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

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

    captureMessage(
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

// Adds router-navigation instrumentation for client transitions; a no-op until
// the SDK has loaded. Sentry's build plugin looks for this export by name.
export const onRouterTransitionStart = captureRouterTransitionStart;
