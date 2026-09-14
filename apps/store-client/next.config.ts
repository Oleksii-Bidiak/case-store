import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Product images are served by store-api from `${PUBLIC_BASE_URL}/uploads/...`,
// which mirrors NEXT_PUBLIC_API_URL on the client. `next/image` refuses any
// remote `src` whose origin is not whitelisted here, so the optimizer's allowed
// origin is derived from that single env var — one variable drives dev
// (localhost:3001) and production (e.g. https://api.mystore.ua) without
// duplicating host/port.
//
// NOTE: next.config runs at build time, so this value is baked into the build
// artifact. Changing the API host requires a rebuild — it is not read at runtime.
const apiUrl = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
);

/**
 * Extra image hosts an operator may allow (TASK-289): `Category.image` is a
 * free-text admin field, so a store that keeps its category art on a CDN needs a
 * way in without a code change. Comma-separated **bare hostnames**
 * (`cdn.mystore.ua,images.brand.com`) — anything with a scheme, port, path,
 * whitespace or a wildcard is dropped with a warning.
 *
 * Deliberately NOT a wildcard/`**` allow-any pattern: the image optimizer fetches
 * whatever host it is told to, so a permissive pattern turns it into an SSRF
 * vector and a free bandwidth proxy. Exact hostnames only — the trade-off is that
 * adding a CDN needs an env change + rebuild (next.config is build-time), which
 * is the intended friction. URLs on any other host fall back to the icon/gradient
 * tile (`shared/ui/category-tile-image.tsx` pre-checks the same rules client-side,
 * so they never reach the optimizer).
 */
const HOSTNAME_RE = /^[a-z0-9.-]+$/;
const extraImageHosts = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter((host) => host.length > 0)
  .filter((host) => {
    if (HOSTNAME_RE.test(host)) return true;
    console.warn(
      `[next.config] NEXT_PUBLIC_IMAGE_HOSTS: ignoring invalid hostname "${host}" ` +
        "(bare hostnames only — no scheme, port, path or wildcard)",
    );
    return false;
  });

