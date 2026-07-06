"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Input, Label, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  getSeoSettingsControllerGetSettingsQueryKey,
  useAdminSeoSettingsControllerUpdate,
  type SeoSettingsEntity,
} from "@/entities/seo-settings";
import {
  seoSettingsSchema,
  seoSettingsFormValuesToDto,
  mapSettingsToFormValues,
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
    handleSubmit,
    reset,
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
          placeholder={f.defaultOgImagePlaceholder}
          {...register("defaultOgImage")}
        />
        {errors.defaultOgImage && (
          <p role="alert" className="text-sm text-destructive">
            {errors.defaultOgImage.message}
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

      {/* Site-wide noindex */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            id="seo-noindex"
            type="checkbox"
            className="size-4 rounded border-border accent-primary"
            {...register("noindexSite")}
          />
          <Label htmlFor="seo-noindex">{f.noindexSite}</Label>
        </div>
        <p className="text-sm text-muted-foreground">{f.noindexSiteHint}</p>
      </div>

      <div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? dict.common.saving : f.submit}
        </Button>
      </div>
    </form>
  );
}
