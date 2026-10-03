"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  Callout,
  CollapsibleSection,
  FieldError,
  FormActionsBar,
  Input,
  Label,
  SeoSnippetPreview,
  Textarea,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { cn } from "@/shared/lib";
import {
  resolveSeoPreviewTitle,
  resolveSeoPreviewDescription,
  resolveEffectiveTitleTemplate,
} from "@/shared/lib/seo";
import { dict, STOREFRONT_HOST } from "@/shared/config";
import {
  getSeoSettingsControllerGetSettingsQueryKey,
  useAdminSeoSettingsControllerUpdate,
  type SeoSettingsEntity,
} from "@/entities/seo-settings";
import {
  seoSettingsSchema,
  seoSettingsFormValuesToDto,
  mapSettingsToFormValues,
  normalizeSiteVerificationValue,
  parseSameAsLinks,
  type SeoSettingsFormInput,
  type SeoSettingsFormValues,
} from "../model/seo-settings-schema";

/**
 * The form's section anchors — the targets of the page's `FormSectionNav`
 * (TASK-1053, Н2). The page composes the nav; the ids live here, beside the
 * sections they name.
 */
export const SEO_SECTION_IDS = {
  store: "seo-store",
  defaults: "seo-defaults",
  social: "seo-social",
  verification: "seo-verification",
  ai: "seo-ai",
} as const;

type SectionKey = keyof typeof SEO_SECTION_IDS;

/** Which fields each section holds — for «Незбережені зміни» and auto-unfold. */
const SECTION_FIELDS: Record<SectionKey, (keyof SeoSettingsFormInput)[]> = {
  store: ["siteName"],
  defaults: ["defaultMetaTitle", "defaultMetaDescription", "titleTemplate"],
  social: ["defaultOgImage", "additionalSameAsLinks"],
  verification: ["googleSiteVerification", "bingSiteVerification"],
  ai: ["llmsTxtSummary"],
};

const f = dict.seoSettingsForm;

const SECTION_TITLES: Record<SectionKey, string> = {
  store: f.sectionStore,
  defaults: f.sectionDefaults,
  social: f.sectionSocial,
  verification: f.sectionVerification,
  ai: f.sectionAi,
};

type FoldedSection = "social" | "verification" | "ai";

interface SeoSettingsFormProps {
  settings: SeoSettingsEntity;
  /**
   * The store-logo upload, rendered in «Магазин і логотип». A slot because the
   * logo is its own feature with its own multipart routes (TASK-299), not a
   * field of this form.
   */
  logoSlot?: ReactNode;
}

