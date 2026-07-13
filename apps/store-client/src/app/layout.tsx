import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import Script from "next/script";
import { Providers } from "./providers";
import { Header } from "@/widgets/header";
import { Footer } from "@/widgets";
import {
  BRAND_OG_IMAGE_HEIGHT,
  BRAND_OG_IMAGE_PATH,
  BRAND_OG_IMAGE_WIDTH,
  PRIMARY_COLOR,
  PRIMARY_COLOR_DARK,
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PRIMARY_COLOR },
    { media: "(prefers-color-scheme: dark)", color: PRIMARY_COLOR_DARK },
  ],
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
      // Admin-uploaded default OG image (tier 2) wins verbatim; otherwise the
      // committed brand card ships so link previews are never image-less
      // (TASK-279, plan 145 Design Decision 1). The relative path resolves to
      // an absolute URL via `metadataBase` above. Deliberately explicit code —
      // NOT the app/opengraph-image.png file convention — so the fallback sits
      // next to the tier logic instead of being merged in invisibly (segments
      // that define their own `openGraph` would silently opt out either way).
      images: resolved.ogImage
        ? [{ url: resolved.ogImage }]
        : [
            {
              url: BRAND_OG_IMAGE_PATH,
              width: BRAND_OG_IMAGE_WIDTH,
              height: BRAND_OG_IMAGE_HEIGHT,
              alt: dict.meta.rootTitle,
            },
          ],
    },
    // Search-console ownership verification (TASK-280, plan 146 Decision 2).
    // Each key is emitted only when its admin-managed token is a non-empty
    // string — Next renders no tag for an absent key, and an empty
    // content="" tag would look broken to the crawler. Bing has no
    // first-class key in Next's Verification type, so it goes through
    // `other` under its documented meta name `msvalidate.01`. The whole
    // object is omitted when neither console is configured.
    verification:
      seo?.googleSiteVerification || seo?.bingSiteVerification
        ? {
            google: seo?.googleSiteVerification || undefined,
            other: seo?.bingSiteVerification
              ? { "msvalidate.01": seo.bingSiteVerification }
              : undefined,
          }
        : undefined,
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
  // The SEO singleton carries the admin-uploaded store logo (TASK-299); it is the
  // same tagged URL `generateMetadata` above already read, so this costs no extra
  // request. The Header is a Client Component, hence the plain serializable prop.
  const [banners, seo] = await Promise.all([
    fetchPublishedBanners(),
    fetchSeoSettings(),
  ]);
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
          <Header announcement={announcement} logoUrl={seo?.logoUrl} />
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
