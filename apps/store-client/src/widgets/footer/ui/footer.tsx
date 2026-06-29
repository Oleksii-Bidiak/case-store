import Link from "next/link";
import {
  CreditCard,
  Banknote,
  Wallet,
  ShieldCheck,
  Truck,
  RotateCcw,
  Mail,
  Phone,
  Clock,
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
 * Footer — multi-column storefront footer with link groups, contact info, a
 * trust-icon row and a payment-method strip. Async Server Component: contact
 * details are admin-managed (TASK-154) and fetched with ISR; the localized
 * `dict.footer.*` strings remain as fallbacks when a field is unset.
 */
export async function Footer() {
  const year = new Date().getFullYear();
  const contact = await getContactSettings();

  const email = contact?.email ?? dict.footer.contactEmail;
  const phone = contact?.phone ?? dict.footer.contactPhone;
  const hours = contact?.workingHours ?? dict.footer.contactHours;

  return (
    <footer className="mt-16 border-t border-border bg-card text-card-foreground">
      {/* Trust strip */}
      <div className="border-b border-border">
        <ul className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-3">
          {TRUST_ITEMS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center justify-center gap-3 text-sm font-medium text-foreground sm:justify-start"
            >
              <Icon className="size-5 text-primary" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {/* Link columns */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-primary"
          >
            MobileStore
          </Link>
          <p className="text-sm text-muted-foreground">{dict.footer.tagline}</p>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            {dict.footer.shopTitle}
          </h2>
          <FooterLink href="/products">{dict.footer.shopAll}</FooterLink>
          <FooterLink href="/cart">{dict.footer.shopCart}</FooterLink>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            {dict.footer.supportTitle}
          </h2>
          <FooterLink href="/products">{dict.footer.supportFaq}</FooterLink>
          <FooterLink href="/products">{dict.footer.supportReturns}</FooterLink>
          <FooterLink href="/products">{dict.footer.supportContact}</FooterLink>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            {dict.footer.contactTitle}
          </h2>
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mail className="size-4" aria-hidden="true" />
            {email}
          </a>
          <a
            href={`tel:${phone.replace(/\s+/g, "")}`}
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Phone className="size-4" aria-hidden="true" />
            {phone}
          </a>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden="true" />
            {hours}
          </p>

          {contact && SOCIAL_LINKS.some(({ key }) => contact[key]) ? (
            <div className="mt-1 flex items-center gap-4">
              {SOCIAL_LINKS.map(({ key, icon: Icon, label }) => {
                const href = contact[key];
                if (!href) {
                  return null;
                }
                return (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            {dict.footer.rights(year)}
          </p>
          <div
            className="flex items-center gap-3 text-muted-foreground"
            aria-label={dict.footer.paymentsAria}
          >
            <CreditCard className="size-6" aria-hidden="true" />
            <Wallet className="size-6" aria-hidden="true" />
            <Banknote className="size-6" aria-hidden="true" />
          </div>
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
      className="text-sm text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}
