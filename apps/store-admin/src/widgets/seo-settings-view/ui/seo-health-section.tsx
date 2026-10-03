"use client";

import Link from "next/link";
import {
  useAdminSeoSettingsControllerGetHealth,
  type SeoSettingsEntity,
} from "@/entities/seo-settings";
import { dict } from "@/shared/config";
import { STOREFRONT_URL } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Badge, Skeleton, StatusDot } from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";

const h = dict.seoHealth;

/** The «Стан SEO» card's anchor — the first entry of the page's section nav. */
export const SEO_HEALTH_SECTION_ID = "seo-health";

/** Where «Заповнити ↓» leads: the default title field of the form below. */
const DEFAULT_TITLE_FIELD_HREF = "#seo-default-title";

interface SeoHealthSectionProps {
  /** The already-fetched settings singleton — source of the client-side
   *  "defaults filled" and "noindex" checks (plan 131 Decision 1). */
  settings: SeoSettingsEntity;
}

/** True when the default title and description are both set. */
export function seoDefaultsFilled(settings: SeoSettingsEntity): boolean {
  return Boolean(
    settings.defaultMetaTitle?.trim() &&
    settings.defaultMetaDescription?.trim(),
  );
}

/**
 * One row: a status dot, the label (a link into the section's list), the count.
 * `attention` turns the dot and the number amber.
 */
function HealthRow({
  label,
  href,
  value,
  attention,
  action,
}: {
  label: string;
  href?: string;
  value: string;
  attention: boolean;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      {/* Decoration: the number beside it already says it in words. */}
      <StatusDot tone={attention ? "warning" : "success"} label="" />
      {href ? (
        <Link
          href={href}
          className="min-w-0 flex-1 text-foreground underline-offset-4 hover:underline"
        >
          {label}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 text-foreground">{label}</span>
      )}
      <span
        className={cn(
          "tabular-nums",
          attention ? "text-warning" : "font-semibold text-foreground",
        )}
      >
        {value}
      </span>
      {action}
    </li>
  );
}

/**
 * «Стан SEO» on /settings/seo (TASK-269; by mockup Н2 since TASK-1053).
 *
 * Fetches the catalog COUNTs (products/categories/pages relying on
 * auto-generated meta titles — informational, never an error; pages missing a
 * description or thin on content — amber when non-zero), and derives two more
 * checks client-side from the `settings` prop the page already holds: the
 * site-wide defaults (amber «не задано» + «Заповнити ↓» when empty) and the
 * `noindexSite` kill switch (a prominent RED banner when on — the one genuinely
 * urgent state; a green badge in the header otherwise). Three outbound links let
 * the owner eyeball the live robots/sitemap/llms files. The health query
 * degrades independently: its error state never hides the defaults row or
 * blocks the edit form below.
 *
 * The row labels still open the section lists, unfiltered: none of those lists
 * can filter by an SEO gap yet, so the mockup's «Показати →» (a promise of a
 * filtered list) is not drawn — that is an API tail of TASK-1053.
 */
export function SeoHealthSection({ settings }: SeoHealthSectionProps) {
  const { data, isLoading, isError } = useAdminSeoSettingsControllerGetHealth();
  const health = data?.data;
  const defaultsFilled = seoDefaultsFilled(settings);

  const links = [
    { name: h.robotsLink, href: `${STOREFRONT_URL}/robots.txt` },
    { name: h.sitemapLink, href: `${STOREFRONT_URL}/sitemap.xml` },
    { name: h.llmsLink, href: `${STOREFRONT_URL}/llms.txt` },
  ];

  return (
    <FormSectionCard
      id={SEO_HEALTH_SECTION_ID}
      title={h.heading}
      actions={
        settings.noindexSite ? null : (
          <Badge variant="success">{h.noindexOkLabel}</Badge>
        )
      }
    >
      {/* noindex — the one truly urgent, RED state. */}
      {settings.noindexSite ? (
        <div
          role="alert"
          className="rounded-md border border-destructive bg-destructive/10 p-4"
        >
          <p className="text-sm font-semibold text-destructive">
            {h.noindexWarningTitle}
          </p>
          <p className="mt-1 text-sm text-destructive">
            {h.noindexWarningBody}
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : isError || !health ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {h.loadError}
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-md border border-border">
        {health ? (
          <>
            <HealthRow
              label={h.productsAutoLabel}
              href="/products"
              value={h.gapHint(
                health.productsMissingMetaTitle,
                health.productsTotal,
              )}
              attention={false}
            />
            <HealthRow
              label={h.categoriesAutoLabel}
              href="/categories"
              value={h.gapHint(
                health.categoriesMissingMetaTitle,
                health.categoriesTotal,
              )}
              attention={false}
            />
            <HealthRow
              label={h.pagesAutoLabel}
              href="/pages"
              value={h.gapHint(health.pagesMissingMetaTitle, health.pagesTotal)}
              attention={false}
            />
            {/* TASK-285: page content-gap counters — amber while non-zero. */}
            <HealthRow
              label={h.pagesMissingDescriptionLabel}
              href="/pages"
              value={h.gapHint(
                health.pagesMissingMetaDescription,
                health.pagesTotal,
              )}
              attention={health.pagesMissingMetaDescription > 0}
            />
            <HealthRow
              label={h.pagesThinContentLabel}
              href="/pages"
              value={h.gapHint(health.pagesThinContent, health.pagesTotal)}
              attention={health.pagesThinContent > 0}
            />
          </>
        ) : null}
        {/* Defaults-filled — client-side, so it stands even when the counts fail. */}
        <HealthRow
          label={h.defaultsFilledLabel}
          value={defaultsFilled ? h.defaultsFilledYes : h.defaultsFilledNo}
          attention={!defaultsFilled}
          action={
            defaultsFilled ? null : (
              <a
                href={DEFAULT_TITLE_FIELD_HREF}
                className="rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {h.fillDefaults}
                <span aria-hidden="true"> ↓</span>
              </a>
            )
          }
        />
      </ul>

      <p className="text-xs text-muted-foreground">{h.subheading}</p>

      {/* Outbound eyeball links to the live service files. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">{h.linksHeading}</span>
        {links.map((link) => (
          <a
            key={link.name}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={h.openLinkAria(link.name)}
            className="rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {link.name}
            <span aria-hidden="true"> ↗</span>
          </a>
        ))}
      </div>
    </FormSectionCard>
  );
}
