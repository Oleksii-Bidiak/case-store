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
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: dict.trust.secure },
  { icon: Truck, label: dict.trust.shipping },
  { icon: RotateCcw, label: dict.trust.returns },
] as const;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Fetch the admin-managed contact block server-side with a 1-hour ISR cache.
 *
 * Uses a native `fetch` (not the axios-based Orval client) so Next.js can apply
 * `revalidate` caching — contact info changes at most a few times per year, so
 * the footer should not hit the API on every page render. Returns null on any
 * error; callers fall back to the localized `dict.footer.*` strings.
 */
async function getContactSettings(): Promise<SiteContactSettingsEntity | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/site-contact`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { data?: SiteContactSettingsEntity };
    return body.data ?? null;
  } catch {
    return null;
  }
}

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
  const contact = await getContactSettings();

  const email = contact?.email ?? dict.footer.contactEmail;
  const phone = contact?.phone ?? dict.footer.contactPhone;
  const hours = contact?.workingHours ?? dict.footer.contactHours;
  const hasSocials =
    contact != null && SOCIAL_LINKS.some(({ key }) => contact[key]);

  return (
    <footer className="mt-16 bg-foreground text-background">
      {/* Trust strip */}
      <div className="border-b border-background/10">
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
          <p className="max-w-xs text-sm leading-relaxed text-background/70">
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
                      className="inline-flex size-9 items-center justify-center rounded-lg bg-background/10 transition-colors hover:bg-background/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-background"
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

        {/* Інформація — link targets are storefront-safe placeholders until the
            admin `/legal/[slug]` pages are wired (TASK-153/TASK-166). */}
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-sm font-bold">
            {dict.footer.infoTitle}
          </h2>
          <FooterLink href="/products">{dict.footer.infoDelivery}</FooterLink>
          <FooterLink href="/products">{dict.footer.infoWarranty}</FooterLink>
          <FooterLink href="/products">{dict.footer.infoAbout}</FooterLink>
          <FooterLink href="/products">{dict.footer.infoFaq}</FooterLink>
          <FooterLink href="/blog">{dict.footer.infoBlog}</FooterLink>
        </div>

        {/* Контакти */}
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-sm font-bold">
            {dict.footer.contactTitle}
          </h2>
          <a
            href={`tel:${phone.replace(/\s+/g, "")}`}
            className="flex items-center gap-2 font-mono text-lg font-bold transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-background"
          >
            <Phone className="size-4" aria-hidden="true" />
            {phone}
          </a>
          <p className="text-sm text-background/70">
            {dict.footer.freeCallout} · {hours}
          </p>
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-2 text-sm text-background/70 transition-colors hover:text-background focus:outline-none focus-visible:ring-2 focus-visible:ring-background"
          >
            <Mail className="size-4" aria-hidden="true" />
            {email}
          </a>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-background/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-5 sm:flex-row">
          <p className="text-xs text-background/60">
            {dict.footer.rights(year)}
          </p>
          <ul
            className="flex flex-wrap items-center gap-2"
            aria-label={dict.footer.paymentsAria}
          >
            {dict.footer.payments.map((label) => (
              <li
                key={label}
                className="rounded-md border border-background/20 px-2.5 py-1 text-[11px] font-semibold text-background/80"
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
      className="text-sm text-background/70 transition-colors hover:text-background focus:outline-none focus-visible:ring-2 focus-visible:ring-background"
    >
      {children}
    </Link>
  );
}
