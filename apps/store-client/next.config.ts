import type { NextConfig } from "next";

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
    ],
  },
};

export default nextConfig;
