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
