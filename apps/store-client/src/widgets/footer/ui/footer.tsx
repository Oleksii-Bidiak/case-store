import Link from "next/link";
import {
  ShieldCheck,
  Truck,
  RotateCcw,
  Mail,
  Phone,
  MessageCircle,
  Send,
  Camera,
} from "lucide-react";
import { fetchSiteContactSettings } from "@/shared/api/site-contact-server";
import { fetchPublishedPages } from "@/shared/api/pages-server";
import { dict } from "@/shared/config";

// Defensive cap on how many published legal pages render as footer links, so the
// «Інформація» column can't grow unboundedly if the admin publishes many pages.
// The /legal hub still lists all of them — only this footer rendering is capped.
const FOOTER_LEGAL_LINKS_LIMIT = 6;

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: dict.trust.secure },
  { icon: Truck, label: dict.trust.shipping },
  { icon: RotateCcw, label: dict.trust.returns },
] as const;

const SOCIAL_LINKS = [
  { key: "viberLink", icon: MessageCircle, label: "Viber" },
  { key: "telegramLink", icon: Send, label: "Telegram" },
  { key: "instagramLink", icon: Camera, label: "Instagram" },
] as const;

/**
 * Footer — dark, multi-column storefront footer aligned with the design import
 * (TASK-167-B): a trust-icon row, four link columns (brand + socials / Каталог /
 * Інформація / Контакти), and a bottom bar with the copyright and payment-method
 * pills. Async Server Component: contact details are admin-managed (TASK-154) and
 * fetched with ISR; the localized `dict.footer.*` strings remain fallbacks.
 */
export async function Footer() {
  const year = new Date().getFullYear();
  // Fetch contact settings and published legal pages in parallel — avoids
  // turning two independent reads into a sequential await waterfall.
  const [contact, legalPages] = await Promise.all([
    fetchSiteContactSettings(),
    fetchPublishedPages(),
  ]);

  const email = contact?.email ?? dict.footer.contactEmail;
  const phone = contact?.phone ?? dict.footer.contactPhone;
  const hours = contact?.workingHours ?? dict.footer.contactHours;
  const hasSocials =
    contact != null && SOCIAL_LINKS.some(({ key }) => contact[key]);

  return (
    <footer className="mt-16 bg-footer text-footer-foreground">
      {/* Trust strip */}
      <div className="border-b border-footer-foreground/10">
        <ul className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-3">
          {TRUST_ITEMS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center justify-center gap-3 text-sm font-medium sm:justify-start"
            >
              <Icon className="size-5 text-primary" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {/* Link columns */}
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        {/* Brand + socials */}
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-flex size-9 items-center justify-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground"
            >
              M
            </span>
            <span className="font-display text-xl font-bold tracking-tight">
              MobileStore
            </span>
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-footer-foreground/70">
            {dict.footer.tagline}
          </p>
          {hasSocials && (
            <ul
              className="flex items-center gap-2.5"
              aria-label={dict.footer.socialsAria}
            >
              {SOCIAL_LINKS.map(({ key, icon: Icon, label }) => {
                const href = contact?.[key];
                if (!href) return null;
                return (
                  <li key={key}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="inline-flex size-9 items-center justify-center rounded-lg bg-footer-foreground/10 transition-colors hover:bg-footer-foreground/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-footer-foreground"
                    >
                      <Icon className="size-[19px]" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Каталог */}
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-sm font-bold">
            {dict.footer.catalogTitle}
          </h2>
          <FooterLink href="/products">{dict.footer.catalogAll}</FooterLink>
          <FooterLink href="/products?sortBy=createdAt&sortOrder=desc">
            {dict.footer.catalogNew}
          </FooterLink>
          <FooterLink href="/wishlist">
            {dict.footer.catalogWishlist}
          </FooterLink>
          <FooterLink href="/cart">{dict.footer.shopCart}</FooterLink>
        </div>

        {/* Інформація — TASK-184: a dynamic list of admin-published legal pages
            (/legal/<slug>), then two fixed /info anchors (About, FAQ — the FAQPage
            JSON-LD lives on /info per TASK-242, so FAQ is not a duplicate route),
            then the existing /blog link. Zero published legal pages still leaves a
            populated About/FAQ/Blog column. */}
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-sm font-bold">
            {dict.footer.infoTitle}
          </h2>
          {legalPages.slice(0, FOOTER_LEGAL_LINKS_LIMIT).map((page) => (
            <FooterLink key={page.slug} href={`/legal/${page.slug}`}>
              {page.title}
            </FooterLink>
          ))}
          <FooterLink href="/info#about">{dict.footer.infoAbout}</FooterLink>
          <FooterLink href="/info#faq">{dict.footer.infoFaq}</FooterLink>
          <FooterLink href="/blog">{dict.footer.infoBlog}</FooterLink>
        </div>

        {/* Контакти */}
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-sm font-bold">
            {dict.footer.contactTitle}
          </h2>
          <a
            href={`tel:${phone.replace(/\s+/g, "")}`}
            className="flex items-center gap-2 font-mono text-lg font-bold transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-footer-foreground"
          >
            <Phone className="size-4" aria-hidden="true" />
            {phone}
          </a>
          <p className="text-sm text-footer-foreground/70">
            {dict.footer.freeCallout} · {hours}
          </p>
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-2 text-sm text-footer-foreground/70 transition-colors hover:text-footer-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-footer-foreground"
          >
            <Mail className="size-4" aria-hidden="true" />
            {email}
          </a>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-footer-foreground/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-5 sm:flex-row">
          <p className="text-xs text-footer-foreground/60">
            {dict.footer.rights(year)}
          </p>
          <ul
            className="flex flex-wrap items-center gap-2"
            aria-label={dict.footer.paymentsAria}
          >
            {dict.footer.payments.map((label) => (
              <li
                key={label}
                className="rounded-md border border-footer-foreground/20 px-2.5 py-1 text-[11px] font-semibold text-footer-foreground/80"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-sm text-footer-foreground/70 transition-colors hover:text-footer-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-footer-foreground"
    >
      {children}
    </Link>
  );
}
