"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BannerPlacementPreview,
  FieldError,
  FormActionsBar,
  FormAlert,
  Input,
  Label,
  RadioCard,
  RadioCardGroup,
  SegmentedControl,
  SwatchPicker,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  type SwatchOption,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import {
  ContentImageField,
  useImageUploadField,
  useUploadsControllerUploadBannerImage,
} from "@/features/content-image-upload";
import { MediaPicker } from "@/features/media-picker";
import { LinkPicker } from "@/features/link-picker";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import {
  bannerSchema,
  type BannerFormInput,
  type BannerFormValues,
  type BannerPlacementValue,
  type BannerStatusValue,
} from "../model/banner-schema";

const f = dict.bannerForm;
const FORM_ID = "banner-form";

interface BannerFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different banner,
   *  never on a background refetch. Omitted in create mode, where
   *  `defaultValues` (synchronous — e.g. the `?placement=` of «Додати сюди»)
   *  seed the first render instead. */
  id?: string;
  defaultValues?: Partial<BannerFormInput>;
  onSubmit: (values: BannerFormValues) => void;
  isPending: boolean;
  /** The sticky bar's primary button: «Зберегти» / «Створити банер». */
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
  scheduledUntil: "",
};

/** Placement cards, top-to-bottom as on the storefront. */
const PLACEMENT_CARDS: readonly BannerPlacementValue[] = [
  "ANNOUNCEMENT_BAR",
  "HERO_SLIDE",
  "PROMO_TILE",
  "PROMO_BANNER",
];

/** Where the slot sits in the little page schema of each card (БН5). */
const PLACEMENT_SCHEMA: Record<BannerPlacementValue, string> = {
  ANNOUNCEMENT_BAR: "inset-x-0 top-0 h-1",
  HERO_SLIDE: "inset-x-1 top-1.5 h-3.5",
  PROMO_TILE: "top-2.5 left-1 h-2.5 w-3",
  PROMO_BANNER: "inset-x-1 top-3.5 h-1.5",
};

/**
 * What the slot shows comfortably — the counters' second number. NOT the API
 * limit (255 / 500): a longer text still saves, the counter only turns amber.
 */
const TITLE_COMFORT = 60;
const SUBTITLE_COMFORT = 120;

/**
 * The palette the storefront understands today: `PromoTiles` honours exactly
 * these three keys; anything else rotates by position («Автоматично»). A value
 * outside it is kept as «Своє…» — a shared palette with own colours is an API
 * tail (TASK-1073).
 */
type ThemeChoice = "auto" | "primary" | "sale" | "success" | "custom";
const PALETTE = ["primary", "sale", "success"] as const;
const THEME_OPTIONS: readonly SwatchOption<ThemeChoice>[] = [
  {
    value: "auto",
    label: f.themes.auto,
    dotClassName: "bg-conic from-primary via-sale to-success",
  },
  { value: "primary", label: f.themes.primary, dotClassName: "bg-primary" },
  { value: "sale", label: f.themes.sale, dotClassName: "bg-sale" },
  { value: "success", label: f.themes.success, dotClassName: "bg-success" },
  { value: "custom", label: f.themeCustom },
];

const STATUS_OPTIONS: readonly { value: BannerStatusValue; label: string }[] = [
  { value: "PUBLISHED", label: f.statusPublished },
  { value: "DRAFT", label: f.statusDraft },
  { value: "SCHEDULED", label: f.statusScheduled },
];

type FieldName = keyof BannerFormInput;

/** Section → its fields: drives «Незбережені зміни: …». */
const SECTIONS: readonly { label: string; fields: readonly FieldName[] }[] = [
  { label: f.placement, fields: ["placement"] },
  { label: f.sectionText, fields: ["title", "subtitle"] },
  { label: f.sectionImage, fields: ["imageUrl"] },
  { label: f.sectionButton, fields: ["ctaLabel", "ctaHref"] },
  { label: f.theme, fields: ["theme"] },
  { label: f.status, fields: ["status", "scheduledAt", "scheduledUntil"] },
];

