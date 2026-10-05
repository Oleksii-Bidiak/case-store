"use client";

import { useEffect, type FormEvent, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { slugify } from "@/shared/lib";
import {
  Callout,
  FieldError,
  FormActionsBar,
  FormAlert,
  Input,
  Label,
  Switch,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import {
  ContentImageField,
  useImageUploadField,
  useUploadsControllerUploadBrandLogo,
} from "@/features/content-image-upload";
import { MediaPicker } from "@/features/media-picker";
import { dict, STOREFRONT_URL } from "@/shared/config";
import {
  brandSchema,
  type BrandFormInput,
  type BrandFormValues,
} from "../model/brand-schema";

const f = dict.brandForm;
const FORM_ID = "brand-form";

interface BrandFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different brand,
   *  never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<BrandFormInput>;
  onSubmit: (values: BrandFormValues) => void;
  isPending: boolean;
  /** The sticky bar's primary button: «Зберегти» / «Створити бренд». */
  submitLabel?: string;
  /**
   * View-only (TASK-667 template): the same sections, the values as text, no
   * uploader and no save bar. The edit page sets it from `brands:write`.
   */
  readOnly?: boolean;
  /** The side panel (БР5): products, «Змінено», «Технічне». */
  aside?: ReactNode;
  /** Extra controls in the sticky bar before the save (create: «Скасувати»). */
  barActions?: ReactNode;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: BrandFormInput = {
  name: "",
  slug: "",
  logo: "",
  isActive: true,
};

type FieldName = keyof BrandFormInput;

/** Section → its fields: drives «Незбережені зміни: …». */
const SECTIONS: readonly { label: string; fields: readonly FieldName[] }[] = [
  { label: f.sectionMain, fields: ["name", "slug"] },
  { label: f.sectionLogo, fields: ["logo"] },
  { label: f.active, fields: ["isActive"] },
];

const errorId = (field: FieldName) => `brand-${field}-error`;

/** The logo as the storefront will load it — see `logoSrc` in the list. */
function previewSrc(logo: string): string {
  if (!logo.startsWith("/") || logo.startsWith("//")) return logo;
  try {
    return new URL(logo, STOREFRONT_URL).toString();
  } catch {
    return logo;
  }
}

/**
 * Create/edit brand form (wave 198, BrandsProposal БР5–БР9, TASK-1078):
 * «Основне · Логотип · Показувати на сайті» as section cards, the side panel
 * beside them, ONE sticky «Зберегти» that names what is unsaved, errors under
 * the fields with `aria-invalid`, a summary over the form after a failed
 * submit. The logo field keeps all three ways in — a file, the media library
 * (now in the same row) and a link (now folded under «Або посилання на
 * зображення», whose label names the link box itself).
 *
 * The «Сторінка бренду на сайті» and «Пошук: інші написання» sections of the
 * artboard need API fields that do not exist yet (TASK-1080, TASK-1081).
 */
export function BrandForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
  readOnly = false,
  aside,
  barActions,
}: BrandFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, dirtyFields, submitCount },
  } = useForm<BrandFormInput, unknown, BrandFormValues>({
    resolver: zodResolver(brandSchema),
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

  // Live slug preview: when the slug field is blank, show what the backend would
  // auto-derive from the name (the `slugify` port mirrors the server's
  // `generateSlug`). Pure render-time computation — no state, no side effects.
  const nameValue = useWatch({ control, name: "name" }) ?? "";
  const slugValue = useWatch({ control, name: "slug" }) ?? "";
  const effectiveSlug = slugValue.trim() || slugify(nameValue);

  // TASK-424: the logo field takes a FILE as well as a pasted link. The uploaded
  // URL goes in through `setValue`, so the form remains the only source of truth
  // for the field (docs/conventions/forms.md).
  const logoValue = useWatch({ control, name: "logo" }) ?? "";
  const logoUpload = useImageUploadField({
    upload: useUploadsControllerUploadBrandLogo(),
    copy: f.logoUpload,
    onUploaded: (url) =>
      setValue("logo", url, { shouldDirty: true, shouldValidate: true }),
  });

  const errorCount = (["name", "slug", "logo"] as const).filter(
    (field) => errors[field],
  ).length;
  const showErrors = submitCount > 0 && errorCount > 0;
  const dirtySections = SECTIONS.filter((section) =>
    section.fields.some((field) => dirtyFields[field]),
  ).map((section) => section.label);

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    // A submit bubbling through a portal (the media picker's dialog) is not ours.
    if (event.target !== event.currentTarget) return;
    void handleSubmit(onSubmit)(event);
  };

  const fieldA11y = (field: FieldName, hintId?: string) => {
    const describedBy = [errors[field] ? errorId(field) : undefined, hintId]
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
                <ReadOnlyValue label={f.name} required>
                  {nameValue}
                </ReadOnlyValue>
                <ReadOnlyValue label={f.slug} mono>
                  {slugValue}
                </ReadOnlyValue>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="brand-name" required>
                    {f.name}
                  </Label>
                  <Input
                    id="brand-name"
                    placeholder={f.namePlaceholder}
                    aria-required="true"
                    {...fieldA11y("name")}
                    {...register("name")}
                  />
                  <FieldError id={errorId("name")}>
                    {errors.name?.message}
                  </FieldError>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="brand-slug">{f.slug}</Label>
                  <Input
                    id="brand-slug"
                    placeholder={f.slugPlaceholder}
                    {...fieldA11y(
                      "slug",
                      effectiveSlug ? "brand-slug-hint" : undefined,
                    )}
                    {...register("slug")}
                  />
                  <FieldError id={errorId("slug")}>
                    {errors.slug?.message}
                  </FieldError>
                  {!errors.slug && effectiveSlug ? (
                    <p
                      id="brand-slug-hint"
                      className="text-xs text-muted-foreground"
                      data-testid={slugValue ? undefined : "slug-preview"}
                    >
                      {slugValue
                        ? f.slugHint(slugValue)
                        : f.slugPreview(effectiveSlug)}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </FormSectionCard>

          <FormSectionCard title={f.sectionLogo}>
            {readOnly ? (
              <div className="flex items-center gap-4">
                <span className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 p-2">
                  {logoValue ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail off arbitrary upload hosts
                    <img
                      src={previewSrc(logoValue)}
                      alt={f.logoUpload.alt}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </span>
                <p className="text-xs text-muted-foreground">
                  {f.logoUpload.hint}
                </p>
              </div>
            ) : (
              <ContentImageField
                id="brand-logo"
                layout="inline"
                label={f.logo}
                urlPlaceholder={f.logoPlaceholder}
                copy={{
                  ...f.logoUpload,
                  hint: logoValue.trim() ? f.logoUpload.hint : f.logoHintNew,
                }}
                value={logoValue}
                urlInput={register("logo")}
                onRemove={() =>
                  setValue("logo", "", {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                fieldError={errors.logo?.message}
                // TASK-441 — a logo is the picture most likely to be in the
                // library already: brand filter, product cards, the strip.
                picker={
                  <MediaPicker
                    onPick={(asset) =>
                      setValue("logo", asset.url, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                }
                {...logoUpload}
              />
            )}
          </FormSectionCard>

          <section className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4 shadow-card">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label htmlFor="brand-active" className="text-sm font-semibold">
                {f.active}
              </Label>
              <p
                id="brand-active-hint"
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
                  id="brand-active"
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                  disabled={readOnly}
                  aria-describedby="brand-active-hint"
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

/** A field in view-only mode: its label and the value as plain text (БР9). */
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
            : "text-sm break-words text-foreground"
        }
      >
        {children || "—"}
      </p>
    </div>
  );
}
