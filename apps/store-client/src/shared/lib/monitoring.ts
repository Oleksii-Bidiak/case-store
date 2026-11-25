import type * as SentrySdk from "@sentry/nextjs";

/**
 * Lazy front door to the Sentry browser SDK (TASK-2524).
 *
 * The SDK is ~70 kB gzipped. Imported statically it sat in the first-load
 * JavaScript of every storefront page; `instrumentation-client.ts` now loads it
 * after the page has painted and calls `initMonitoring`. Every client call site
 * reports through this module instead of `@sentry/nextjs`: a call made before
 * the SDK is ready is queued and replayed, in order, the moment `init` has run —
 * so an error thrown during hydration still reaches Sentry.
 *
 * Without a DSN `initMonitoring` is never called: calls queue up to the cap and
 * are dropped, which matches the old disabled SDK (nothing is sent).
 *
 * Browser-only and deliberately NOT in the `@/shared/lib` barrel, which server
 * components import — import it by path.
 */
type Sentry = typeof SentrySdk;
type PendingCall = (sdk: Sentry) => void;

/** Calls kept while the SDK loads. The first errors are the useful ones, so later calls are dropped. */
export const MONITORING_QUEUE_CAP = 50;

let sdk: Sentry | null = null;
let loading: Promise<Sentry> | null = null;
let queue: PendingCall[] = [];

/** Load the SDK once; every caller shares the same promise. */
export function loadSentry(): Promise<Sentry> {
  loading ??= import("@sentry/nextjs");
  return loading;
}

/**
 * Load the SDK, run `init` (where `Sentry.init` belongs), then replay the queue.
 * Calls made inside `init` are still queued, so they run after it, not before.
 */
export async function initMonitoring(
  init: (sdk: Sentry) => void,
): Promise<void> {
  const loaded = await loadSentry();
  init(loaded);
  sdk = loaded;
  const pending = queue;
  queue = [];
  for (const call of pending) call(loaded);
}

function run(call: PendingCall): void {
  if (sdk) call(sdk);
  else if (queue.length < MONITORING_QUEUE_CAP) queue.push(call);
}

export function captureException(
  ...args: Parameters<Sentry["captureException"]>
): void {
  run((s) => s.captureException(...args));
}

export function captureMessage(
  ...args: Parameters<Sentry["captureMessage"]>
): void {
  run((s) => s.captureMessage(...args));
}

export function addBreadcrumb(
  ...args: Parameters<Sentry["addBreadcrumb"]>
): void {
  run((s) => s.addBreadcrumb(...args));
}

/**
 * Next's `onRouterTransitionStart` hook. Not queued: it only starts navigation
 * spans, and a navigation that began before the SDK existed cannot be traced
 * after the fact (storefront tracing is 0% anyway).
 */
export function captureRouterTransitionStart(
  ...args: Parameters<Sentry["captureRouterTransitionStart"]>
): void {
  sdk?.captureRouterTransitionStart(...args);
}
