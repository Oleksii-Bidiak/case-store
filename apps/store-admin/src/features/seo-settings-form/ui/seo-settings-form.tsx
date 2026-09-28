"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  Button,
  FormActionsBar,
  Input,
  Label,
  SeoSnippetPreview,
  Textarea,
} from "@/shared/ui";
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
  type SeoSettingsFormInput,
  type SeoSettingsFormValues,
} from "../model/seo-settings-schema";

interface SeoSettingsFormProps {
  settings: SeoSettingsEntity;
}

/**
 * Singleton SEO-settings form. Seeded from the fetched entity and submits an
 * upsert. Because the row is a singleton, `settings.id` is always the same
 * constant, so the forms.md Rule 2b reset fires once on first data arrival and
 * never clobbers an in-progress edit on a background refetch.
 *
 * Every field carries a plain-UA hint (`dict.seoSettingsForm.*Hint`) so a
 * non-technical admin understands what it controls (plan 116's core framing).
 */
export function SeoSettingsForm({ settings }: SeoSettingsFormProps) {
  const queryClient = useQueryClient();
  const update = useAdminSeoSettingsControllerUpdate();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SeoSettingsFormInput, unknown, SeoSettingsFormValues>({
    resolver: zodResolver(seoSettingsSchema),
    defaultValues: mapSettingsToFormValues(settings),
  });

  // forms.md Rule 2b: re-seed only when the entity identity changes.
  useEffect(() => {
    reset(mapSettingsToFormValues(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.id]);

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
  const defaultMetaTitleValue = useWatch({ control, name: "defaultMetaTitle" });
  const defaultMetaDescriptionValue = useWatch({
    control,
    name: "defaultMetaDescription",
  });
  const titleTemplateValue = useWatch({ control, name: "titleTemplate" });
  // TASK-433: the brand half of the `%s | …` template now follows the store name
  // being typed above, so the preview shows the rename as it happens. `dict.brand`
  // stays as the fallback for a blank field — it is the same constant the
  // storefront falls back to (`SITE_NAME`) when `SeoSettings.siteName` is null.
  const siteNameValue = useWatch({ control, name: "siteName" });
  const titleTemplate = resolveEffectiveTitleTemplate(
    titleTemplateValue,
    (siteNameValue ?? "").trim() || dict.brand,
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
      setValue(field, normalized, { shouldValidate: true });
    }
  };

  const onSubmit = (values: SeoSettingsFormValues) => {
    update.mutate(
      { data: seoSettingsFormValuesToDto(values) },
      {
        onSuccess: () => {
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

  const f = dict.seoSettingsForm;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      {/* Store name (TASK-433) — deliberately the FIRST field: it is the name
          every title and template below is built from, and it is the field the
          owner comes to this page looking for. The logo caveat is its own
          paragraph rather than a clause in the hint, because an owner who
          renames the shop here WILL expect the header lettering to follow. */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-site-name">{f.siteName}</Label>
        <p className="text-sm text-muted-foreground">{f.siteNameHint}</p>
        <Input
          id="seo-site-name"
          placeholder={f.siteNamePlaceholder(dict.brand)}
          {...register("siteName")}
        />
        <p className="text-sm text-muted-foreground">{f.siteNameLogoNote}</p>
        {errors.siteName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.siteName.message}
          </p>
        )}
      </div>

      {/* Default meta title */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-default-title">{f.defaultMetaTitle}</Label>
        <p className="text-sm text-muted-foreground">
          {f.defaultMetaTitleHint}
        </p>
        <Input
          id="seo-default-title"
          placeholder={f.defaultMetaTitlePlaceholder}
          {...register("defaultMetaTitle")}
        />
        {errors.defaultMetaTitle && (
          <p role="alert" className="text-sm text-destructive">
            {errors.defaultMetaTitle.message}
          </p>
        )}
      </div>

      {/* Default meta description */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-default-description">
          {f.defaultMetaDescription}
        </Label>
        <p className="text-sm text-muted-foreground">
          {f.defaultMetaDescriptionHint}
        </p>
        <Textarea
          id="seo-default-description"
          rows={3}
          placeholder={f.defaultMetaDescriptionPlaceholder}
          {...register("defaultMetaDescription")}
        />
        {errors.defaultMetaDescription && (
          <p role="alert" className="text-sm text-destructive">
            {errors.defaultMetaDescription.message}
          </p>
        )}
      </div>

      {/* SERP previews in the real tier order (TASK-552): first a page that
          has a name — the defaults lose to it — then one that has none, the
          only place the defaults below actually show up. */}
      <div className="flex flex-col gap-1.5" data-testid="seo-preview-named">
        <p className="text-sm font-medium text-foreground">
          {f.previewNamedHeading}
        </p>
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
        <p className="text-sm text-muted-foreground">
          {f.previewNamedNote(dict.seoSnippetPreview.samplePageName)}
        </p>
      </div>
      <div className="flex flex-col gap-1.5" data-testid="seo-preview-unnamed">
        <p className="text-sm font-medium text-foreground">
          {f.previewUnnamedHeading}
        </p>
        <SeoSnippetPreview
          title={unnamedTitle.text}
          titleTier={unnamedTitle.tier}
          description={unnamedDescription.text || undefined}
          descriptionTier={unnamedDescription.tier}
          url={`${STOREFRONT_HOST} › …`}
          rawTitleLength={(defaultMetaTitleValue ?? "").trim().length}
          rawDescriptionLength={
            (defaultMetaDescriptionValue ?? "").trim().length
          }
        />
        <p className="text-sm text-muted-foreground">{f.previewUnnamedNote}</p>
      </div>

      {/* Title template */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-title-template">{f.titleTemplate}</Label>
        <p className="text-sm text-muted-foreground">{f.titleTemplateHint}</p>
        <Input
          id="seo-title-template"
          placeholder={f.titleTemplatePlaceholder}
          {...register("titleTemplate")}
        />
        {errors.titleTemplate && (
          <p role="alert" className="text-sm text-destructive">
            {errors.titleTemplate.message}
          </p>
        )}
      </div>

      {/* Default OG image */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-og-image">{f.defaultOgImage}</Label>
        <p className="text-sm text-muted-foreground">{f.defaultOgImageHint}</p>
        <Input
          id="seo-og-image"
          type="url"
          placeholder={f.defaultOgImagePlaceholder(STOREFRONT_HOST)}
          {...register("defaultOgImage")}
        />
        {errors.defaultOgImage && (
          <p role="alert" className="text-sm text-destructive">
            {errors.defaultOgImage.message}
          </p>
        )}
      </div>

      {/* Search-console ownership verification (TASK-280) */}
      <h3 className="text-sm font-semibold">{f.siteVerificationGroup}</h3>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-google-verification">
          {f.googleSiteVerification}
        </Label>
        <p className="text-sm text-muted-foreground">
          {f.googleSiteVerificationHint}
        </p>
        <Input
          id="seo-google-verification"
          placeholder={f.googleSiteVerificationPlaceholder}
          {...register("googleSiteVerification", {
            onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
              normalizeVerificationField(
                "googleSiteVerification",
                event.target.value,
              ),
          })}
        />
        {errors.googleSiteVerification && (
          <p role="alert" className="text-sm text-destructive">
            {errors.googleSiteVerification.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-bing-verification">{f.bingSiteVerification}</Label>
        <p className="text-sm text-muted-foreground">
          {f.bingSiteVerificationHint}
        </p>
        <Input
          id="seo-bing-verification"
          placeholder={f.bingSiteVerificationPlaceholder}
          {...register("bingSiteVerification", {
            onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
              normalizeVerificationField(
                "bingSiteVerification",
                event.target.value,
              ),
          })}
        />
        {errors.bingSiteVerification && (
          <p role="alert" className="text-sm text-destructive">
            {errors.bingSiteVerification.message}
          </p>
        )}
      </div>

      {/* llms.txt summary */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-llms-summary">{f.llmsTxtSummary}</Label>
        <p className="text-sm text-muted-foreground">{f.llmsTxtSummaryHint}</p>
        <Textarea
          id="seo-llms-summary"
          rows={3}
          placeholder={f.llmsTxtSummaryPlaceholder}
          {...register("llmsTxtSummary")}
        />
        {errors.llmsTxtSummary && (
          <p role="alert" className="text-sm text-destructive">
            {errors.llmsTxtSummary.message}
          </p>
        )}
      </div>

      {/* Additional sameAs links */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-sameas-links">{f.additionalSameAsLinks}</Label>
        <p className="text-sm text-muted-foreground">
          {f.additionalSameAsLinksHint}
        </p>
        <Textarea
          id="seo-sameas-links"
          rows={4}
          placeholder={f.additionalSameAsLinksPlaceholder}
          {...register("additionalSameAsLinks")}
        />
        {errors.additionalSameAsLinks && (
          <p role="alert" className="text-sm text-destructive">
            {errors.additionalSameAsLinks.message}
          </p>
        )}
      </div>

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

      <FormActionsBar>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? dict.common.saving : f.submit}
        </Button>
      </FormActionsBar>
    </form>
  );
}
