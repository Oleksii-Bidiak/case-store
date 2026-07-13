"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BannerPlacementPreview,
  Button,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
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

  // Live preview (TASK-265): read-only observers on the same `control` feed the
  // presentational BannerPlacementPreview on every keystroke. Per-field
  // useWatch calls match the existing style above (no array form).
  const placementValue =
    useWatch({ control, name: "placement" }) ?? "HERO_SLIDE";
  const titleValue = useWatch({ control, name: "title" }) ?? "";
  const subtitleValue = useWatch({ control, name: "subtitle" }) ?? "";
  const imageUrlValue = useWatch({ control, name: "imageUrl" }) ?? "";
  const ctaLabelValue = useWatch({ control, name: "ctaLabel" }) ?? "";
  const ctaHrefValue = useWatch({ control, name: "ctaHref" }) ?? "";
  const themeValue = useWatch({ control, name: "theme" }) ?? "";

  // <md panel switch. Deliberate deviation from the app's usual Tabs usage:
  // Radix TabsContent unmounts the inactive panel, which would churn the form's
  // field DOM and reset the preview's local viewport-toggle state on every tab
  // switch. Instead BOTH panels stay permanently mounted inside the one <form>
  // and visibility is driven by this state + `hidden md:*` classes; the Tabs
  // primitive below is purely visual chrome (value/onValueChange, no
  // TabsContent). On md:+ the tab bar is hidden and the panels sit side by side.
  const [activePanel, setActivePanel] = useState<"form" | "preview">("form");

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <Tabs
        value={activePanel}
        onValueChange={(value) => setActivePanel(value as "form" | "preview")}
        className="md:hidden"
      >
        <TabsList className="w-full">
          <TabsTrigger value="form">{dict.bannerPreview.tabForm}</TabsTrigger>
          <TabsTrigger value="preview">
            {dict.bannerPreview.tabPreview}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-6">
        <div
          data-testid="banner-form-fields"
          className={cn(
            "flex max-w-2xl flex-col gap-5",
            activePanel !== "form" && "hidden md:flex",
          )}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="banner-placement">
              {dict.bannerForm.placement}
            </Label>
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
            <Label htmlFor="banner-status">{dict.bannerForm.status}</Label>
            <select
              id="banner-status"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              {...register("status")}
            >
              <option value="DRAFT">{dict.bannerForm.statusDraft}</option>
              <option value="SCHEDULED">
                {dict.bannerForm.statusScheduled}
              </option>
              <option value="PUBLISHED">
                {dict.bannerForm.statusPublished}
              </option>
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
        </div>

        <aside
          data-testid="banner-form-preview-panel"
          className={cn(
            "mt-4 md:sticky md:top-20 md:mt-0",
            activePanel !== "preview" && "hidden md:block",
          )}
        >
          <BannerPlacementPreview
            placement={placementValue}
            title={titleValue}
            subtitle={subtitleValue}
            imageUrl={imageUrlValue}
            ctaLabel={ctaLabelValue}
            ctaHref={ctaHrefValue}
            theme={themeValue}
          />
        </aside>
      </div>

      {/* Submit lives OUTSIDE both toggleable panels (below the md:grid, still
          inside the single <form>) so it stays reachable on <md from the
          preview tab too — the admin can submit without tabbing back. */}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
