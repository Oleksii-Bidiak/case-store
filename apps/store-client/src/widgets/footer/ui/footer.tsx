import Link from "next/link";
import {
  Lock,
  Mail,
  MessageSquareText,
  PhoneCall,
  RotateCcw,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { ACTIVE_ROOT_CATEGORIES_PARAMS } from "@/entities/category";
import { categoryControllerGetRootCategories } from "@/shared/api/generated/categories/categories";
import type { CategoryEntity } from "@/shared/api/generated/models";
import { fetchSiteContactSettings } from "@/shared/api/site-contact-server";
import { fetchPublishedPages } from "@/shared/api/pages-server";
import { serverRequestOptions } from "@/shared/api/query-prefetch-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { resolveSiteName } from "@/shared/lib/seo";
import { cn } from "@/shared/lib/utils";
import { Logo } from "@/shared/ui";
import {
  dict,
  FOCUS_ON_DARK_CLASS,
  isInfoSlugInlinedOnHub,
  PAGE_CONTAINER,
} from "@/shared/config";

import {
  FOOTER_CATEGORIES_LIMIT,
  FOOTER_HELP_PAGES_LIMIT,
  isTollFreePhone,
  splitLegalPages,
  telHref,
} from "../model/footer-links";
import { FooterColumn } from "./footer-column";
import { FooterDeviceRow } from "./footer-device-row";
import { FOOTER_LINK, FOOTER_OUTLINE_PILL } from "./footer-styles";

// Icons of `dict.footer.trust`, in the same order.
const TRUST_ICONS: readonly LucideIcon[] = [
  Lock,
  Truck,
  RotateCcw,
  ShieldCheck,
];

const SOCIAL_LINKS = [
  { key: "telegramLink", label: "Telegram" },
  { key: "instagramLink", label: "Instagram" },
  { key: "viberLink", label: "Viber" },
] as const;

/**
 * Active root categories for the «Каталог» column, in the owner's order. A
 * failed read leaves only «Усі категорії» — the footer must render with the
 * API down (it is in the root layout of every page).
 */
async function fetchFooterCategories(): Promise<CategoryEntity[]> {
  try {
    const { data } = await categoryControllerGetRootCategories(
      ACTIVE_ROOT_CATEGORIES_PARAMS,
      serverRequestOptions(),
    );
    return data.slice(0, FOOTER_CATEGORIES_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Footer — direction В (TASK-2078, SiteFooter mockup). Dark in both themes:
 * a four-item trust strip, the «Мої пристрої» row (client island), then brand
 * + four columns (Каталог / Покупцям / Компанія / Контакти) that collapse into
 * disclosures on phones with Контакти open, and a bottom bar with the ©
 * line, the legal documents and the payment chips. Async Server Component:
 * contact details, pages, categories and the store name are admin-managed and
 * fetched server-side; `dict.footer.*` holds the copy and the fallbacks.
 */
export async function Footer() {
  const year = new Date().getFullYear();
  // Independent reads in parallel — no await waterfall. The seo-settings
  // request is the same tagged URL the layout reads, deduped by Next.
  const [contact, legalPages, infoPages, seo, categories] = await Promise.all([
    fetchSiteContactSettings(),
    // TASK-435: legal documents at /legal/<slug>.
    fetchPublishedPages("LEGAL"),
    // TASK-834: help pages at /info/<slug>; the ones /info renders inline are
    // reached through /info itself.
    fetchPublishedPages("INFO"),
    fetchSeoSettings(),
    fetchFooterCategories(),
  ]);
  const helpPages = infoPages
    .filter((page) => !isInfoSlugInlinedOnHub(page.slug))
    .slice(0, FOOTER_HELP_PAGES_LIMIT);
  const { buyer: buyerDocs, legal: legalDocs } = splitLegalPages(legalPages);

  // TASK-546: the wordmark and the © line carry the admin-managed store name.
  const siteName = resolveSiteName(seo);
  const email = contact?.email ?? dict.footer.contactEmail;
  const phone = contact?.phone ?? dict.footer.contactPhone;
  const hours = contact?.workingHours ?? dict.footer.contactHours;
  const callsLine = isTollFreePhone(phone)
    ? `${dict.footer.callsFree} · ${hours}`
    : hours;
  const socials = SOCIAL_LINKS.flatMap(({ key, label }) => {
    const href = contact?.[key];
    return href ? [{ key, label, href }] : [];
  });

  return (
    <footer className="mt-16 bg-footer font-sans text-footer-foreground">
      <div className={PAGE_CONTAINER}>
        {/* Trust strip — not interactive. */}
        <ul
          aria-label={dict.footer.trustAria}
          className="grid grid-cols-2 gap-4 py-6 md:grid-cols-4"
        >
          {dict.footer.trust.map(({ title, subtitle }, index) => {
            const Icon = TRUST_ICONS[index] ?? ShieldCheck;
            return (
              <li
                key={title}
                className="flex items-center gap-3 text-sm font-semibold"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-menu bg-footer-foreground/10">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  {title}
                  <small className="block text-xs font-normal text-footer-foreground/65">
                    {subtitle}
                  </small>
                </span>
              </li>
            );
          })}
        </ul>

        <FooterDeviceRow />

        {/* Brand + columns: one stack on phones, 2 columns on tablets, a
            five-column row from lg. */}
        <div
          // eslint-disable-next-line tailwindcss/no-arbitrary-value -- the mockup's weighted five-column row has no named grid-cols-N equivalent
          className="grid grid-cols-1 pt-2 pb-6 md:grid-cols-2 md:gap-8 md:py-10 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr]"
        >
          <div className="flex flex-col gap-3.5 py-6 md:col-span-2 md:py-0 lg:col-span-1">
            <Link
              href="/"
              className={cn("self-start rounded-sm", FOCUS_ON_DARK_CLASS)}
            >
              <Logo
                siteName={siteName}
                logoUrl={seo?.logoUrl}
                className="gap-2.5"
                // The default mark is `bg-primary` — graphite, the same ink as
                // this panel. Invert it on the footer.
                markClassName="bg-footer-foreground text-footer"
              />
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-footer-foreground/70">
              {dict.footer.tagline}
            </p>
            {socials.length > 0 && (
              <ul
                className="flex flex-wrap gap-1.5"
                aria-label={dict.footer.socialsAria}
              >
                {socials.map(({ key, label, href }) => (
                  <li key={key}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={FOOTER_OUTLINE_PILL}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <FooterColumn title={dict.footer.catalogTitle}>
            {categories.map((category) => (
              <FooterLink
                key={category.id}
                href={`/categories/${category.slug}`}
              >
                {category.name}
              </FooterLink>
            ))}
            <FooterLink href="/categories">
              {dict.footer.catalogAllCategories}
            </FooterLink>
          </FooterColumn>

          <FooterColumn title={dict.footer.buyersTitle}>
            <FooterLink href="/devices">
              {dict.footer.buyersMyDevices}
            </FooterLink>
            <FooterLink href="/wishlist">
              {dict.footer.catalogWishlist}
            </FooterLink>
            {/* TASK-483: where somebody looks when the confirmation email is
                gone — it has to be reachable without knowing it exists. */}
            <FooterLink href="/orders/status">
              {dict.footer.infoOrderStatus}
            </FooterLink>
            {buyerDocs.map((page) => (
              <FooterLink key={page.slug} href={`/legal/${page.slug}`}>
                {page.title}
              </FooterLink>
            ))}
            {helpPages.map((page) => (
              <FooterLink key={`info-${page.slug}`} href={`/info/${page.slug}`}>
                {page.title}
              </FooterLink>
            ))}
            <FooterLink href="/info">{dict.footer.infoHelpHub}</FooterLink>
          </FooterColumn>

          <FooterColumn title={dict.footer.companyTitle}>
            <FooterLink href="/info#about">{dict.footer.infoAbout}</FooterLink>
            <FooterLink href="/blog">{dict.footer.infoBlog}</FooterLink>
            <FooterLink href="/promo">{dict.footer.companyPromo}</FooterLink>
            <FooterLink href="/info#faq">{dict.footer.infoFaq}</FooterLink>
          </FooterColumn>

          <FooterColumn title={dict.footer.contactTitle} defaultOpen>
            <a
              href={telHref(phone)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2.5 self-start rounded-sm font-mono text-lg font-bold underline-offset-4 hover:underline md:min-h-9",
                FOCUS_ON_DARK_CLASS,
              )}
            >
              <PhoneCall className="size-4.5 shrink-0" aria-hidden="true" />
              {phone}
            </a>
            <p className="mb-2 text-sm text-footer-foreground/60">
              {callsLine}
            </p>
            <a href={`mailto:${email}`} className={FOOTER_LINK}>
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              {email}
            </a>
            {/* TASK-866 — /contact is the single contact form (owner decision
                7.8). Unconditional: the form works with no settings filled in. */}
            <FooterLink href="/contact" icon={MessageSquareText}>
              {dict.footer.contactFormLink}
            </FooterLink>
          </FooterColumn>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-footer-foreground/12">
        <div
          className={`${PAGE_CONTAINER} flex flex-col gap-4 pt-5 pb-7 md:flex-row md:flex-wrap md:items-center md:justify-between`}
        >
          <p className="text-xs text-footer-foreground/60">
            {dict.footer.rights(year, siteName)}
          </p>
          {legalPages.length > 0 && (
            <ul
              aria-label={dict.footer.legalAria}
              className="flex flex-wrap gap-x-4 gap-y-1"
            >
              {legalDocs.map((page) => (
                <li key={page.slug}>
                  <FooterLink href={`/legal/${page.slug}`}>
                    {page.title}
                  </FooterLink>
                </li>
              ))}
              {/* TASK-834 — the /legal hub lists every document, including
                  the ones past the caps. */}
              <li>
                <FooterLink href="/legal">
                  {dict.footer.infoLegalHub}
                </FooterLink>
              </li>
            </ul>
          )}
          <ul
            className="flex flex-wrap items-center gap-2"
            aria-label={dict.footer.paymentsAria}
          >
            {dict.footer.payments.map((label) => (
              <li
                key={label}
                className="rounded-full border border-footer-foreground/22 px-3 py-1 text-xs font-semibold text-footer-foreground/80"
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
  icon: Icon,
  children,
}: {
  href: string;
  /** Leading icon, sized like the email row's. */
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={FOOTER_LINK}>
      {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
      {children}
    </Link>
  );
}
