import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { dict } from "@/shared/config";
import { formatLegalDateShort } from "../model/extract-sections";
import {
  LegalArrowRightIcon,
  LegalChatIcon,
  LegalClockIcon,
  LegalCookieIcon,
  LegalFileIcon,
  LegalOfferIcon,
  LegalReturnsIcon,
  LegalShieldIcon,
  LegalTermsIcon,
} from "./legal-icons";

/** One page shown as a hub tile. */
export interface LegalHubDoc {
  slug: string;
  title: string;
  excerpt?: string | null;
  updatedAt: string;
}

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

/** Best-effort tile icon by slug keyword (presentation only; default = file). */
function legalDocIcon(slug: string): Glyph {
  const s = slug.toLowerCase();
  if (s.includes("privacy") || s.includes("warrant")) return LegalShieldIcon;
  if (s.includes("cookie")) return LegalCookieIcon;
  if (s.includes("return") || s.includes("refund") || s.includes("exchange"))
    return LegalReturnsIcon;
  if (s.includes("term")) return LegalTermsIcon;
  if (s.includes("offer")) return LegalOfferIcon;
  return LegalFileIcon;
}

/**
 * LegalHubView — the LegalHub.dc.html template: a hub of all published static
 * pages (`/legal`). Driven by the `Page` backend; each tile links to the
 * `/legal/[slug]` document. Presentational — the page fetches `docs`.
 */
export function LegalHubView({ docs }: { docs: LegalHubDoc[] }) {
  return (
    <>
      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-[22px] flex flex-wrap items-center gap-[9px] text-[13.5px] text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.legal.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">
          {dict.legal.hub.heading}
        </span>
      </nav>

      {/* Hero */}
      <div className="mb-[30px] max-w-[640px]">
        <span
          className="inline-flex items-center gap-[7px] rounded-full px-3 py-[5px] text-[12.5px] font-bold tracking-[0.04em] text-primary"
          style={{
            background:
              "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
          }}
        >
          {dict.legal.hub.badge}
        </span>
        <h1 className="mt-3.5 mb-2.5 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.025em] text-foreground">
          {dict.legal.hub.heading}
        </h1>
        <p className="text-base leading-[1.55] text-muted-foreground">
          {dict.legal.hub.subtitle}
        </p>
      </div>

      {/* Document cards */}
      {docs.length > 0 ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(304px,1fr))]">
          {docs.map((doc) => {
            const Icon = legalDocIcon(doc.slug);
            return (
              <Link
                key={doc.slug}
                href={`/legal/${doc.slug}`}
                className="flex flex-col rounded-2xl border border-border bg-card p-[22px] no-underline shadow-card transition-[border-color,transform,box-shadow] hover:-translate-y-[3px] hover:border-primary hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="mb-3.5 flex items-center justify-between">
                  <span
                    className="inline-flex size-11 items-center justify-center rounded-xl text-primary"
                    style={{
                      background:
                        "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
                    }}
                  >
                    <Icon width={22} height={22} />
                  </span>
                  <span className="inline-flex size-[30px] items-center justify-center rounded-full text-muted-foreground">
                    <LegalArrowRightIcon width={18} height={18} />
                  </span>
                </div>
                <b className="mb-2 font-display text-[17px] font-bold leading-[1.25] tracking-[-0.01em] text-foreground">
                  {doc.title}
                </b>
                {doc.excerpt && (
                  <span className="mb-4 text-[13.5px] leading-[1.5] text-muted-foreground">
                    {doc.excerpt}
                  </span>
                )}
                <span className="mt-auto inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <LegalClockIcon width={14} height={14} />
                  {dict.legal.hub.updatedPrefix}{" "}
                  {formatLegalDateShort(doc.updatedAt)}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{dict.legal.hub.empty}</p>
      )}

      {/* Support CTA */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card px-[26px] py-[22px] shadow-card">
        <div className="flex items-center gap-3.5">
          <span
            className="inline-flex size-[46px] items-center justify-center rounded-xl text-primary"
            style={{
              background:
                "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
            }}
          >
            <LegalChatIcon width={23} height={23} />
          </span>
          <div>
            <b className="block font-display text-base text-foreground">
              {dict.legal.hub.supportHeading}
            </b>
            <span className="text-[13.5px] text-muted-foreground">
              {dict.legal.hub.supportSubtitle}
            </span>
          </div>
        </div>
        <Link
          href={dict.legal.contactHref}
          className="inline-flex h-11 items-center rounded-[11px] bg-primary px-[22px] text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90"
        >
          {dict.legal.hub.supportCta}
        </Link>
      </div>
    </>
  );
}
