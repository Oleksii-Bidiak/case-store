import { check } from "k6";
import encoding from "k6/encoding";
import { Counter, Trend } from "k6/metrics";

/**
 * Shared helpers for the k6 load scripts (TASK-392).
 *
 * The scripts exist to answer one question the repository could not answer at
 * all before: WHICH SERVER TO BUY. Every capacity number written down until now
 * was inferred from configuration — container memory limits, a connection-pool
 * size, an image pipeline read top to bottom — and inference is exactly what put
 * a single shared rate-limit bucket in production without anyone noticing.
 *
 * Read `docs/deploy/10-capacity.md` before running anything: WHERE you run these
 * changes what the numbers mean far more than the numbers themselves.
 */

/**
 * 429 counted SEPARATELY from every other failure.
 *
 * This is the metric that made the whole harness worth writing. A rate-limited
 * response is not "the server is overloaded" — it is "the server refused before
 * doing any work", and the two demand opposite reactions: one says buy a bigger
 * box, the other says fix a limit. Folded into `http_req_failed` they are
 * indistinguishable, and the cheap misreading (`p95 is fine, errors are low, we
 * are done`) is the one that costs money.
 */
export const rateLimited = new Counter("rate_limited_429");

/** Server errors — the only bucket that means the box is actually in trouble. */
export const serverErrors = new Counter("server_errors_5xx");

/** Page-view latency, the number the sizing formula consumes. */
export const pageDuration = new Trend("page_duration", true);

/**
 * Record one response under a stable name and classify its failure mode.
 *
 * `name` must be the ROUTE, never the concrete URL: k6 groups by tag value, and
 * tagging with `/products/iphone-15-case` instead of `/products/[slug]` produces
 * one row per product and no usable percentile.
 */
export function record(res, name) {
  pageDuration.add(res.timings.duration, { route: name });

  if (res.status === 429) {
    rateLimited.add(1, { route: name });
  } else if (res.status >= 500) {
    serverErrors.add(1, { route: name });
  }

  return check(res, {
    [`${name} → 2xx/3xx`]: (r) => r.status >= 200 && r.status < 400,
  });
}

/**
 * Base URL of the stand under test. No default on purpose: a default of
 * localhost is how a load test silently measures the laptop it runs on.
 */
export function baseUrl() {
  const url = __ENV.BASE_URL;
  if (!url) {
    throw new Error(
      "BASE_URL is required, e.g. BASE_URL=https://staging.example.com. " +
        "Refusing to guess — see docs/deploy/10-capacity.md.",
    );
  }
  return url.replace(/\/+$/, "");
}

/** API origin; defaults to the `api.` sibling of BASE_URL, which is our layout. */
export function apiUrl() {
  if (__ENV.API_URL) return __ENV.API_URL.replace(/\/+$/, "");
  const url = new URL(baseUrl());
  return `${url.protocol}//api.${url.host}`;
}

/**
 * Optional basic-auth header. Staging sits behind `basic_auth` in
 * `Caddyfile.staging`, and without this every single request is a 401 — a run
 * that looks blazingly fast and measures nothing at all.
 */
export function authHeaders() {
  const user = __ENV.BASIC_AUTH_USER;
  const pass = __ENV.BASIC_AUTH_PASS;
  if (!user || !pass) return {};
  return { Authorization: `Basic ${encoding.b64encode(`${user}:${pass}`)}` };
}

/**
 * A shopper's pause between clicks, in seconds.
 *
 * Load tests that hammer with no think time measure a benchmark, not a shop:
 * they answer "how many requests per second" when the question is "how many
 * PEOPLE". The sizing formula in `10-capacity.md` divides by this exact number,
 * so if you change it there, change it here.
 */
export const THINK_TIME_SECONDS = { min: 3, max: 8 };

export function thinkTime() {
  const { min, max } = THINK_TIME_SECONDS;
  return min + Math.random() * (max - min);
}

/**
 * Ramp shared by the browsing scenarios: a staircase, not a spike.
 *
 * Each step holds long enough for caches to warm and for a queue to build if one
 * is going to. A spike tells you where the cliff is; a staircase tells you where
 * the shop stops being pleasant, which is the number the purchase decision needs.
 */
export const STAIRCASE = [
  { duration: "1m", target: 5 },
  { duration: "2m", target: 5 },
  { duration: "1m", target: 20 },
  { duration: "2m", target: 20 },
  { duration: "1m", target: 50 },
  { duration: "2m", target: 50 },
  { duration: "1m", target: 100 },
  { duration: "2m", target: 100 },
  { duration: "1m", target: 0 },
];
