import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Providers } from "./providers";
import { PRIMARY_COLOR } from "@/shared/config";
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
  title: "Mobile Accessories Store",
  description:
    "Your one-stop shop for mobile phone accessories — cases, chargers, screen protectors, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <header className="border-b border-border">
            <div className="mx-auto flex h-16 max-w-7xl items-center px-4">
              <Link href="/" className="text-xl font-bold text-primary">
                MobileStore
              </Link>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border">
            <div className="mx-auto flex h-16 max-w-7xl items-center px-4">
              <p className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} MobileStore. All rights
                reserved.
              </p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
