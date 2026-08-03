import http from "k6/http";
import { sleep } from "k6";
import {
  STAIRCASE,
  apiUrl,
  authHeaders,
  baseUrl,
  record,
  thinkTime,
} from "./lib.js";

/**
 * browse.js — what a shopper actually does, at increasing concurrency.
 *
 * ## Run it
 *
 *   docker run --rm -i -v "$PWD/scripts/load:/load" \
 *     -e BASE_URL=https://staging.example.com \
 *     -e BASIC_AUTH_USER=staging -e BASIC_AUTH_PASS=... \
 *     grafana/k6 run /load/browse.js
 *
 * Run it AGAINST THE STAGING SERVER, from somewhere other than that server.
 * Running it on the box under test means k6 and the shop fight over the same two
 * vCPUs and the result is a number about neither. Running it on Windows/Docker
 * Desktop measures Docker Desktop.
 *
 * ## What it deliberately does NOT do
 *
 * No login, no checkout, no writes. Those are a different question (can the shop
 * take orders) with a different answer, and mixing them makes the read numbers —
 * the ones that decide the server size — impossible to interpret. Admin load is
 * `admin.js`, and it is meant to run AT THE SAME TIME as this one.
 *
 * ## Reading the result
 *
 * The number that matters is the highest step where `page_duration` p95 stays
 * under 800 ms with no 5xx. Feed that step's `http_reqs`/s into the formula in
 * `docs/deploy/10-capacity.md`. `rate_limited_429` above zero invalidates the
 * run for sizing purposes: the shop was refusing work, not doing it.
 */
export const options = {
  stages: STAIRCASE,
  thresholds: {
    // Deliberately NOT `abortOnFail`. A run that stops at the first breach hides
    // where the curve goes next, and "how bad does it get" is half the decision.
    "page_duration{route:/}": ["p(95)<800"],
    "page_duration{route:/products}": ["p(95)<800"],
    "page_duration{route:/products/[slug]}": ["p(95)<800"],
    server_errors_5xx: ["count==0"],
    // 429 is a configuration verdict, not a capacity one — see lib.js.
    rate_limited_429: ["count==0"],
  },
};

const SEARCH_TERMS = ["чохол", "навушники", "павербанк", "скло", "тримач"];

/**
 * Product slugs to open. Overridable because the seeded catalogue changes: a
 * hardcoded slug that 404s makes the PDP step measure the 404 page, which is
 * fast and meaningless.
 */
const SLUGS = (__ENV.PRODUCT_SLUGS ?? "").split(",").filter(Boolean);

export function setup() {
  if (SLUGS.length > 0) return { slugs: SLUGS };

  // Ask the API for real slugs rather than guessing. One call, before the run.
  const res = http.get(`${apiUrl()}/api/products?limit=20`, {
    headers: authHeaders(),
  });
  if (res.status !== 200) {
    throw new Error(
      `Could not list products (${res.status}). Pass PRODUCT_SLUGS=a,b,c to skip this step.`,
    );
  }
  const slugs = (res.json("data") ?? []).map((p) => p.slug).filter(Boolean);
  if (slugs.length === 0) {
    throw new Error("The catalogue is empty — seed it first, or the run measures empty pages.");
  }
  return { slugs };
}

export default function browse(data) {
  const base = baseUrl();
  const headers = authHeaders();

  record(http.get(`${base}/`, { headers }), "/");
  sleep(thinkTime());

  record(http.get(`${base}/products`, { headers }), "/products");
  sleep(thinkTime());

  const slug = data.slugs[Math.floor(Math.random() * data.slugs.length)];
  record(http.get(`${base}/products/${slug}`, { headers }), "/products/[slug]");
  sleep(thinkTime());

  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  record(
    http.get(`${base}/search?q=${encodeURIComponent(term)}`, { headers }),
    "/search",
  );
  sleep(thinkTime());
}
