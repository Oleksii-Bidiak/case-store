import type { MetadataRoute } from "next";
import { PRIMARY_COLOR, SITE_NAME, dict } from "@/shared/config";

/**
 * Web App Manifest (Next.js file-based metadata convention, plan 145 /
 * TASK-279-A). Served at /manifest.webmanifest and linked automatically from
 * every page's <head>. Drives the Android/Chromium "Add to Home Screen"
 * name + icon and the installed-PWA chrome color.
 *
 * theme_color reuses PRIMARY_COLOR — the same token viewport.themeColor in
 * layout.tsx already uses (light variant; the manifest format has no
 * media-query pair). Icons are generated from src/app/icon.svg by
 * `npm run generate:brand-assets -w apps/store-client`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: dict.meta.rootTitle,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: PRIMARY_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
