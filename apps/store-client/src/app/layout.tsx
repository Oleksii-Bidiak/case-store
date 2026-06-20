import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Header } from "@/widgets/header";
import { Footer } from "@/widgets";
import { PRIMARY_COLOR, SITE_URL, SITE_NAME, dict } from "@/shared/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
