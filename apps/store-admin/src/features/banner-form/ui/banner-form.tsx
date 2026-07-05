"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Label, Textarea } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  bannerSchema,
  BANNER_PLACEMENT,
  type BannerFormInput,
  type BannerFormValues,
} from "../model/banner-schema";

interface BannerFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different banner,
   *  never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<BannerFormInput>;
  onSubmit: (values: BannerFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: BannerFormInput = {
  placement: "HERO_SLIDE",
  title: "",
  subtitle: "",
  imageUrl: "",
  ctaLabel: "",
  ctaHref: "",
  theme: "",
  sortOrder: "0",
  status: "DRAFT",
  scheduledAt: "",
};

/**
 * Reusable create/edit banner form with structured fields (no rich-text editor):
 * placement, title, subtitle, image URL, CTA label/href, theme, sort order, plus
 * the shared publish controls.
 */
export function BannerForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.bannerForm.submit,
}: BannerFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BannerFormInput, unknown, BannerFormValues>({
    resolver: zodResolver(bannerSchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md Rule 2b: re-seed only when navigating to a different entity (`id`
  // changes), NOT on every render or background refetch.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const statusValue = useWatch({ control, name: "status" });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banner-placement">{dict.bannerForm.placement}</Label>
        <select
          id="banner-placement"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          {...register("placement")}
        >
          {BANNER_PLACEMENT.map((value) => (
            <option key={value} value={value}>
              {dict.bannerForm.placements[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banner-title">{dict.bannerForm.title}</Label>
        <Input id="banner-title" {...register("title")} />
        {errors.title && (
          <p role="alert" className="text-sm text-destructive">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banner-subtitle">{dict.bannerForm.subtitle}</Label>
        <Textarea
          id="banner-subtitle"
          rows={2}
          placeholder={dict.bannerForm.subtitlePlaceholder}
          {...register("subtitle")}
        />
        {errors.subtitle && (
          <p role="alert" className="text-sm text-destructive">
            {errors.subtitle.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banner-image">{dict.bannerForm.imageUrl}</Label>
        <Input
          id="banner-image"
          placeholder={dict.bannerForm.imageUrlPlaceholder}
          {...register("imageUrl")}
        />
        {errors.imageUrl && (
          <p role="alert" className="text-sm text-destructive">
            {errors.imageUrl.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banner-cta-label">{dict.bannerForm.ctaLabel}</Label>
        <Input id="banner-cta-label" {...register("ctaLabel")} />
        {errors.ctaLabel && (
          <p role="alert" className="text-sm text-destructive">
            {errors.ctaLabel.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banner-cta-href">{dict.bannerForm.ctaHref}</Label>
        <Input
          id="banner-cta-href"
          placeholder={dict.bannerForm.ctaHrefPlaceholder}
          {...register("ctaHref")}
        />
        {errors.ctaHref && (
          <p role="alert" className="text-sm text-destructive">
            {errors.ctaHref.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banner-theme">{dict.bannerForm.theme}</Label>
        <Input
          id="banner-theme"
          placeholder={dict.bannerForm.themePlaceholder}
          {...register("theme")}
        />
        {errors.theme && (
          <p role="alert" className="text-sm text-destructive">
            {errors.theme.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banner-sort">{dict.bannerForm.sortOrder}</Label>
        <Input
          id="banner-sort"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          {...register("sortOrder")}
        />
        {errors.sortOrder && (
          <p role="alert" className="text-sm text-destructive">
            {errors.sortOrder.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="banner-status">{dict.bannerForm.status}</Label>
        <select
          id="banner-status"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          {...register("status")}
        >
          <option value="DRAFT">{dict.bannerForm.statusDraft}</option>
          <option value="SCHEDULED">{dict.bannerForm.statusScheduled}</option>
          <option value="PUBLISHED">{dict.bannerForm.statusPublished}</option>
        </select>
      </div>

      {statusValue === "SCHEDULED" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="banner-scheduled-at">
            {dict.bannerForm.scheduledAt}
          </Label>
          <Input
            id="banner-scheduled-at"
            type="datetime-local"
            {...register("scheduledAt")}
          />
          <p className="text-sm text-muted-foreground">
            {dict.bannerForm.scheduledAtHint}
          </p>
          {errors.scheduledAt && (
            <p role="alert" className="text-sm text-destructive">
              {errors.scheduledAt.message}
            </p>
          )}
        </div>
      )}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