/** `aria-describedby` from the ids that are present. */
function describedBy(...ids: (string | false | undefined)[]) {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

/**
 * Singleton SEO-settings form. Seeded from the fetched entity and submits an
 * upsert. Because the row is a singleton, `settings.id` is always the same
 * constant, so the forms.md Rule 2b reset fires once on first data arrival and
 * never clobbers an in-progress edit on a background refetch.
 *
 * Every field carries a plain-UA hint (`dict.seoSettingsForm.*Hint`) so a
 * non-technical admin understands what it controls (plan 116's core framing).
 *
 * Wave 198 (TASK-1053, Н2/Н5): five anchored section cards; «Соцмережі»,
 * «Верифікація» and «AI-асистенти» fold to a one-line summary (and unfold by
 * themselves when a field inside has an error — a folded error is a silent
 * «Зберегти»); an empty default title is flagged — a recommendation, not a
 * blocker (TASK-1175); one SERP preview with a switch between the two sample
 * pages; the sticky bar lists the sections with unsaved edits.
 */
export function SeoSettingsForm({ settings, logoSlot }: SeoSettingsFormProps) {
  const queryClient = useQueryClient();
  const update = useAdminSeoSettingsControllerUpdate();

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<SeoSettingsFormInput, unknown, SeoSettingsFormValues>({
    resolver: zodResolver(seoSettingsSchema),
    defaultValues: mapSettingsToFormValues(settings),
  });

  // forms.md Rule 2b: re-seed only when the entity identity changes.
  useEffect(() => {
    reset(mapSettingsToFormValues(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.id]);

  const [sample, setSample] = useState<"named" | "unnamed">("named");
  const [unfolded, setUnfolded] = useState<Record<FoldedSection, boolean>>({
    social: false,
    verification: false,
    ai: false,
  });

  const hasErrorIn = (
    section: SectionKey,
    errs: FieldErrors<SeoSettingsFormInput>,
  ) => SECTION_FIELDS[section].some((name) => errs[name] !== undefined);
  const isOpen = (section: FoldedSection) =>
    unfolded[section] || hasErrorIn(section, errors);

  // Self-referential SERP preview (TASK-268, Design Decision 4), in the REAL
  // tier order since TASK-552. This form edits the site-wide defaults, which
  // since TASK-432 are the LAST resort (own → derived → default): a page with a
  // name of its own never falls through to them. Feeding the defaults in as the
  // sample page's own title — what stood here — showed the owner that the
  // default wins over every product name, i.e. the pre-TASK-432 behaviour.
  //
  // So there are two samples, each honest about its tier:
  //   - a NAMED page (a product with no SEO fields): name + template, tier
  //     "derived" — the default is passed in and correctly loses;
  //   - an UNNAMED page (no SEO fields, no content — e.g. a bare listing): the
  //     only place the defaults actually surface, tier "default" (or "empty"
  //     while they are blank).
  // TASK-1053: one preview card, the two samples behind a switch.
  const live = useWatch({ control });
  const defaultMetaTitleValue = live.defaultMetaTitle ?? "";
  const defaultMetaDescriptionValue = live.defaultMetaDescription ?? "";
  // TASK-433: the brand half of the `%s | …` template now follows the store name
  // being typed above, so the preview shows the rename as it happens. `dict.brand`
  // stays as the fallback for a blank field — it is the same constant the
  // storefront falls back to (`SITE_NAME`) when `SeoSettings.siteName` is null.
  const titleTemplate = resolveEffectiveTitleTemplate(
    live.titleTemplate,
    (live.siteName ?? "").trim() || dict.brand,
  );
  const namedTitle = resolveSeoPreviewTitle({
    contentName: dict.seoSnippetPreview.samplePageName,
    defaultTitle: defaultMetaTitleValue,
    titleTemplate,
  });
  const namedDescription = resolveSeoPreviewDescription({
    contentDescription: dict.seoSnippetPreview.samplePageDescription,
    defaultDescription: defaultMetaDescriptionValue,
  });
  const unnamedTitle = resolveSeoPreviewTitle({
    defaultTitle: defaultMetaTitleValue,
    titleTemplate,
  });
  const unnamedDescription = resolveSeoPreviewDescription({
    defaultDescription: defaultMetaDescriptionValue,
  });

  // TASK-1175 (UI part): an empty default title is worth a warning — the
  // storefront's home page would carry the bare store name in Google.
  const titleEmpty = !defaultMetaTitleValue.trim();

  const dirtySections = (Object.keys(SECTION_FIELDS) as SectionKey[])
    .filter((section) =>
      SECTION_FIELDS[section].some((name) => dirtyFields[name]),
    )
    .map((section) => SECTION_TITLES[section]);

  // Visible half of plan 146 Design Decision 1: on blur a pasted full
  // <meta> tag is replaced in the input by the extracted token, so the owner
  // sees their paste was "understood". The DTO mapper re-normalizes on submit
  // for the paste-then-immediately-save path that skips blur.
  const normalizeVerificationField = (
    field: "googleSiteVerification" | "bingSiteVerification",
    raw: string,
  ) => {
    const normalized = normalizeSiteVerificationValue(raw);
    if (normalized !== raw) {
      setValue(field, normalized, { shouldValidate: true, shouldDirty: true });
    }
  };

  const onSubmit = (values: SeoSettingsFormValues) => {
    const submitted = getValues();
    update.mutate(
      { data: seoSettingsFormValuesToDto(values) },
      {
        onSuccess: () => {
          // What was saved is the new baseline: the bar empties and
          // «Скасувати зміни» returns here.
          reset(submitted);
          void queryClient.invalidateQueries({
            queryKey: getSeoSettingsControllerGetSettingsQueryKey(),
          });
          toast.success(dict.seoSettings.toastUpdated);
        },
        onError: () => {
          toast.error(dict.seoSettings.toastUpdateFailed);
        },
      },
    );
  };

  const errorText = (name: keyof SeoSettingsFormInput) => errors[name]?.message;

  const sameAsCount = parseSameAsLinks(live.additionalSameAsLinks ?? "").length;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {/* Store name (TASK-433) — deliberately the FIRST field: it is the name
          every title and template below is built from, and it is the field the
          owner comes to this page looking for. The logo caveat is its own
          paragraph rather than a clause in the hint, because an owner who
          renames the shop here WILL expect the header lettering to follow. */}
      <FormSectionCard id={SEO_SECTION_IDS.store} title={f.sectionStore}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seo-site-name">{f.siteName}</Label>
          <Input
            id="seo-site-name"
            placeholder={f.siteNamePlaceholder(dict.brand)}
            aria-invalid={errors.siteName ? true : undefined}
            aria-describedby={describedBy(
              errors.siteName && "seo-site-name-error",
              "seo-site-name-hint",
            )}
            {...register("siteName")}
          />
          <FieldError id="seo-site-name-error">
            {errorText("siteName")}
          </FieldError>
          <p id="seo-site-name-hint" className="text-xs text-muted-foreground">
            {f.siteNameHint}
          </p>
          <p className="text-xs text-muted-foreground">{f.siteNameLogoNote}</p>
        </div>
        {logoSlot}
      </FormSectionCard>

      <FormSectionCard id={SEO_SECTION_IDS.defaults} title={f.sectionDefaults}>
        {titleEmpty ? (
          <Callout variant="warning">{f.emptyTitleWarning}</Callout>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seo-default-title">{f.defaultMetaTitle}</Label>
          <Input
            id="seo-default-title"
            className="scroll-mt-4"
            placeholder={f.defaultMetaTitlePlaceholder}
            aria-invalid={
              titleEmpty || errors.defaultMetaTitle ? true : undefined
            }
            aria-describedby={describedBy(
              errors.defaultMetaTitle && "seo-default-title-error",
              titleEmpty && "seo-default-title-recommendation",
              "seo-default-title-hint",
            )}
            {...register("defaultMetaTitle")}
          />
          <FieldError id="seo-default-title-error">
            {errorText("defaultMetaTitle")}
          </FieldError>
          {titleEmpty ? (
            <p
              id="seo-default-title-recommendation"
              className="text-xs text-destructive"
            >
              {f.emptyTitleRecommendation}
            </p>
          ) : null}
          <p
            id="seo-default-title-hint"
            className="text-xs text-muted-foreground"
          >
            {f.defaultMetaTitleHint}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seo-default-description">
            {f.defaultMetaDescription}
          </Label>
          <Textarea
            id="seo-default-description"
            rows={3}
            placeholder={f.defaultMetaDescriptionPlaceholder}
            aria-invalid={errors.defaultMetaDescription ? true : undefined}
            aria-describedby={describedBy(
              errors.defaultMetaDescription && "seo-default-description-error",
              "seo-default-description-hint",
            )}
            {...register("defaultMetaDescription")}
          />
          <FieldError id="seo-default-description-error">
            {errorText("defaultMetaDescription")}
          </FieldError>
          <p
            id="seo-default-description-hint"
            className="text-xs text-muted-foreground"
          >
            {f.defaultMetaDescriptionHint}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seo-title-template">{f.titleTemplate}</Label>
          <Input
            id="seo-title-template"
            placeholder={f.titleTemplatePlaceholder}
            aria-invalid={errors.titleTemplate ? true : undefined}
            aria-describedby={describedBy(
              errors.titleTemplate && "seo-title-template-error",
              "seo-title-template-hint",
            )}
            {...register("titleTemplate")}
          />
          <FieldError id="seo-title-template-error">
            {errorText("titleTemplate")}
          </FieldError>
          <p
            id="seo-title-template-hint"
            className="text-xs text-muted-foreground"
          >
            {f.titleTemplateHint}
          </p>
        </div>

        {/* One SERP preview, two samples in the real tier order (TASK-552):
            a page that has a name — the defaults lose to it — and one that has
            none, the only place the defaults above actually show up. */}
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              {f.previewHeading}
            </p>
            <div
              role="group"
              aria-label={f.previewSampleAria}
              className="inline-flex rounded-md bg-muted p-0.5"
            >
              {(
                [
                  ["named", f.previewNamedHeading],
                  ["unnamed", f.previewUnnamedHeading],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sample === value}
                  onClick={() => setSample(value)}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    sample === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {sample === "named" ? (
            <div
              className="flex flex-col gap-1.5"
              data-testid="seo-preview-named"
            >
              <SeoSnippetPreview
                title={namedTitle.text}
                titleTier={namedTitle.tier}
                description={namedDescription.text || undefined}
                descriptionTier={namedDescription.tier}
                url={`${STOREFRONT_HOST} › …`}
                // The sample has no SEO fields of its own; the counters measure
                // what Google would get, so a template that bloats every title
                // shows up red here.
                rawTitleLength={namedTitle.text.length}
                rawDescriptionLength={namedDescription.text.length}
              />
              <p className="text-xs text-muted-foreground">
                {f.previewNamedNote(dict.seoSnippetPreview.samplePageName)}
              </p>
            </div>
          ) : (
            <div
              className="flex flex-col gap-1.5"
              data-testid="seo-preview-unnamed"
            >
              <SeoSnippetPreview
                title={unnamedTitle.text}
                titleTier={unnamedTitle.tier}
                description={unnamedDescription.text || undefined}
                descriptionTier={unnamedDescription.tier}
                url={`${STOREFRONT_HOST} › …`}
                rawTitleLength={defaultMetaTitleValue.trim().length}
                rawDescriptionLength={defaultMetaDescriptionValue.trim().length}
              />
              <p className="text-xs text-muted-foreground">
                {f.previewUnnamedNote}
              </p>
            </div>
          )}
        </div>
      </FormSectionCard>

      <CollapsibleSection
        id={SEO_SECTION_IDS.social}
        title={f.sectionSocial}
        open={isOpen("social")}
        onOpenChange={(open) =>
          setUnfolded((prev) => ({ ...prev, social: open }))
        }
        summary={
          <>
            <span>
              {(live.defaultOgImage ?? "").trim()
                ? f.summaryOgSet
                : f.summaryOgUnset}
            </span>
            {" · "}
            <span>{f.summarySameAs(sameAsCount)}</span>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seo-og-image">{f.defaultOgImage}</Label>
            <Input
              id="seo-og-image"
              type="url"
              placeholder={f.defaultOgImagePlaceholder(STOREFRONT_HOST)}
              aria-invalid={errors.defaultOgImage ? true : undefined}
              aria-describedby={describedBy(
                errors.defaultOgImage && "seo-og-image-error",
                "seo-og-image-hint",
              )}
              {...register("defaultOgImage")}
            />
            <FieldError id="seo-og-image-error">
              {errorText("defaultOgImage")}
            </FieldError>
            <p id="seo-og-image-hint" className="text-xs text-muted-foreground">
              {f.defaultOgImageHint}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seo-sameas-links">{f.additionalSameAsLinks}</Label>
            <Textarea
              id="seo-sameas-links"
              rows={4}
              placeholder={f.additionalSameAsLinksPlaceholder}
              aria-invalid={errors.additionalSameAsLinks ? true : undefined}
              aria-describedby={describedBy(
                errors.additionalSameAsLinks && "seo-sameas-links-error",
                "seo-sameas-links-hint",
              )}
              {...register("additionalSameAsLinks")}
            />
            <FieldError id="seo-sameas-links-error">
              {errorText("additionalSameAsLinks")}
            </FieldError>
            <p
              id="seo-sameas-links-hint"
              className="text-xs text-muted-foreground"
            >
              {f.additionalSameAsLinksHint}
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Search-console ownership verification (TASK-280) */}
      <CollapsibleSection
        id={SEO_SECTION_IDS.verification}
        title={f.sectionVerification}
        open={isOpen("verification")}
        onOpenChange={(open) =>
          setUnfolded((prev) => ({ ...prev, verification: open }))
        }
        summary={
          <>
            <span>
              {(live.googleSiteVerification ?? "").trim()
                ? f.summaryGoogleSet
                : f.summaryGoogleUnset}
            </span>
            {" · "}
            <span>
              {(live.bingSiteVerification ?? "").trim()
                ? f.summaryBingSet
                : f.summaryBingUnset}
            </span>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seo-google-verification">
              {f.googleSiteVerification}
            </Label>
            <Input
              id="seo-google-verification"
              placeholder={f.googleSiteVerificationPlaceholder}
              aria-invalid={errors.googleSiteVerification ? true : undefined}
              aria-describedby={describedBy(
                errors.googleSiteVerification &&
                  "seo-google-verification-error",
                "seo-google-verification-hint",
              )}
              {...register("googleSiteVerification", {
                onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
                  normalizeVerificationField(
                    "googleSiteVerification",
                    event.target.value,
                  ),
              })}
            />
            <FieldError id="seo-google-verification-error">
              {errorText("googleSiteVerification")}
            </FieldError>
            <p
              id="seo-google-verification-hint"
              className="text-xs text-muted-foreground"
            >
              {f.googleSiteVerificationHint}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seo-bing-verification">
              {f.bingSiteVerification}
            </Label>
            <Input
              id="seo-bing-verification"
              placeholder={f.bingSiteVerificationPlaceholder}
              aria-invalid={errors.bingSiteVerification ? true : undefined}
              aria-describedby={describedBy(
                errors.bingSiteVerification && "seo-bing-verification-error",
                "seo-bing-verification-hint",
              )}
              {...register("bingSiteVerification", {
                onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
                  normalizeVerificationField(
                    "bingSiteVerification",
                    event.target.value,
                  ),
              })}
            />
            <FieldError id="seo-bing-verification-error">
              {errorText("bingSiteVerification")}
            </FieldError>
            <p
              id="seo-bing-verification-hint"
              className="text-xs text-muted-foreground"
            >
              {f.bingSiteVerificationHint}
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* llms.txt summary */}
      <CollapsibleSection
        id={SEO_SECTION_IDS.ai}
        title={f.sectionAi}
        open={isOpen("ai")}
        onOpenChange={(open) => setUnfolded((prev) => ({ ...prev, ai: open }))}
        summary={
          <span>
            {(live.llmsTxtSummary ?? "").trim()
              ? f.summaryLlmsCustom
              : f.summaryLlmsDefault}
          </span>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seo-llms-summary">{f.llmsTxtSummary}</Label>
          <Textarea
            id="seo-llms-summary"
            rows={3}
            placeholder={f.llmsTxtSummaryPlaceholder}
            aria-invalid={errors.llmsTxtSummary ? true : undefined}
            aria-describedby={describedBy(
              errors.llmsTxtSummary && "seo-llms-summary-error",
              "seo-llms-summary-hint",
            )}
            {...register("llmsTxtSummary")}
          />
          <FieldError id="seo-llms-summary-error">
            {errorText("llmsTxtSummary")}
          </FieldError>
          <p
            id="seo-llms-summary-hint"
            className="text-xs text-muted-foreground"
          >
            {f.llmsTxtSummaryHint}
          </p>
        </div>
      </CollapsibleSection>

      {/*
        The site-wide "hide from search engines" checkbox used to live here and
        was REMOVED (TASK-307). It was a loaded gun pointed at the live store: one
        misclick took the whole shop out of Google, the damage took weeks to undo,
        and the form's own hint text had to warn about it in red — a sure sign the
        control should not have existed. It also did not work well enough to be
        worth the risk, since it only emitted a `robots.txt` disallow, which asks
        well-behaved crawlers not to look and cannot un-index URLs Google already
        holds.

        Keeping a test deployment out of search is a property of the ENVIRONMENT,
        not something an operator should toggle at runtime, so it now lives in the
        proxy: Caddyfile.staging puts staging behind basic auth and sends
        `X-Robots-Tag: noindex`. A password stops everyone, including crawlers.

        The `noindexSite` column and the storefront's robots.ts handling remain as
        a deliberate emergency kill switch — flipping it now needs a database
        write, which is the right amount of friction for an action this
        destructive. The operator-facing explanation lives in
        docs/admin-guide.md, §18 «SEO-налаштування» → «Куди подівся перемикач
        „Приховати сайт від пошукових систем“».
      */}

      <FormActionsBar
        variant="sticky"
        dirtySections={dirtySections}
        onDiscard={() => reset()}
        saveLabel={update.isPending ? dict.common.saving : f.submit}
        isSaving={update.isPending}
      />
    </form>
  );
}
