import type { MetadataRoute } from "next";
import { PRIMARY_COLOR, dict } from "@/shared/config";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { resolveSiteName } from "@/shared/lib/seo";

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
 *
 * ASYNC since TASK-433: `name`/`short_name` are the store's name, which is now
 * admin-managed (`SeoSettings.siteName`) rather than a constant, so this handler
 * has to await the tagged settings fetch. Next's metadata-route loader awaits
 * the default export (`const data = await handler()` in
 * `next/dist/build/webpack/loaders/next-metadata-route-loader.js`), so a Promise
 * is a supported return value — verified in Next's own source, not in the
 * bundled `next/dist/docs/` pages, whose "AI agent hints" advertise APIs that do
 * not exist. `fetchSeoSettings()` returns null on any failure, so an unreachable
 * API degrades to the SITE_NAME fallback instead of breaking the manifest.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const seo = await fetchSeoSettings();
  const siteName = resolveSiteName(seo);

  return {
    name: siteName,
    short_name: siteName,
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
