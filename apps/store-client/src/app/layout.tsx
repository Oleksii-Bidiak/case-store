import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import Script from "next/script";
import { Providers } from "./providers";
import { Header } from "@/widgets/header";
import { Footer } from "@/widgets";
import {
  PRIMARY_COLOR,
  SITE_URL,
  SITE_NAME,
  dict,
  UMAMI_ENABLED,
  UMAMI_SRC,
  UMAMI_WEBSITE_ID,
} from "@/shared/config";
import { fetchPublishedBanners } from "@/shared/api/banners-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { resolveSeo, resolveTitleTemplate } from "@/shared/lib/seo";
import "./globals.css";

/**
 * TASK-212 — «woff2 preloaded but not used» console warnings: investigated,
 * intentionally left as is. In the production build each family emits exactly
 * one preloaded latin file (Sora's 600/700/800 resolve to a single variable
 * woff2), and all three are consumed at first paint on every route: Sora 700 —
 * header logo, Geist Mono — support phone in the announcement bar, Geist —
 * body text and digits. The QA capture was from the dev server (development
 * React stack trace in the same log), where @font-face CSS is injected late
 * via HMR, so Chrome's ~3s post-load preload check flags all three files at
 * once — a dev-only false positive. Do not add `preload: false` or
 * `display: "optional"` here: it would regress production font rendering
 * without silencing the dev warning.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display font for headings — geometric, confident, retail-friendly.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: PRIMARY_COLOR,
};

/**
 * Root metadata, seeded from the admin-managed SeoSettings singleton (TASK-239)
 * with the hardcoded localized strings kept as the zero-config fallback:
 *   - title.template — `SeoSettings.titleTemplate` when it contains a `%s`
 *     token, else the default `%s | ${SITE_NAME}`.
 *   - title.default / description — the admin defaults when set, else the
 *     current `dict.meta.*` strings.
 *   - openGraph.images — seeded from `SeoSettings.defaultOgImage` when set.
 *
 * `fetchSeoSettings()` is tagged (`seo-settings`) and returns null on any error,
 * so an unreachable API degrades gracefully to the hardcoded defaults.
 */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await fetchSeoSettings();

  // Root defaults resolved through the shared precedence helper: the SeoSettings
  // defaults win (tier 2), else the hardcoded localized strings (tier 3). The
  // brand title template is picked separately and applied by Next to each page's
  // plain-string `<title>` (`title.default` itself is never templated).
  const resolved = resolveSeo({
    settings: seo,
    content: {
      name: dict.meta.rootTitle,
      description: dict.meta.rootDescription,
    },
  });

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: resolved.title || dict.meta.rootTitle,
      template: resolveTitleTemplate(seo, SITE_NAME),
    },
    description: resolved.description ?? dict.meta.rootDescription,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: SITE_URL,
      locale: "uk_UA",
      ...(resolved.ogImage ? { images: [{ url: resolved.ogImage }] } : {}),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ANNOUNCEMENT_BAR banner is global (lives above the header on every route),
  // so it is fetched here via the ISR-tagged helper. The same `banners` tag +
  // URL is reused by the homepage, so Next dedupes it to a single request.
  const banners = await fetchPublishedBanners();
  const announcement = banners.ANNOUNCEMENT_BAR[0];

  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <a
            href="#main-content"
            className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
          >
            {dict.nav.skipToContent}
          </a>
          <Header announcement={announcement} />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
        {/* Umami self-hosted analytics (TASK-261). Rendered only when both env
            keys are set — empty in local dev, so no tracker loads there. The
            default `afterInteractive` strategy is the one Next recommends for
            analytics scripts and works from this Server Component (no onLoad). */}
        {UMAMI_ENABLED && (
          <Script
            src={UMAMI_SRC}
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
