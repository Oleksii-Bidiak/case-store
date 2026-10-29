"use client";

import type { BannerEntity } from "@/entities/banner";
import {
  BannerPlacementPreview,
  ReadOnlyField,
  ReadOnlyImage,
  ReadOnlyLayout,
  ReadOnlyLink,
  ReadOnlyNotice,
  ReadOnlySection,
  ReadOnlySwatch,
} from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";

const f = dict.bannerForm;
const d = dict.banners;
const rv = dict.readOnlyView;

const STATUS_LABELS: Record<BannerEntity["status"], string> = {
  PUBLISHED: f.statusPublished,
  DRAFT: f.statusDraft,
  SCHEDULED: f.statusScheduled,
};

/** The palette the form offers (`THEME_OPTIONS` in the banner form). */
const THEMES: Record<string, { label: string; dotClassName: string }> = {
  primary: { label: f.themes.primary, dotClassName: "bg-primary" },
  sale: { label: f.themes.sale, dotClassName: "bg-sale" },
  success: { label: f.themes.success, dotClassName: "bg-success" },
};

/** A storefront path opens on the storefront; a full URL as it is. */
function siteHref(href: string): string {
  return href.startsWith("/") && !href.startsWith("//")
    ? `${STOREFRONT_URL}${href}`
    : href;
}

/**
 * The banner without `banners:write` (TASK-667 template, РО-1/РО-2): the
 * form's «Де показувати · Текст · Зображення · Кнопка · Оформлення · Показ» as
 * text, and «Так виглядає на сайті» kept beside them. No «Дублювати», no
 * «Видалити», no save bar.
 */
export function BannerReadOnly({ banner }: { banner: BannerEntity }) {
  const theme = banner.theme?.trim() ?? "";
  const known = THEMES[theme];
  return (
    <div className="flex flex-col gap-4">
      <ReadOnlyNotice>{rv.notices.banners}</ReadOnlyNotice>
      <ReadOnlyLayout
        aside={
          <BannerPlacementPreview
            placement={banner.placement}
            title={banner.title}
            subtitle={banner.subtitle ?? undefined}
            imageUrl={banner.imageUrl ?? undefined}
            ctaLabel={banner.ctaLabel ?? undefined}
            ctaHref={banner.ctaHref ?? undefined}
            theme={theme}
          />
        }
      >
        <ReadOnlySection title={f.placement}>
          <ReadOnlyField label={f.placement}>
            <span className="flex flex-col gap-0.5">
              <span>{d.placements[banner.placement]}</span>
              <span className="text-xs text-muted-foreground">
                {d.placementWhere[banner.placement]}
              </span>
            </span>
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionText}>
          <ReadOnlyField label={f.title}>{banner.title}</ReadOnlyField>
          <ReadOnlyField label={f.subtitle}>{banner.subtitle}</ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionImage}>
          <ReadOnlyField label={f.imageUpload.alt}>
            {banner.imageUrl ? (
              <ReadOnlyImage
                src={banner.imageUrl}
                alt={f.imageUpload.alt}
                caption={f.imageHints[banner.placement]}
              />
            ) : null}
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionButton}>
          <ReadOnlyField
            label={f.ctaLabel}
            emptyConsequence={rv.bannerNoButton}
          >
            {banner.ctaLabel}
          </ReadOnlyField>
          <ReadOnlyField label={f.ctaHref}>
            {banner.ctaHref ? (
              <ReadOnlyLink href={siteHref(banner.ctaHref)} external>
                {banner.ctaHref}
              </ReadOnlyLink>
            ) : null}
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.theme}>
          <ReadOnlyField label={f.theme}>
            {theme === "" ? (
              <ReadOnlySwatch dotClassName="bg-conic from-primary via-sale to-success">
                {f.themes.auto}
              </ReadOnlySwatch>
            ) : known ? (
              <ReadOnlySwatch dotClassName={known.dotClassName}>
                {known.label}
              </ReadOnlySwatch>
            ) : (
              <span className="font-mono">{theme}</span>
            )}
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.status}>
          <ReadOnlyField label={f.status}>
            {STATUS_LABELS[banner.status]}
          </ReadOnlyField>
          {banner.status === "SCHEDULED" ? (
            <ReadOnlyField label={f.scheduledAt}>
              {banner.scheduledAt ? formatDateTime(banner.scheduledAt) : null}
            </ReadOnlyField>
          ) : null}
          {banner.status !== "DRAFT" ? (
            <ReadOnlyField
              label={f.scheduledUntil}
              emptyConsequence={rv.bannerNoEnd}
            >
              {banner.scheduledUntil
                ? formatDateTime(banner.scheduledUntil)
                : null}
            </ReadOnlyField>
          ) : null}
        </ReadOnlySection>
      </ReadOnlyLayout>
    </div>
  );
}
