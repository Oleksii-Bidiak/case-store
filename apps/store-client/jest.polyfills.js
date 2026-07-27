/**
 * Fetch/stream API polyfills for the jsdom test environment.
 *
 * MSW v2 (and @mswjs/interceptors) reference Request/Response/streams/etc. at
 * module load and patch some of them at runtime, but jest's jsdom environment
 * does not expose them. This file runs via `setupFiles` (before the test
 * framework) to define them from Node's built-ins + undici. Properties are
 * `configurable`/`writable` so the interceptors can redefine them.
 *
 * Order matters: the encoder/stream globals must exist before `undici` is
 * required, since undici references TextEncoder at module-load time.
 *
 * @see https://mswjs.io/docs/migrations/1.x-to-2.x/#frequent-issues (jsdom)
 */
const { TextDecoder, TextEncoder } = require("node:util");
const { ReadableStream, TransformStream, WritableStream } = require("node:stream/web");
const { BroadcastChannel } = require("node:worker_threads");
const { Blob, File } = require("node:buffer");

/** Define each global as configurable + writable so MSW can patch it. */
function defineGlobals(globals) {
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
}

// Encoder/stream globals first — undici reads TextEncoder when it loads.
defineGlobals({
  TextDecoder,
  TextEncoder,
  ReadableStream,
  TransformStream,
  WritableStream,
  BroadcastChannel,
  Blob,
  File,
});

const { fetch, Headers, FormData, Request, Response } = require("undici");

defineGlobals({ fetch, Headers, FormData, Request, Response });

/**
 * `AbortSignal.timeout()` / `AbortSignal.any()` (TASK-327).
 *
 * jsdom 20 (what jest-environment-jsdom@29 bundles) ships AbortController and
 * AbortSignal but not these two statics. They exist on the `node:22-slim`
 * runtime the storefront actually runs on, and `shared/api/server-fetch.ts`
 * uses them on EVERY server-side request to bound it.
 *
 * Without these shims the gap fails silently in the worst possible way: the
 * fetcher throws `AbortSignal.timeout is not a function`, each caller's `catch`
 * swallows it, and every async Server Component test renders its "API is down"
 * fallback while still reporting green. Polyfilling the environment — rather
 * than softening `serverFetch` — keeps the tests exercising the same code path
 * production runs.
 */
if (typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = function timeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(
        new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        ),
      );
    }, ms);
    // A pending deadline must never hold a Jest worker open.
    if (typeof timer.unref === "function") timer.unref();
    return controller.signal;
  };
}

if (typeof AbortSignal.any !== "function") {
  AbortSignal.any = function any(signals) {
    const controller = new AbortController();
    const list = Array.from(signals);

    const alreadyAborted = list.find((signal) => signal.aborted);
    if (alreadyAborted) {
      controller.abort(alreadyAborted.reason);
      return controller.signal;
    }

    for (const signal of list) {
      signal.addEventListener("abort", () => controller.abort(signal.reason), {
        once: true,
      });
    }
    return controller.signal;
  };
}
