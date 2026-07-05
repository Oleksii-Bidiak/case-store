import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import { Providers } from "./providers";
import { Header } from "@/widgets/header";
import { Footer } from "@/widgets";
import { PRIMARY_COLOR, SITE_URL, SITE_NAME, dict } from "@/shared/config";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: dict.meta.rootTitle,
    template: `%s | ${SITE_NAME}`,
  },
  description: dict.meta.rootDescription,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    locale: "uk_UA",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
