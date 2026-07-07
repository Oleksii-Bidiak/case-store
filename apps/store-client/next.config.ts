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

const nextConfig: NextConfig = {
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
      // Placeholder imagery used by the dev seed (`picsum.photos/seed/...`).
      // Real product images are served from the store-api uploads host above;
      // this entry only exists so seeded demo data renders locally.
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
    ],
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
