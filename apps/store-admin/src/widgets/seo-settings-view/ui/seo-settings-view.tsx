"use client";

import {
  AdminFormSkeleton,
  ErrorState,
  FormSectionNav,
  type FormSection,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { SEO_SECTION_IDS, SeoSettingsForm } from "@/features/seo-settings-form";
import { StoreLogoUpload } from "@/features/store-logo-upload";
import {
  useAdminSeoSettingsControllerGetHealth,
  useSeoSettingsControllerGetSettings,
  type SeoHealthEntity,
  type SeoSettingsEntity,
} from "@/entities/seo-settings";
import {
  SEO_HEALTH_SECTION_ID,
  SeoHealthSection,
  seoDefaultsFilled,
} from "./seo-health-section";

const f = dict.seoSettingsForm;

/** A nav entry with its dot: amber «варто перевірити» or green «заповнено». */
function section(id: string, label: string, ok: boolean): FormSection {
  return {
    id,
    label,
    status: ok ? "success" : "warning",
    statusLabel: ok
      ? dict.seoSettings.navOk
      : dict.seoSettings.navNeedsAttention,
  };
}

/**
 * The nav's dots, from what is SAVED (the settings row and the health counts).
 * «AI-асистенти» has none: the built-in llms.txt intro is a fine default, so
 * there is nothing there to nudge about.
 */
function navSections(
  settings: SeoSettingsEntity,
  health: SeoHealthEntity | undefined,
): FormSection[] {
  const healthOk =
    !settings.noindexSite &&
    seoDefaultsFilled(settings) &&
    (health === undefined ||
      (health.pagesMissingMetaDescription === 0 &&
        health.pagesThinContent === 0));
  return [
    section(SEO_HEALTH_SECTION_ID, dict.seoHealth.heading, healthOk),
    section(
      SEO_SECTION_IDS.store,
      f.sectionStore,
      Boolean(settings.siteName?.trim()),
    ),
    section(
      SEO_SECTION_IDS.defaults,
      f.sectionDefaults,
      Boolean(settings.defaultMetaTitle?.trim()),
    ),
    section(
      SEO_SECTION_IDS.social,
      f.sectionSocial,
      Boolean(settings.defaultOgImage?.trim()),
    ),
    section(
      SEO_SECTION_IDS.verification,
      f.sectionVerification,
      Boolean(settings.googleSiteVerification?.trim()),
    ),
    { id: SEO_SECTION_IDS.ai, label: f.sectionAi },
  ];
}

/**
 * Settings view for the admin-managed global SEO block. Fetches the singleton
 * settings row and renders the edit form. The public GET never 404s — an
 * unseeded row returns an entity with zero-config defaults.
 *
 * The store logo (TASK-299) is written through its own multipart upload/delete
 * routes, not the settings upsert, so it is a sibling feature composed here —
 * handed to the form as a slot so it sits in «Магазин і логотип».
 *
 * Wave 198 (TASK-1053, Н2/Н5): titled «SEO»; a section nav with status dots
 * (sticky on the left at `md`+, a scrolling row on a phone); «Стан SEO» first;
 * a failed load offers «Повторити».
 */
export function SeoSettingsView() {
  const { data, isLoading, isError, isFetching, refetch } =
    useSeoSettingsControllerGetSettings();
  // The same query «Стан SEO» runs — React Query shares the one request.
  const { data: healthData } = useAdminSeoSettingsControllerGetHealth();
  const settings = data?.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.seoSettings.heading}
        </h2>
        <p className="text-sm text-muted-foreground">
          {dict.seoSettings.subheading}
        </p>
      </div>

      {isLoading ? (
        <AdminFormSkeleton />
      ) : isError || !settings ? (
        <ErrorState
          message={dict.seoSettings.loadError}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <FormSectionNav
            aria-label={dict.seoSettings.navAria}
            sections={navSections(settings, healthData?.data)}
            className="md:w-45 md:shrink-0"
          />
          <div className="flex min-w-0 max-w-220 flex-1 flex-col gap-4">
            <SeoHealthSection settings={settings} />
            <SeoSettingsForm
              settings={settings}
              logoSlot={<StoreLogoUpload logoUrl={settings.logoUrl ?? null} />}
            />
          </div>
        </div>
      )}
    </div>
  );
}