/** Field → the name the error summary quotes, in form order. */
const FIELD_LABELS: readonly [FieldName, string][] = [
  ["placement", f.placement],
  ["title", f.title],
  ["subtitle", f.subtitle],
  ["imageUrl", f.imageUrl],
  ["ctaLabel", f.ctaLabel],
  ["ctaHref", f.ctaHref],
  ["theme", f.theme],
  ["status", f.status],
  ["scheduledAt", f.scheduledAt],
  ["scheduledUntil", f.scheduledUntil],
];

const errorId = (field: FieldName) => `banner-${field}-error`;

/**
 * Create/edit banner form (BannersProposal БН5–БН9, wave 198): «Де показувати»
 * as cards with a page schema, text with counters, the picture with the slot's
 * proportions, «Куди веде кнопка» through the LinkPicker, «Оформлення» as
 * swatches, «Показ» as a segmented switch with the window beside it — and ONE
 * sticky «Зберегти» that names what is unsaved. The live preview sticks beside
 * the form; below `md` the «Форма | Прев'ю» tabs stay (owner decision).
 */
export function BannerForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
}: BannerFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, dirtyFields, submitCount },
  } = useForm<BannerFormInput, unknown, BannerFormValues>({
    resolver: zodResolver(bannerSchema),
    // Create mode only: a synchronous seed (the «Додати сюди» placement). Edit
    // mode starts empty and is re-seeded by the effect below.
    defaultValues: id ? EMPTY_VALUES : { ...EMPTY_VALUES, ...defaultValues },
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
  // presentational BannerPlacementPreview on every keystroke.
  const placementValue =
    useWatch({ control, name: "placement" }) ?? "HERO_SLIDE";
  const titleValue = useWatch({ control, name: "title" }) ?? "";
  const subtitleValue = useWatch({ control, name: "subtitle" }) ?? "";
  const imageUrlValue = useWatch({ control, name: "imageUrl" }) ?? "";
  const ctaLabelValue = useWatch({ control, name: "ctaLabel" }) ?? "";
  const ctaHrefValue = useWatch({ control, name: "ctaHref" }) ?? "";
  const themeValue = useWatch({ control, name: "theme" }) ?? "";

  // TASK-424: the artwork field takes a FILE as well as a pasted link. The
  // uploaded URL is written with `setValue`, which also refreshes the live
  // preview above — it reads the same `imageUrlValue` watcher.
  const imageUpload = useImageUploadField({
    upload: useUploadsControllerUploadBannerImage(),
    copy: f.imageUpload,
    onUploaded: (url) =>
      setValue("imageUrl", url, { shouldDirty: true, shouldValidate: true }),
  });

  // «Своє…» was picked explicitly (the value may still be empty). A value that
  // is already outside the palette is «Своє…» on its own — derived, not seeded.
  const [customTheme, setCustomTheme] = useState(false);
  const themeInPalette =
    themeValue === "" ||
    (PALETTE as readonly string[]).includes(themeValue.trim());
  const themeChoice: ThemeChoice =
    customTheme || !themeInPalette
      ? "custom"
      : themeValue === ""
        ? "auto"
        : (themeValue.trim() as ThemeChoice);

  const chooseTheme = (choice: ThemeChoice) => {
    if (choice === "custom") {
      setCustomTheme(true);
      return;
    }
    setCustomTheme(false);
    setValue("theme", choice === "auto" ? "" : choice, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  // <md panel switch. Both panels stay permanently mounted inside the one
  // <form>; visibility is driven by this state + `hidden md:*` classes, and the
  // Tabs primitive is purely visual chrome (no TabsContent) — Radix would
  // unmount the inactive panel and churn the fields.
  const [activePanel, setActivePanel] = useState<"form" | "preview">("form");

  const errorFields = FIELD_LABELS.filter(([field]) => errors[field]);
  const showErrors = submitCount > 0 && errorFields.length > 0;
  const dirtySections = SECTIONS.filter((section) =>
    section.fields.some((field) => dirtyFields[field]),
  ).map((section) => section.label);

  const summary = showErrors
    ? f.barErrors(errorFields.length)
    : !id && dirtySections.length === 0
      ? f.barNew
      : undefined;

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    // A submit bubbling through a portal (a dialog's own form) is not ours.
    if (event.target !== event.currentTarget) return;
    void handleSubmit(onSubmit, () => setActivePanel("form"))(event);
  };

  const fieldA11y = (field: FieldName, ...extraIds: (string | undefined)[]) => {
    const describedBy = [
      ...extraIds,
      errors[field] ? errorId(field) : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };

  return (
    <form
      id={FORM_ID}
      onSubmit={onFormSubmit}
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

      {showErrors && (
        <FormAlert>
          {f.errorSummary(errorFields.map(([, label]) => label))}
        </FormAlert>
      )}

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-6">
        <div
          data-testid="banner-form-fields"
          className={cn(
            "flex min-w-0 flex-col gap-4",
            activePanel !== "form" && "hidden md:flex",
          )}
        >
          <FormSectionCard title={f.placement}>
            <Controller
              control={control}
              name="placement"
              render={({ field }) => (
                <RadioCardGroup
                  aria-label={f.placement}
                  value={field.value}
                  onValueChange={(value) =>
                    field.onChange(value as BannerPlacementValue)
                  }
                  className="md:grid-cols-2"
                >
                  {PLACEMENT_CARDS.map((placement) => (
                    <RadioCard
                      key={placement}
                      value={placement}
                      title={f.placements[placement]}
                      description={dict.banners.placementWhere[placement]}
                      media={<PlacementSchema placement={placement} />}
                      className="data-[state=checked]:bg-primary/6"
                    />
                  ))}
                </RadioCardGroup>
              )}
            />
          </FormSectionCard>

          <FormSectionCard title={f.sectionText}>
            <CountedField
              id="banner-title"
              label={f.title}
              required
              count={titleValue.length}
              comfort={TITLE_COMFORT}
            >
              {(counterId) => (
                <Input
                  id="banner-title"
                  aria-required="true"
                  {...fieldA11y("title", counterId)}
                  {...register("title")}
                />
              )}
            </CountedField>
            <FieldError id={errorId("title")}>
              {errors.title?.message}
            </FieldError>

            <CountedField
              id="banner-subtitle"
              label={f.subtitle}
              count={subtitleValue.length}
              comfort={SUBTITLE_COMFORT}
            >
              {(counterId) => (
                <Textarea
                  id="banner-subtitle"
                  rows={2}
                  placeholder={f.subtitlePlaceholder}
                  {...fieldA11y("subtitle", counterId)}
                  {...register("subtitle")}
                />
              )}
            </CountedField>
            <FieldError id={errorId("subtitle")}>
              {errors.subtitle?.message}
            </FieldError>
          </FormSectionCard>

          <FormSectionCard title={f.sectionImage}>
            <ContentImageField
              id="banner-image"
              label={f.imageUrl}
              urlPlaceholder={f.imageUrlPlaceholder}
              // The proportion hint follows the chosen placement (БН5).
              copy={{ ...f.imageUpload, hint: f.imageHints[placementValue] }}
              value={imageUrlValue}
              urlInput={register("imageUrl")}
              onRemove={() =>
                setValue("imageUrl", "", {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              fieldError={errors.imageUrl?.message}
              // TASK-441: the same picture may already be in the library — a
              // picked asset writes its URL through `setValue`, exactly like an
              // upload, so the live preview follows either way.
              picker={
                <MediaPicker
                  onPick={(asset) =>
                    setValue("imageUrl", asset.url, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              }
              {...imageUpload}
            />
          </FormSectionCard>

          <FormSectionCard title={f.sectionButton}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="banner-cta-label">{f.ctaLabel}</Label>
                <Input
                  id="banner-cta-label"
                  placeholder={f.ctaLabelPlaceholder}
                  {...fieldA11y("ctaLabel")}
                  {...register("ctaLabel")}
                />
                <FieldError id={errorId("ctaLabel")}>
                  {errors.ctaLabel?.message}
                </FieldError>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="banner-cta-href">{f.ctaHref}</Label>
                <Controller
                  control={control}
                  name="ctaHref"
                  render={({ field }) => (
                    <LinkPicker
                      id="banner-cta-href"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      invalid={Boolean(errors.ctaHref)}
                      describedBy={
                        errors.ctaHref ? errorId("ctaHref") : undefined
                      }
                    />
                  )}
                />
                <FieldError id={errorId("ctaHref")}>
                  {errors.ctaHref?.message}
                </FieldError>
              </div>
            </div>
          </FormSectionCard>

          <FormSectionCard title={f.theme}>
            <SwatchPicker
              aria-label={f.theme}
              value={themeChoice}
              onValueChange={chooseTheme}
              options={THEME_OPTIONS}
            />
            {themeChoice === "custom" && (
              <div className="flex flex-col gap-1.5 md:max-w-xs">
                <Label htmlFor="banner-theme">{f.themeCustomLabel}</Label>
                <Input
                  id="banner-theme"
                  placeholder={f.themePlaceholder}
                  {...fieldA11y("theme")}
                  {...register("theme")}
                />
                <FieldError id={errorId("theme")}>
                  {errors.theme?.message}
                </FieldError>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {f.themeHint} {f.themeTilesOnly}
            </p>
          </FormSectionCard>

          <FormSectionCard title={f.status}>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <SegmentedControl
                  aria-label={f.status}
                  value={field.value}
                  onValueChange={field.onChange}
                  options={STATUS_OPTIONS}
                />
              )}
            />

            {/* TASK-429: the publication WINDOW, not a single instant. The start
                only exists for a SCHEDULED banner (a PUBLISHED one starts now),
                but the END applies to both — "показати зараз, зняти 1-го". A
                DRAFT gets neither: nothing is up, so nothing comes down. */}
            {statusValue !== "DRAFT" && (
              <div className="grid gap-4 md:grid-cols-2">
                {statusValue === "SCHEDULED" ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="banner-scheduled-at">{f.scheduledAt}</Label>
                    <Input
                      id="banner-scheduled-at"
                      type="datetime-local"
                      {...fieldA11y("scheduledAt", "banner-scheduled-at-hint")}
                      {...register("scheduledAt")}
                    />
                    <p
                      id="banner-scheduled-at-hint"
                      className="text-xs text-muted-foreground"
                    >
                      {f.scheduledAtHint}
                    </p>
                    <FieldError id={errorId("scheduledAt")}>
                      {errors.scheduledAt?.message}
                    </FieldError>
                  </div>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="banner-scheduled-until">
                    {f.scheduledUntil}
                  </Label>
                  <Input
                    id="banner-scheduled-until"
                    type="datetime-local"
                    {...fieldA11y(
                      "scheduledUntil",
                      "banner-scheduled-until-hint",
                    )}
                    {...register("scheduledUntil")}
                  />
                  <FieldError id={errorId("scheduledUntil")}>
                    {errors.scheduledUntil?.message}
                  </FieldError>
                </div>
              </div>
            )}
            {statusValue !== "DRAFT" && (
              <p
                id="banner-scheduled-until-hint"
                className="text-xs text-muted-foreground"
              >
                {f.scheduledUntilHint}
              </p>
            )}
          </FormSectionCard>
        </div>

        <aside
          data-testid="banner-form-preview-panel"
          className={cn(
            "mt-4 md:sticky md:top-4 md:mt-0",
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

      {/* ONE «Зберегти», sticky at every width and outside both toggleable
          panels — reachable from the preview tab on a phone too. */}
      <FormActionsBar
        variant="sticky"
        dirtySections={dirtySections}
        summary={summary}
        onDiscard={() => {
          reset();
          setCustomTheme(false);
        }}
        saveLabel={isPending ? dict.common.saving : submitLabel}
        formId={FORM_ID}
        isSaving={isPending}
      />
    </form>
  );
}

/** The little page with the slot highlighted — the card's picture (БН5). */
function PlacementSchema({ placement }: { placement: BannerPlacementValue }) {
  return (
    <span className="relative block h-7.5 w-11 overflow-hidden rounded-sm border border-border bg-background">
      <span
        className={cn(
          "absolute rounded-xs bg-primary/55",
          PLACEMENT_SCHEMA[placement],
        )}
      />
    </span>
  );
}

/** A label with a «28 / 60» counter on its right, wrapping one control. */
function CountedField({
  id,
  label,
  required = false,
  count,
  comfort,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  count: number;
  comfort: number;
  children: (counterId: string) => React.ReactNode;
}) {
  const counterId = useId();
  const over = count > comfort;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
        <span
          id={counterId}
          className={cn(
            "text-xs tabular-nums",
            over ? "font-medium text-warning" : "text-muted-foreground",
          )}
        >
          <span>{f.counter(count, comfort)}</span>
          {over ? <span className="sr-only">. {f.counterOver}</span> : null}
        </span>
      </div>
      {children(counterId)}
    </div>
  );
}