/**
 * Storefront security headers. `X-Frame-Options: SAMEORIGIN` is safe here — no
 * page is meant to be framed by third parties. No CSP: Next injects inline
 * <style>/<script> (RSC payload, next/font, the theme-flash guard) whose hashes
 * we do not control, so a hand-written policy would either break rendering or be
 * neutered by `unsafe-inline`. A nonce-based CSP needs a middleware + a
 * `Content-Security-Policy` wired through `next/headers`; tracked separately.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

// Deliberately NO `experimental.staleTimes` block (TASK-409). Stale storefront
// content after a Back navigation (AD-PROD-16) gets blamed on Next's Client
// Router Cache, but `staleTimes.dynamic` has defaulted to 0 since Next 15 (see
// the defaults in `next/dist/server/config-shared.js`), so pinning it here would
// be a no-op that reads like a fix. The catalogue and the PDP are client
// components fed by React Query, so the stale copy lives in THAT cache — it is
// invalidated on `popstate` by `shared/lib/use-refresh-on-back-navigation`.
const nextConfig: NextConfig = {
  // Per-page budget for static generation, in seconds (TASK-327).
  //
  // This is a SAFETY NET, NOT THE FIX. The real bound is on the requests
  // themselves: every server-side call goes through `shared/api/server-fetch.ts`,
  // which always attaches `AbortSignal.timeout(...)` (5 s by default). No page
  // chains more than ~3 sequential server fetches, so a page whose API is dead
  // or — worse — silent now finishes in ~15 s worst case and renders its
  // fallback content, instead of hanging forever on a `fetch` with no deadline.
  //
  // Why the net still matters: this value only ever bounds the *rest* of
  // rendering — cold Next.js startup, first-page compile, React work — on a
  // small VPS where CPU is scarce and the 60 s default can be genuinely tight.
  // 90 s buys that headroom while staying far above the ~15 s fetch ceiling, so
  // an exceeded budget here means "the box is slow", never "an API hung".
  //
  // Why an over-run is so expensive, and where `after 3 attempts` comes from:
  // on a timeout Next restarts the page's worker and retries it 3 times
  // (hardcoded in next/dist/export/worker.js), then, with `prerenderEarlyExit`,
  // kills the whole build — `Failed to build /<page> after 3 attempts`. With the
  // root layout fetching SEO settings, one hanging API therefore took down
  // *every* prerendered page, which is exactly how the storefront image stopped
  // building.
  staticPageGenerationTimeout: 90,
  // Produce a self-contained `.next/standalone` server for Docker (TASK-270).
  // `outputFileTracingRoot` points at the monorepo root (two levels up) so the
  // dependency trace reaches the hoisted root node_modules + packages/*; in a
  // monorepo this emits server.js nested at
  // `.next/standalone/apps/store-client/server.js` (see the Dockerfile CMD).
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    // Canonical origin + currency for SEO (sitemap, robots, JSON-LD, canonical).
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_CURRENCY: process.env.NEXT_PUBLIC_CURRENCY,
  },
  images: {
    // Whitelist exactly the store-api uploads origin. An empty `port` matches a
    // URL that carries no explicit port either (`match-remote-pattern.js`
    // compares `url.port` to the pattern's), which is what a production
    // `https://api.mystore.ua` looks like — it is NOT "any port", so a src on a
    // non-default port is rejected unless the pattern names that port. Here the
    // port comes from NEXT_PUBLIC_API_URL, so dev (`:3001`) and production
    // (none) both line up on their own.
    remotePatterns: [
      {
        protocol: apiUrl.protocol.replace(":", "") as "http" | "https",
        hostname: apiUrl.hostname,
        port: apiUrl.port,
        pathname: "/uploads/**",
      },
      // Operator-configured CDN hosts for admin-entered `Category.image` URLs.
      // https only — see the note on `extraImageHosts`.
      ...extraImageHosts.map((hostname) => ({
        protocol: "https" as const,
        hostname,
        pathname: "/**",
      })),
    ],
    // How long an OPTIMIZED variant stays in the on-disk optimizer cache
    // (`.next/cache/images`). Stated explicitly because the default moved from
    // 60 seconds in Next 15 to FOUR HOURS in Next 16, and it silently governs a
    // question operators actually ask: "I replaced the picture, why is the old
    // one still there?"
    //
    // The effective TTL is `max(minimumCacheTTL, upstream Cache-Control)`, and
    // store-api serves `/uploads/*` with `max-age=0`, so this value alone
    // decides. It is safe to make it LONG rather than short, because uploads are
    // content-addressed: `local-disk-storage.service.ts` names every stored file
    // with a fresh UUID, so a re-upload is a NEW url that can never hit a stale
    // entry. Only overwriting a file in place at the same URL — which the admin
    // panel has no way to do — would be affected. One day keeps the CPU cost of
    // re-encoding down on a 2-vCPU box, where a cold catalogue page is 40-60
    // transforms (TASK-387).
    minimumCacheTTL: 60 * 60 * 24,
    // Deliberately NO `formats: ['image/avif', 'image/webp']` (TASK-440).
    //
    // This is the answer to "why don't we serve AVIF, it's smaller" — measured,
    // not assumed, so it does not have to be re-argued from intuition.
    //
    // WHAT WAS MEASURED. Next 16.2.12 encodes AVIF as
    // `.avif({ quality: max(q - 20, 1), effort: 3 })` and WebP as
    // `.webp({ quality: q })` with q defaulting to 75 (`imageConfigDefault`),
    // both after `.rotate().resize(w, …)` — see
    // `next/dist/server/image-optimizer.js`. That exact pipeline was replayed on
    // a 2000×1500 WebP q80 source (what store-api now stores, TASK-439) with
    // `sharp.concurrency(1)`, median of 7 runs, pinned to one core. Per
    // transform, on a typical 406 KB photo:
    //
    //   width   256    640    828   1080   1920   2000 (lightbox, `sizes=100vw`)
    //   AVIF     99    230    347    565   1551   2112 ms
    //   WebP     44     79    103    138    322    398 ms
    //   saved    31%    37%    37%    36%    26%    43% of bytes
    //
    // AVIF costs 1.8-5.3× the CPU, and the saving is SMALLEST (23-26%) at the
    // widths where the cost is largest — the trade gets worse exactly where it
    // would need to get better.
    //
    // WHY THAT DECIDES IT ON A 2-vCPU BOX (CX22, `docs/deploy/10-capacity.md`).
    // Next sets `sharp.concurrency(floor(cores / 2))` = 1 there, so image
    // optimization owns ONE core, shared with Postgres, store-api, Meilisearch
    // and Caddy. Those figures are already from one pinned core, and a Xeon vCPU
    // is slower again — putting the first render of a lightbox-width AVIF around
    // 4 s (≈5.6 s for a busy photo), past this plan's 1 s budget by a wide
    // margin and uncomfortably close to a hard limit of the optimizer's own.
    //
    // THE FAILURE MODE IS WORSE THAN "SLOW". The optimizer wraps the pipeline in
    // `.timeout({ seconds: 7 })`, and on failure it does NOT 500 — it falls back
    // to serving the ORIGINAL upstream file. A timed-out AVIF encode therefore
    // burns 7 s of the box's only spare core and then ships the full 2000px,
    // 400-860 KB source to a phone that asked for a 256px thumbnail. No error,
    // no log line: just a slow shop and a bandwidth bill.
    //
    // AND THE COST IS NOT AS ONE-OFF AS `minimumCacheTTL` SUGGESTS. A day-long
    // TTL does amortise each variant, but enabling AVIF roughly DOUBLES the
    // number of variants (AVIF for capable browsers, WebP for the rest), so it
    // doubles both the cold-cache work after every deploy and the disk the
    // optimizer cache holds — and the cold number is what every visitor gets
    // after a deploy (`scripts/load/images.js`).
    //
    // WHAT WOULD CHANGE THE ANSWER: more cores (the encode parallelises), or
    // pre-generating AVIF once at upload time in store-api's `ImageProcessor`
    // instead of per-variant in the request path. Both are real options; neither
    // is a `formats` line. Re-measure on the real 2-vCPU stand before deciding —
    // the numbers above are a single-core LOCAL PROXY, not the target machine.
    // NOTE for whoever does: `scripts/load/images.js` cannot see AVIF as written,
    // because the optimizer picks the format from the request's `Accept` header
    // and the harness sends none.
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Wrap with Sentry to enable source-map upload + auto-instrumentation. This is
// build-time-inert without Sentry auth/DSN: with no `SENTRY_AUTH_TOKEN` the CLI
// skips source-map upload (a warning, not an error), and with no
// `NEXT_PUBLIC_SENTRY_DSN` the runtime SDK is disabled (see instrumentation files).
// The original Next config (images.remotePatterns + env) is preserved unchanged.
export default withSentryConfig(nextConfig, {
  // Silence the Sentry build plugin unless running in CI.
  silent: !process.env.CI,
  // Read from env at build time; unset in dev/CI, so upload is skipped.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Do not fail the build if Sentry is unreachable / unconfigured.
  disableLogger: true,
});
