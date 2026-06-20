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
} from "lucide-react";
import { dict } from "@/shared/config";

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: dict.trust.secure },
  { icon: Truck, label: dict.trust.shipping },
  { icon: RotateCcw, label: dict.trust.returns },
] as const;

/**
 * Footer — multi-column storefront footer with link groups, contact info, a
 * trust-icon row and a payment-method strip. Pure Server Component (no hooks).
 */
export function Footer() {
  const year = new Date().getFullYear();

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
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-4" aria-hidden="true" />
            {dict.footer.contactEmail}
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="size-4" aria-hidden="true" />
            {dict.footer.contactPhone}
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden="true" />
            {dict.footer.contactHours}
          </p>
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
