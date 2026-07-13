import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Produce a self-contained `.next/standalone` server for Docker (TASK-270).
  // `outputFileTracingRoot` points at the monorepo root (two levels up) so the
  // dependency trace reaches the hoisted root node_modules + packages/*; in a
  // monorepo this emits server.js nested at
  // `.next/standalone/apps/store-admin/server.js` (see the Dockerfile CMD).
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  },
  // Security headers for every admin route. The admin panel is never legitimately
  // embedded, so framing is denied outright: a clickjacked /login would let an
  // attacker overlay an invisible admin form and harvest credentials or trick a
  // signed-in admin into a destructive click.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry for source-map upload + auto-instrumentation. Build-time-inert
// without Sentry auth/DSN: no `SENTRY_AUTH_TOKEN` skips source-map upload, and no
// `NEXT_PUBLIC_SENTRY_DSN` disables the runtime SDK. The original `env` config is
// preserved unchanged.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
});
