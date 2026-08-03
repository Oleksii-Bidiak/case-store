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
    // Whitelist exactly the store-api uploads origin. An empty `port` means
    // "any port" in Next.js, so a hostname without an explicit port still works.
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
