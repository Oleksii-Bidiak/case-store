import http from "k6/http";
import { apiUrl, authHeaders, baseUrl, record } from "./lib.js";

/**
 * images.js — isolate the single most expensive thing the storefront does.
 *
 * Every distinct (source, width, quality) combination is decoded, resized and
 * re-encoded by the storefront's own Node process. On a 2-vCPU box that is
 * 100-400 ms of pinned CPU per miss, and a catalogue page with 20 cards at 2-3
 * srcset widths is 40-60 misses. It is the first thing to saturate, and it does
 * so in a way `browse.js` cannot show cleanly, because there a slow image and a
 * slow database look identical.
 *
 * ## Run it TWICE — cold, then warm
 *
 *   # cold: the optimizer cache is empty
 *   docker compose -f docker-compose.prod.yml restart store-client
 *   docker run --rm -i -v "$PWD/scripts/load:/load" -e BASE_URL=... \
 *     -e RUN_LABEL=cold grafana/k6 run /load/images.js
 *
 *   # warm: immediately again, same widths
 *   docker run --rm -i -v "$PWD/scripts/load:/load" -e BASE_URL=... \
 *     -e RUN_LABEL=warm grafana/k6 run /load/images.js
 *
 * THE GAP BETWEEN THE TWO IS THE RESULT. Cold p95 is what your visitors get
 * after every deploy; warm p95 is what they get the rest of the time. Before
 * TASK-387 the cache lived inside the container with no volume, so every `up -d`
 * put every visitor back on the cold number — which is why measuring only the
 * warm case would have shown a healthy shop that was anything but.
 *
 * Watch `docker stats` on the server while this runs. If `store_prod_client`
 * pins both cores here and nowhere else, the answer is the Caddy cache header
 * and the cache volume (TASK-387), not a bigger server.
 */
export const options = {
  vus: Number(__ENV.VUS ?? 10),
  duration: __ENV.DURATION ?? "2m",
  thresholds: {
    // No p95 threshold on purpose: a COLD run is expected to be slow, and a
    // threshold that fails by design trains people to ignore thresholds. The
    // comparison between the two labelled runs is the assertion.
    server_errors_5xx: ["count==0"],
    rate_limited_429: ["count==0"],
  },
};

/** Widths worth measuring: the ones `next/image` actually requests on our grid. */
const WIDTHS = [256, 384, 640, 750, 828];

export function setup() {
  const res = http.get(`${apiUrl()}/api/products?limit=30`, {
    headers: authHeaders(),
  });
  if (res.status !== 200) {
    throw new Error(`Could not list products (${res.status}).`);
  }

  // Only products that actually have an image — a missing one would measure the
  // optimizer's 404 path, which is fast and tells you nothing.
  const sources = (res.json("data") ?? [])
    .map((p) => p.primaryImage?.url ?? p.images?.[0]?.url)
    .filter(Boolean);

  if (sources.length === 0) {
    throw new Error(
      "No product images found. Seed the catalogue (docs/seed-guide.md) — an " +
        "empty catalogue makes this script measure nothing.",
    );
  }
  return { sources };
}

export default function optimize(data) {
  const base = baseUrl();
  const headers = authHeaders();
  const src = data.sources[Math.floor(Math.random() * data.sources.length)];
  const width = WIDTHS[Math.floor(Math.random() * WIDTHS.length)];

  const url = `${base}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
  record(http.get(url, { headers }), `/_next/image w=${width}`);
}
