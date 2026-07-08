"use client";

import Link from "next/link";
import {
  useAdminSeoSettingsControllerGetHealth,
  type SeoSettingsEntity,
} from "@/entities/seo-settings";
import { dict } from "@/shared/config";
import { STOREFRONT_URL } from "@/shared/config";
import { Skeleton } from "@/shared/ui";

const h = dict.seoHealth;

interface SeoHealthSectionProps {
  /** The already-fetched settings singleton — source of the client-side
   *  "defaults filled" and "noindex" checks (plan 131 Decision 1). */
  settings: SeoSettingsEntity;
}

/** One informational auto-title row: `label` + `N із M …` in neutral tone. */
function AutoRow({
  label,
  missing,
  total,
  href,
}: {
  label: string;
  missing: number;
  total: number;
  href: string;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
      <Link
        href={href}
        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        {label}
      </Link>
      <span className="text-sm text-muted-foreground tabular-nums">
        {h.autoHint(missing, total)}
      </span>
    </li>
  );
}

/**
 * «SEO-здоров'я» section on /settings/seo (TASK-269).
 *
 * Fetches the six catalog COUNTs (products/categories/pages relying on
 * auto-generated meta titles — informational, never an error), and derives two
 * more checks client-side from the `settings` prop the page already holds: the
 * site-wide defaults (soft amber nudge when empty) and the `noindexSite` kill
 * switch (a prominent RED banner when on — the one genuinely urgent state). Three
 * outbound links let the owner eyeball the live robots/sitemap/llms files. The
 * health query degrades independently: its error state never blocks the edit
 * form rendered beside it.
 */
export function SeoHealthSection({ settings }: SeoHealthSectionProps) {
  const { data, isLoading, isError } = useAdminSeoSettingsControllerGetHealth();

  const defaultsFilled = Boolean(
    settings.defaultMetaTitle?.trim() &&
    settings.defaultMetaDescription?.trim(),
  );

  const links = [
    { name: h.robotsLink, href: `${STOREFRONT_URL}/robots.txt` },
    { name: h.sitemapLink, href: `${STOREFRONT_URL}/sitemap.xml` },
    { name: h.llmsLink, href: `${STOREFRONT_URL}/llms.txt` },
  ];

  return (
    <section aria-label={h.heading} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">
          {h.heading}
        </h3>
        <p className="text-sm text-muted-foreground">{h.subheading}</p>
      </div>

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
      ) : (
        <p className="text-sm text-muted-foreground">{h.noindexOkLabel}</p>
      )}

      {/* Auto-title counts — informational, never destructive. */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : isError || !data?.data ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {h.loadError}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card px-4">
          <AutoRow
            label={h.productsAutoLabel}
            missing={data.data.productsMissingMetaTitle}
            total={data.data.productsTotal}
            href="/products"
          />
          <AutoRow
            label={h.categoriesAutoLabel}
            missing={data.data.categoriesMissingMetaTitle}
            total={data.data.categoriesTotal}
            href="/categories"
          />
          <AutoRow
            label={h.pagesAutoLabel}
            missing={data.data.pagesMissingMetaTitle}
            total={data.data.pagesTotal}
            href="/pages"
          />
        </ul>
      )}

      {/* Defaults-filled — soft amber nudge when empty, neutral when filled. */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          {h.defaultsFilledLabel}
        </p>
        <p
          className={`text-sm ${
            defaultsFilled ? "text-muted-foreground" : "text-warning"
          }`}
        >
          {defaultsFilled ? h.defaultsFilledYes : h.defaultsFilledNo}
        </p>
      </div>

      {/* Outbound eyeball links to the live service files. */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{h.linksHeading}</p>
        <div className="flex flex-wrap gap-3">
          {links.map((link) => (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={h.openLinkAria(link.name)}
              className="text-sm text-primary underline underline-offset-4"
            >
              {link.name}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
