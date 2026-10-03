import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { dict, H1_CLASS } from "@/shared/config";
import { Button } from "@/shared/ui";
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
        className="mb-[22px] flex flex-wrap items-center gap-[9px] text-sm text-muted-foreground"
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
          className="inline-flex items-center gap-[7px] rounded-full px-3 py-[5px] text-xs font-bold tracking-[0.04em] text-primary"
          style={{
            background:
              "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
          }}
        >
          {dict.legal.hub.badge}
        </span>
        <h1 className={`mt-3.5 mb-2.5 ${H1_CLASS} text-foreground`}>
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
                  <span className="mb-4 text-sm leading-[1.5] text-muted-foreground">
                    {doc.excerpt}
                  </span>
                )}
                <span className="mt-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LegalClockIcon width={14} height={14} />
                  {dict.legal.hub.updatedPrefix}{" "}
                  {formatLegalDateShort(doc.updatedAt)}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        // TASK-870 — design-system §6: icon + one line + a primary action, the
        // same card as the catalogue's `ListingEmptyState`. With nothing to
        // read, asking support IS the way on, so the card carries the hub's
        // one primary and the support card below is not rendered: two
        // «Звʼязатися з нами» buttons a few pixels apart would be two primaries.
        <div className="flex flex-col items-center justify-center rounded-card border border-border bg-card px-5 py-14 text-center shadow-card">
          <span
            aria-hidden="true"
            className="mb-4 inline-flex size-18 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <FileText className="size-8" strokeWidth={1.6} />
          </span>
          <p className="max-w-md font-display text-xl font-bold text-foreground">
            {dict.legal.hub.empty}
          </p>
          <p className="mt-2.5 max-w-md text-sm text-muted-foreground">
            {dict.legal.hub.emptyBody}
          </p>
          <Button asChild size="lg" className="mt-5 h-11">
            <Link href={dict.legal.contactHref}>
              {dict.legal.hub.supportCta}
            </Link>
          </Button>
        </div>
      )}

      {/* Support CTA — the empty card above already carries this action */}
      {docs.length > 0 && (
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
              <span className="text-sm text-muted-foreground">
                {dict.legal.hub.supportSubtitle}
              </span>
            </div>
          </div>
          {/* The hub's one primary action, as in LegalHub.dc.html (TASK-865);
            on Button so it gets the focus ring it lacked. */}
          <Button
            asChild
            className="h-11 rounded-menu px-6 font-semibold no-underline"
          >
            <Link href={dict.legal.contactHref}>
              {dict.legal.hub.supportCta}
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
