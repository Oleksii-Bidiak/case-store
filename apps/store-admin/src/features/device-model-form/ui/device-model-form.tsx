"use client";

import {
  useEffect,
  useId,
  useMemo,
  type FormEvent,
  type ReactNode,
} from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLinkIcon } from "lucide-react";
import {
  useAdminDeviceControllerFindBrands,
  type CompatLandingPageEntity,
} from "@/entities/device";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { slugify } from "@/shared/lib";
import {
  resolveEffectiveTitleTemplate,
  resolvePreviewSiteName,
  resolveSeoPreviewDescription,
  resolveSeoPreviewTitle,
} from "@/shared/lib/seo";
import { cn } from "@/shared/lib/utils";
import {
  Callout,
  FieldError,
  FormActionsBar,
  FormAlert,
  Input,
  Label,
  SeoSnippetPreview,
  Switch,
  Textarea,
  TreeCombobox,
  type TreeComboboxItem,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { dict, STOREFRONT_HOST, STOREFRONT_URL } from "@/shared/config";
import {
  deviceModelSchema,
  type DeviceModelFormInput,
  type DeviceModelFormValues,
} from "../model/device-model-schema";

const f = dict.deviceModelForm;
const FORM_ID = "device-model-form";

/**
 * What the slot shows comfortably — the counters' second number. NOT the API
 * limit (255 / 500 / 2000): a longer text still saves, the counter only turns
 * amber (the banner form's rule).
 */
const TITLE_COMFORT = 60;
const DESCRIPTION_COMFORT = 160;
const LEAD_COMFORT = 1000;

interface DeviceModelFormProps {
  id?: string;
  defaultValues?: Partial<DeviceModelFormInput>;
  onSubmit: (values: DeviceModelFormValues) => void;
  isPending: boolean;
  /** The sticky bar's primary button: «Зберегти» / «Створити модель». */
  submitLabel?: string;
  /** View-only (TASK-667 template): the values as text, no save bar. */
  readOnly?: boolean;
  /**
   * The live compatibility pages of this model (`useLiveCompatPages`), or
   * `undefined` while unknown. A new model has none.
   */
  livePages?: readonly CompatLandingPageEntity[];
  /** The side panel (ПР7). */
  aside?: ReactNode;
  /** Extra controls in the sticky bar before the save (create: «Скасувати»). */
  barActions?: ReactNode;
}

const EMPTY_VALUES: DeviceModelFormInput = {
  deviceBrandId: "",
  name: "",
  slug: "",
  series: "",
  releaseYear: "",
  isActive: true,
  metaTitle: "",
  metaDescription: "",
  description: "",
};

type FieldName = keyof DeviceModelFormInput;

const SECTIONS: readonly { label: string; fields: readonly FieldName[] }[] = [
  {
    label: f.sectionMain,
    fields: ["deviceBrandId", "name", "series", "releaseYear", "slug"],
  },
  {
    label: f.seoHeading,
    fields: ["metaTitle", "metaDescription", "description"],
  },
  { label: f.active, fields: ["isActive"] },
];

const ERROR_FIELDS: readonly FieldName[] = [
  "deviceBrandId",
  "name",
  "series",
  "releaseYear",
  "slug",
  "metaTitle",
  "metaDescription",
  "description",
];

const errorId = (field: FieldName) => `device-model-${field}-error`;

/**
 * Create/edit form for a device model (TASK-190; wave 198, DevicesProposal
 * ПР7–ПР11, TASK-1082): «Основне · Сторінки сумісності на сайті · Показувати
 * на сайті» as section cards, the side panel beside them, ONE sticky
 * «Зберегти» that names what is unsaved, errors under the fields with
 * `aria-invalid` and a summary over the form after a failed submit.
 *
 * The brand is a combobox you can type into (TASK-423), full width; the year
 * is a short field. «Сторінки сумісності на сайті» lists the pages that open
 * right now (`GET /catalog/compat-pages`) and holds the three texts with
 * counters and the Google snippet.
 */
export function DeviceModelForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
  readOnly = false,
  livePages,
  aside,
  barActions,
}: DeviceModelFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields, submitCount },
  } = useForm<DeviceModelFormInput, unknown, DeviceModelFormValues>({
    resolver: zodResolver(deviceModelSchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md Rule 2b: re-seed only when navigating to a different entity.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const brandsQuery = useAdminDeviceControllerFindBrands();
  const brandItems = useMemo<TreeComboboxItem[]>(
    () =>
      (brandsQuery.data?.data ?? []).map((brand) => ({
        value: brand.id,
        label: brand.name,
        depth: 0,
      })),
    [brandsQuery.data],
  );

  const values = useWatch({ control });
  const nameValue = values.name ?? "";
  const slugValue = values.slug ?? "";
  const metaTitleValue = values.metaTitle ?? "";
  const metaDescriptionValue = values.metaDescription ?? "";
  const descriptionValue = values.description ?? "";
  const effectiveSlug = slugValue.trim() || slugify(nameValue);

  const seoSettings = useSeoSettingsControllerGetSettings().data?.data;
  const previewTitle = resolveSeoPreviewTitle({
    entityTitle: metaTitleValue,
    defaultTitle: seoSettings?.defaultMetaTitle,
    contentName: nameValue.trim() ? f.snippetTitle(nameValue.trim()) : "",
    titleTemplate: resolveEffectiveTitleTemplate(
      seoSettings?.titleTemplate,
      resolvePreviewSiteName(seoSettings),
    ),
  });
  const previewDescription = resolveSeoPreviewDescription({
    entityDescription: metaDescriptionValue,
    defaultDescription: seoSettings?.defaultMetaDescription,
    contentDescription: descriptionValue,
  });

  const errorCount = ERROR_FIELDS.filter((field) => errors[field]).length;
  const showErrors = submitCount > 0 && errorCount > 0;
  const dirtySections = SECTIONS.filter((section) =>
    section.fields.some((field) => dirtyFields[field]),
  ).map((section) => section.label);

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (event.target !== event.currentTarget) return;
    void handleSubmit(onSubmit)(event);
  };

  const fieldA11y = (field: FieldName, ...hintIds: (string | undefined)[]) => {
    const describedBy = [errors[field] ? errorId(field) : undefined, ...hintIds]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };

  const brandName =
    brandItems.find((item) => item.value === values.deviceBrandId)?.label ?? "";

  return (
    <form
      id={FORM_ID}
      onSubmit={onFormSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      {readOnly ? (
        <Callout variant="strip">{dict.common.viewOnly}</Callout>
      ) : null}
      {showErrors ? <FormAlert>{f.errorSummary(errorCount)}</FormAlert> : null}

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <FormSectionCard title={f.sectionMain}>
            {readOnly ? (
              <>
                <ReadOnlyValue label={f.brand} required>
                  {brandName}
                </ReadOnlyValue>
                <ReadOnlyValue label={f.name} required>
                  {nameValue}
                </ReadOnlyValue>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ReadOnlyValue label={f.series}>
                    {values.series}
                  </ReadOnlyValue>
                  <ReadOnlyValue label={f.releaseYear}>
                    {values.releaseYear}
                  </ReadOnlyValue>
                </div>
                <ReadOnlyValue label={f.slug} mono>
                  {slugValue}
                </ReadOnlyValue>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="device-model-brand" required>
                    {f.brand}
                  </Label>
                  <Controller
                    control={control}
                    name="deviceBrandId"
                    render={({ field }) => (
                      <TreeCombobox
                        id="device-model-brand"
                        items={brandItems}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder={
                          brandsQuery.isLoading
                            ? f.loading
                            : f.brandSearchPlaceholder
                        }
                        emptyText={f.nothingFound}
                        isLoading={brandsQuery.isLoading}
                        aria-invalid={errors.deviceBrandId ? true : undefined}
                        aria-describedby={
                          errors.deviceBrandId
                            ? errorId("deviceBrandId")
                            : undefined
                        }
                      />
                    )}
                  />
                  <FieldError id={errorId("deviceBrandId")}>
                    {errors.deviceBrandId?.message}
                  </FieldError>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="device-model-name" required>
                    {f.name}
                  </Label>
                  <Input
                    id="device-model-name"
                    aria-required="true"
                    {...fieldA11y("name")}
                    {...register("name")}
                  />
                  <FieldError id={errorId("name")}>
                    {errors.name?.message}
                  </FieldError>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Label htmlFor="device-model-series">{f.series}</Label>
                    <Input
                      id="device-model-series"
                      placeholder={f.seriesPlaceholder}
                      {...fieldA11y("series", "device-model-series-hint")}
                      {...register("series")}
                    />
                    <p
                      id="device-model-series-hint"
                      className="text-xs text-muted-foreground"
                    >
                      {f.seriesHint}
                    </p>
                    <FieldError id={errorId("series")}>
                      {errors.series?.message}
                    </FieldError>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="device-model-year">{f.releaseYear}</Label>
                    <Input
                      id="device-model-year"
                      type="number"
                      inputMode="numeric"
                      min="1990"
                      max="2100"
                      step="1"
                      className="sm:w-36"
                      {...fieldA11y("releaseYear", "device-model-year-hint")}
                      {...register("releaseYear")}
                    />
                    <p
                      id="device-model-year-hint"
                      className="text-xs text-muted-foreground sm:max-w-48"
                    >
                      {f.yearHint}
                    </p>
                    <FieldError id={errorId("releaseYear")}>
                      {errors.releaseYear?.message}
                    </FieldError>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="device-model-slug">{f.slug}</Label>
                  <Input
                    id="device-model-slug"
                    placeholder={f.slugPlaceholder}
                    {...fieldA11y("slug", "device-model-slug-hint")}
                    {...register("slug")}
                  />
                  <FieldError id={errorId("slug")}>
                    {errors.slug?.message}
                  </FieldError>
                  <p
                    id="device-model-slug-hint"
                    className="text-xs text-muted-foreground"
                  >
                    {effectiveSlug ? f.slugHint(effectiveSlug) : f.slugPreview}
                  </p>
                </div>
              </>
            )}
          </FormSectionCard>

          {/* TASK-490 — the copy of `/catalog/<категорія>/<модель>`: the only
              fields here that describe the storefront PAGES, not the device. */}
          <FormSectionCard title={f.seoHeading} description={f.seoHint}>
            <LivePagesList pages={livePages} />

            {readOnly ? (
              <>
                <ReadOnlyValue label={f.metaTitle}>
                  {metaTitleValue}
                </ReadOnlyValue>
                <ReadOnlyValue label={f.metaDescription}>
                  {metaDescriptionValue}
                </ReadOnlyValue>
                <ReadOnlyValue label={f.description}>
                  {descriptionValue}
                </ReadOnlyValue>
              </>
            ) : (
              <>
                <CountedField
                  id="device-model-meta-title"
                  label={f.metaTitle}
                  hint={f.metaTitleHint}
                  count={metaTitleValue.trim().length}
                  comfort={TITLE_COMFORT}
                  error={
                    <FieldError id={errorId("metaTitle")}>
                      {errors.metaTitle?.message}
                    </FieldError>
                  }
                >
                  {(describedBy) => (
                    <Input
                      id="device-model-meta-title"
                      placeholder={f.metaTitlePlaceholder}
                      {...fieldA11y("metaTitle", describedBy)}
                      {...register("metaTitle")}
                    />
                  )}
                </CountedField>

                <CountedField
                  id="device-model-meta-description"
                  label={f.metaDescription}
                  hint={f.metaDescriptionHint}
                  count={metaDescriptionValue.trim().length}
                  comfort={DESCRIPTION_COMFORT}
                  error={
                    <FieldError id={errorId("metaDescription")}>
                      {errors.metaDescription?.message}
                    </FieldError>
                  }
                >
                  {(describedBy) => (
                    <Textarea
                      id="device-model-meta-description"
                      rows={2}
                      placeholder={f.metaDescriptionPlaceholder}
                      {...fieldA11y("metaDescription", describedBy)}
                      {...register("metaDescription")}
                    />
                  )}
                </CountedField>

                <CountedField
                  id="device-model-description"
                  label={f.description}
                  hint={f.descriptionHint}
                  count={descriptionValue.trim().length}
                  comfort={LEAD_COMFORT}
                  error={
                    <FieldError id={errorId("description")}>
                      {errors.description?.message}
                    </FieldError>
                  }
                >
                  {(describedBy) => (
                    <Textarea
                      id="device-model-description"
                      rows={3}
                      placeholder={f.descriptionPlaceholder}
                      {...fieldA11y("description", describedBy)}
                      {...register("description")}
                    />
                  )}
                </CountedField>
              </>
            )}

            <SeoSnippetPreview
              title={previewTitle.text}
              titleTier={previewTitle.tier}
              description={previewDescription.text || undefined}
              descriptionTier={previewDescription.tier}
              url={`${STOREFRONT_HOST} › catalog › … › ${effectiveSlug || "…"}`}
              rawTitleLength={metaTitleValue.trim().length}
              rawDescriptionLength={metaDescriptionValue.trim().length}
            />
          </FormSectionCard>

          <section className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4 shadow-card">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label
                htmlFor="device-model-active"
                className="text-sm font-semibold"
              >
                {f.active}
              </Label>
              <p
                id="device-model-active-hint"
                className="text-xs text-muted-foreground"
              >
                {f.activeHint}
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch
                  id="device-model-active"
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                  disabled={readOnly}
                  aria-describedby="device-model-active-hint"
                />
              )}
            />
          </section>
        </div>

        {aside ? (
          <aside className="flex min-w-0 flex-col gap-4">{aside}</aside>
        ) : null}
      </div>

      {readOnly ? null : (
        <FormActionsBar
          variant="sticky"
          dirtySections={dirtySections}
          onDiscard={id ? () => reset() : undefined}
          saveLabel={isPending ? dict.common.saving : submitLabel}
          formId={FORM_ID}
          isSaving={isPending}
        >
          {barActions}
        </FormActionsBar>
      )}
    </form>
  );
}

/** The pages that open right now, each a link to the storefront (ПР7). */
function LivePagesList({
  pages,
}: {
  pages: readonly CompatLandingPageEntity[] | undefined;
}) {
  if (pages === undefined) return null;
  if (pages.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
        {f.pagesEmpty}
      </p>
    );
  }
  return (
    <ul
      aria-label={f.pagesListAria}
      className="flex flex-col divide-y rounded-md border"
    >
      {pages.map((page) => {
        const title = f.pageTitle(page.categoryName, page.deviceName);
        return (
          <li key={page.categoryId}>
            <a
              href={`${STOREFRONT_URL}/catalog/${encodeURIComponent(page.categorySlug)}/${encodeURIComponent(page.deviceSlug)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={f.pageOpenAria(title)}
              className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9"
            >
              <span className="min-w-0 truncate text-primary">{title}</span>
              <span className="flex shrink-0 items-center gap-2 text-muted-foreground tabular-nums">
                {f.pageProducts(page.productCount)}
                <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** A label, the control, a hint with a «28 / 60» counter, and the error. */
function CountedField({
  id,
  label,
  hint,
  count,
  comfort,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  count: number;
  comfort: number;
  error: ReactNode;
  children: (describedBy: string) => ReactNode;
}) {
  const hintId = useId();
  const over = count > comfort;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(hintId)}
      {error}
      <p
        id={hintId}
        className="flex items-start justify-between gap-3 text-xs text-muted-foreground"
      >
        <span>{hint}</span>
        <span
          className={cn(
            "shrink-0 tabular-nums",
            over && "font-medium text-warning",
          )}
        >
          {f.counter(count, comfort)}
          {over ? <span className="sr-only">. {f.counterOver}</span> : null}
        </span>
      </p>
    </div>
  );
}

/** A field in view-only mode: its label and the value as plain text. */
function ReadOnlyValue({
  label,
  required = false,
  mono = false,
  children,
}: {
  label: string;
  required?: boolean;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            {" *"}
          </span>
        ) : null}
      </p>
      <p
        className={
          mono
            ? "font-mono text-sm break-all text-muted-foreground"
            : "text-sm break-words whitespace-pre-line text-foreground"
        }
      >
        {children || "—"}
      </p>
    </div>
  );
}
