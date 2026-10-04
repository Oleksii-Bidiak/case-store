"use client";

import { useEffect, type BaseSyntheticEvent, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Callout,
  FieldError,
  FormActionsBar,
  FormAlert,
  FormSectionNav,
  Input,
  Label,
  RichTextEditor,
  RichTextPreview,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SeoSnippetPreview,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  type FormSection,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { slugify } from "@/shared/lib/slug";
import {
  resolveSeoPreviewTitle,
  resolveSeoPreviewDescription,
  resolveEffectiveTitleTemplate,
  resolvePreviewSiteName,
} from "@/shared/lib/seo";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { MediaPickerEditorButton } from "@/features/media-picker";
import {
  dict,
  HUB_PAGES,
  pagePreviewPath,
  STOREFRONT_HOST,
} from "@/shared/config";
import { isInlinedOnInfoHub } from "@/shared/config/hub-pages";
import {
  MAX_PAGE_CONTENT_LENGTH,
  PAGE_KIND,
  pageSchema,
  type PageFormInput,
  type PageFormValues,
  type PageKindValue,
} from "../model/page-schema";

const f = dict.pageForm;
const FORM_ID = "page-form";

/** Section anchors of the form's index (FormSectionNav). */
export const PAGE_SECTION_IDS = {
  main: "page-section-main",
  content: "page-section-content",
  seo: "page-section-seo",
  publish: "page-section-publish",
} as const;

type FieldName = keyof PageFormInput;

/** Which fields belong to which section — drives the dirty / error dots. */
const MAIN_FIELDS: readonly FieldName[] = ["title", "kind", "slug"];
const CONTENT_FIELDS: readonly FieldName[] = ["content", "excerpt"];
const SEO_FIELDS: readonly FieldName[] = [
  "metaTitle",
  "metaDescription",
  "keywords",
  "ogImage",
];
const PUBLISH_FIELDS: readonly FieldName[] = ["status", "scheduledAt"];

/** Fields in form order — the order the error summary names them in. */
const FIELD_ORDER: readonly FieldName[] = [
  ...MAIN_FIELDS,
  ...CONTENT_FIELDS,
  ...SEO_FIELDS,
  ...PUBLISH_FIELDS,
];

const KIND_LABELS: Record<PageKindValue, string> = {
  LEGAL: f.kindLegal,
  INFO: f.kindInfo,
  HUB: f.kindHub,
};

const STATUS_OPTIONS = [
  { value: "PUBLISHED", label: f.statusPublished },
  { value: "DRAFT", label: f.statusDraft },
  { value: "SCHEDULED", label: f.statusScheduled },
] as const;

const nf = (value: number) => value.toLocaleString("uk-UA");

/** «A» · «A» і «B» · «A», «B» і «C». */
function joinQuoted(labels: readonly string[]): string {
  const quoted = labels.map((label) => `«${label}»`);
  if (quoted.length < 2) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} і ${quoted.at(-1)}`;
}

interface PageFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different page,
   *  never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<PageFormInput>;
  /**
   * The form's one «Зберегти». May return a promise: resolving to `true`
   * means it saved and the form takes the submitted values as its baseline.
   */
  onSubmit: (
    values: PageFormValues,
    event?: BaseSyntheticEvent,
  ) => void | Promise<boolean | void>;
  isPending: boolean;
  submitLabel?: string;
  /** No `pages:write`: every field disabled, no save bar (wave 191 canon). */
  readOnly?: boolean;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: PageFormInput = {
  title: "",
  slug: "",
  content: "",
  excerpt: "",
  metaTitle: "",
  metaDescription: "",
  keywords: "",
  ogImage: "",
  // No `sortOrder` (TASK-428): the order is set by dragging rows in the list,
  // and omitting it from the payload makes the server append a new page.
  status: "DRAFT",
  // LEGAL matches the API's own default.
  kind: "LEGAL",
  scheduledAt: "",
};

const errorId = (field: string) => `page-${field}-error`;

/**
 * Create/edit page form — sectioned since wave 198 (PagesProposal СР8–СР12):
 * an index on the left, «Основне · Вміст · SEO і соцмережі · Публікація», and
 * ONE sticky «Зберегти» that names what is unsaved (канон 1.5).
 *
 * The slug auto-fills from the title while the address is still untouched;
 * once the admin edits it, typing in the title no longer overwrites it.
 */
export function PageForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
  readOnly = false,
}: PageFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, dirtyFields, submitCount },
  } = useForm<PageFormInput, unknown, PageFormValues>({
    resolver: zodResolver(pageSchema),
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

  const titleValue = useWatch({ control, name: "title" }) ?? "";
  const slugValue = useWatch({ control, name: "slug" }) ?? "";
  const statusValue = useWatch({ control, name: "status" });
  const kindValue = useWatch({ control, name: "kind" }) ?? "LEGAL";
  const isHub = kindValue === "HUB";

  // Live SERP preview (TASK-268) through the storefront's three-tier
  // precedence. A HUB row resolves differently (`buildHubMetadata`): only the
  // excerpt can derive a description, and the store-wide defaults are blanked.
  const excerptValue = useWatch({ control, name: "excerpt" }) ?? "";
  const contentValue = useWatch({ control, name: "content" }) ?? "";
  const metaTitleValue = useWatch({ control, name: "metaTitle" }) ?? "";
  const metaDescriptionValue =
    useWatch({ control, name: "metaDescription" }) ?? "";
  const seoSettings = useSeoSettingsControllerGetSettings().data?.data;
  const previewTitle = resolveSeoPreviewTitle({
    entityTitle: metaTitleValue,
    defaultTitle: isHub ? undefined : seoSettings?.defaultMetaTitle,
    contentName: titleValue,
    titleTemplate: resolveEffectiveTitleTemplate(
      seoSettings?.titleTemplate,
      resolvePreviewSiteName(seoSettings),
    ),
  });
  const previewDescription = resolveSeoPreviewDescription({
    entityDescription: metaDescriptionValue,
    defaultDescription: isHub ? undefined : seoSettings?.defaultMetaDescription,
    contentDescription: isHub ? excerptValue : excerptValue || contentValue,
  });
  const previewSlug =
    slugValue || (titleValue.trim() ? slugify(titleValue) : "");
  // TASK-435 — the green breadcrumb follows the KIND.
  const previewPath = pagePreviewPath(kindValue, previewSlug);
  const previewUrl = previewPath
    ? `${STOREFRONT_HOST}${previewPath.split("/").join(" › ")}`
    : STOREFRONT_HOST;

  // TASK-565 — a row /info renders inline: warn by the SAVED slug too, so the
  // warning does not vanish at the very moment the address is being changed.
  const inlined =
    isInlinedOnInfoHub(kindValue, slugValue) ||
    isInlinedOnInfoHub(kindValue, defaultValues?.slug ?? "");

  // TASK-1154 — counted as the API counts it: the stored HTML.
  const contentLength = contentValue.length;
  const contentOver = contentLength - MAX_PAGE_CONTENT_LENGTH;

  const dirtyIn = (fields: readonly FieldName[]) =>
    fields.some((field) => dirtyFields[field]);
  const errorIn = (fields: readonly FieldName[]) =>
    fields.some((field) => errors[field]);

  const sections = [
    { id: PAGE_SECTION_IDS.main, label: f.sectionMain, fields: MAIN_FIELDS },
    {
      id: PAGE_SECTION_IDS.content,
      label: f.sectionContent,
      fields: CONTENT_FIELDS,
    },
    { id: PAGE_SECTION_IDS.seo, label: f.sectionSeo, fields: SEO_FIELDS },
    {
      id: PAGE_SECTION_IDS.publish,
      label: f.sectionPublish,
      fields: PUBLISH_FIELDS,
    },
  ].map((section) => ({
    ...section,
    dirty: dirtyIn(section.fields),
    error: errorIn(section.fields),
  }));

  const navSections: FormSection[] = sections.map((section) => ({
    id: section.id,
    label: section.label,
    ...(section.error
      ? { status: "warning" as const, statusLabel: f.sectionError }
      : section.dirty
        ? { status: "primary" as const, statusLabel: f.sectionDirty }
        : {}),
  }));
  const dirtySections = sections
    .filter((section) => section.dirty)
    .map((section) => section.label);

  const fieldLabel = (field: FieldName): string => {
    switch (field) {
      case "title":
        return f.title;
      case "kind":
        return f.kind;
      case "slug":
        return isHub ? f.hubSlug : f.address;
      case "content":
        return f.content;
      case "excerpt":
        return f.excerpt;
      case "metaTitle":
        return f.metaTitle;
      case "metaDescription":
        return f.metaDescription;
      case "keywords":
        return f.keywords;
      case "ogImage":
        return dict.seoFields.ogImage;
      case "status":
        return f.status;
      case "scheduledAt":
        return f.scheduledAt;
    }
  };
  const failedFields = FIELD_ORDER.filter((field) => errors[field]);
  const showErrors = submitCount > 0 && failedFields.length > 0;

  const submit = async (values: PageFormValues, event?: BaseSyntheticEvent) => {
    const saved = await onSubmit(values, event);
    if (saved === true) reset(getValues());
  };

  const fieldA11y = (field: FieldName, hintId?: string) => {
    const describedBy = [hintId, errors[field] ? errorId(field) : undefined]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };

  const statusHint = inlined
    ? f.statusHintInlined(titleValue || (defaultValues?.title ?? ""))
    : statusValue === "DRAFT"
      ? f.statusHintDraft
      : f.statusHint;

  return (
    <form
      id={FORM_ID}
      onSubmit={handleSubmit(submit)}
      className="flex flex-col gap-6"
      noValidate
    >
      {readOnly ? (
        <Callout variant="strip">{dict.common.viewOnly}</Callout>
      ) : null}
      {showErrors ? (
        <FormAlert>
          {dict.pages.formErrorsAlert(
            failedFields.length,
            joinQuoted(failedFields.map(fieldLabel)),
          )}
        </FormAlert>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <FormSectionNav
          sections={navSections}
          aria-label={f.sectionsAria}
          className="md:w-42 md:shrink-0"
        />

        <fieldset
          disabled={readOnly}
          className="flex max-w-3xl min-w-0 flex-1 flex-col gap-4"
        >
          <FormCard id={PAGE_SECTION_IDS.main} title={f.sectionMain}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="page-title" required>
                  {f.title}
                </Label>
                <Input
                  id="page-title"
                  aria-required="true"
                  {...fieldA11y("title")}
                  {...register("title")}
                />
                <FieldError id={errorId("title")}>
                  {errors.title?.message}
                </FieldError>
              </div>

              {/* TASK-435 — what this row IS decides where it lives. */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="page-kind">{f.kind}</Label>
                <Controller
                  control={control}
                  name="kind"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        // Radix's hidden native select can bounce "" back
                        // on a reset before options mount (TASK-201): a real
                        // pick is never "".
                        if (value === "") return;
                        field.onChange(value);
                      }}
                      disabled={readOnly}
                    >
                      <SelectTrigger
                        id="page-kind"
                        className="w-full"
                        aria-describedby="page-kind-hint"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_KIND.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {KIND_LABELS[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <p
                id="page-kind-hint"
                className="text-xs text-muted-foreground md:col-span-2"
              >
                {f.kindHint}
              </p>
            </div>

            {/* A hub's address names a section the storefront already has, so
                the free-text address becomes a picker (the API rejects any
                other slug with a 400). */}
            {isHub ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="page-hub-slug">{f.hubSlug}</Label>
                <Controller
                  control={control}
                  name="slug"
                  render={({ field }) => (
                    <Select
                      // Always controlled — see the blog post form (`?? ""`).
                      value={field.value ?? ""}
                      onValueChange={(value) => {
                        if (value === "") return;
                        field.onChange(value);
                      }}
                      disabled={readOnly}
                    >
                      <SelectTrigger
                        id="page-hub-slug"
                        className="w-full md:w-80"
                        {...fieldA11y("slug", "page-hub-slug-hint")}
                      >
                        <SelectValue placeholder={f.hubSlugPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {HUB_PAGES.map((hub) => (
                          <SelectItem key={hub.slug} value={hub.slug}>
                            {hub.route}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p
                  id="page-hub-slug-hint"
                  className="text-xs text-muted-foreground"
                >
                  {f.hubSlugHint}
                </p>
                <FieldError id={errorId("slug")}>
                  {errors.slug?.message}
                </FieldError>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="page-slug">{f.address}</Label>
                <div className="flex">
                  <span
                    id="page-slug-prefix"
                    className="inline-flex shrink-0 items-center rounded-l-md border border-r-0 bg-muted px-3 font-mono text-sm text-muted-foreground"
                  >
                    {kindValue === "INFO" ? "/info/" : "/legal/"}
                  </span>
                  <Input
                    id="page-slug"
                    placeholder={f.addressPlaceholder}
                    className="rounded-l-none font-mono"
                    {...fieldA11y(
                      "slug",
                      inlined
                        ? "page-slug-prefix page-inlined-warning"
                        : "page-slug-prefix page-slug-hint",
                    )}
                    {...register("slug")}
                  />
                </div>
                {!slugValue && titleValue.trim().length > 0 && (
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="slug-preview"
                  >
                    {f.slugPreview(slugify(titleValue))}
                  </p>
                )}
                <FieldError id={errorId("slug")}>
                  {errors.slug?.message}
                </FieldError>
                {inlined ? (
                  <Callout variant="warning" id="page-inlined-warning">
                    {dict.pages.inlinedOnInfoHint}
                  </Callout>
                ) : (
                  <p
                    id="page-slug-hint"
                    className="text-xs text-muted-foreground"
                  >
                    {f.addressHint}
                  </p>
                )}
              </div>
            )}
          </FormCard>

          <FormCard id={PAGE_SECTION_IDS.content} title={f.sectionContent}>
            <div className="flex flex-col gap-1.5">
              {/* Edit/preview tab pair (TASK-266). Radix TabsContent unmounts
                  the inactive panel, which is safe: the editor is fully
                  controlled by the RHF field. Read-only opens on the preview —
                  a disabled editor is a worse way to read a page. */}
              <Tabs defaultValue={readOnly ? "preview" : "edit"}>
                <TabsList>
                  <TabsTrigger value="edit">
                    {dict.contentPreview.tabEdit}
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    {dict.contentPreview.tabPreview}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="edit">
                  <Controller
                    control={control}
                    name="content"
                    render={({ field }) => (
                      <RichTextEditor
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        resetKey={id}
                        placeholder={f.contentPlaceholder}
                        disabled={isPending || readOnly}
                        // TASK-547 — the editor lives in `shared/ui` and cannot
                        // reach the media library itself.
                        imagePicker={(insert) => (
                          <MediaPickerEditorButton insert={insert} />
                        )}
                      />
                    )}
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <RichTextPreview
                    html={contentValue}
                    emptyLabel={dict.contentPreview.emptyContent}
                  />
                </TabsContent>
              </Tabs>
              {/* TASK-1154 — the counter the editor itself does not have. */}
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="text-destructive">
                  {contentOver > 0 ? f.contentOver(nf(contentOver)) : null}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    contentOver > 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {f.contentCounter(
                    nf(contentLength),
                    nf(MAX_PAGE_CONTENT_LENGTH),
                  )}
                </span>
              </div>
              {/* A hub row's body is never rendered on the storefront. */}
              {isHub && (
                <p className="text-xs text-muted-foreground">
                  {f.hubContentHint}
                </p>
              )}
              <FieldError id={errorId("content")}>
                {errors.content?.message}
              </FieldError>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="page-excerpt">{f.excerpt}</Label>
              <Textarea
                id="page-excerpt"
                rows={2}
                placeholder={f.excerptPlaceholder}
                {...fieldA11y("excerpt")}
                {...register("excerpt")}
              />
              <FieldError id={errorId("excerpt")}>
                {errors.excerpt?.message}
              </FieldError>
            </div>
          </FormCard>

          <FormCard id={PAGE_SECTION_IDS.seo} title={f.sectionSeo}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="page-meta-title">{f.metaTitle}</Label>
              <Input
                id="page-meta-title"
                {...fieldA11y("metaTitle")}
                {...register("metaTitle")}
              />
              <FieldError id={errorId("metaTitle")}>
                {errors.metaTitle?.message}
              </FieldError>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="page-meta-description">{f.metaDescription}</Label>
              <Textarea
                id="page-meta-description"
                rows={2}
                {...fieldA11y("metaDescription")}
                {...register("metaDescription")}
              />
              <FieldError id={errorId("metaDescription")}>
                {errors.metaDescription?.message}
              </FieldError>
            </div>

            <SeoSnippetPreview
              title={previewTitle.text}
              titleTier={previewTitle.tier}
              description={previewDescription.text || undefined}
              descriptionTier={previewDescription.tier}
              url={previewUrl}
              rawTitleLength={metaTitleValue.trim().length}
              rawDescriptionLength={metaDescriptionValue.trim().length}
            />

            {/* TASK-437 tags + TASK-1117 — the hint no longer promises search:
                nothing reads a page's tags yet. */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="page-keywords">{f.keywords}</Label>
              <Input
                id="page-keywords"
                placeholder={dict.seoFields.keywordsPlaceholder}
                {...fieldA11y("keywords", "page-keywords-hint")}
                {...register("keywords")}
              />
              <p
                id="page-keywords-hint"
                className="text-xs text-muted-foreground"
              >
                {f.keywordsHint}
              </p>
              <FieldError id={errorId("keywords")}>
                {errors.keywords?.message}
              </FieldError>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="page-og-image">{dict.seoFields.ogImage}</Label>
              <Input
                id="page-og-image"
                placeholder={dict.seoFields.ogImagePlaceholder(STOREFRONT_HOST)}
                {...fieldA11y("ogImage", "page-og-image-hint")}
                {...register("ogImage")}
              />
              <p
                id="page-og-image-hint"
                className="text-xs text-muted-foreground"
              >
                {dict.seoFields.ogImageHint}
              </p>
              <FieldError id={errorId("ogImage")}>
                {errors.ogImage?.message}
              </FieldError>
            </div>
          </FormCard>

          <FormCard id={PAGE_SECTION_IDS.publish} title={f.sectionPublish}>
            {/* «Статус — перемикач» (СР8): three segments, native radios, so
                arrows move between them and a screen reader hears «1 з 3». */}
            <div
              role="radiogroup"
              aria-label={f.statusAria}
              aria-describedby="page-status-hint"
              className="flex w-full rounded-md border p-0.5 md:w-fit"
            >
              {STATUS_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded-sm px-4 text-sm font-medium whitespace-nowrap text-foreground has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-70 md:flex-none"
                >
                  <input
                    type="radio"
                    value={option.value}
                    className="sr-only"
                    {...register("status")}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p
              id="page-status-hint"
              className={cn(
                "text-xs",
                inlined ? "text-warning" : "text-muted-foreground",
              )}
            >
              {statusHint}
            </p>

            {statusValue === "SCHEDULED" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="page-scheduled-at">{f.scheduledAt}</Label>
                <Input
                  id="page-scheduled-at"
                  type="datetime-local"
                  className="md:w-64"
                  {...fieldA11y("scheduledAt", "page-scheduled-at-hint")}
                  {...register("scheduledAt")}
                />
                <p
                  id="page-scheduled-at-hint"
                  className="text-xs text-muted-foreground"
                >
                  {f.scheduledAtHint}
                </p>
                <FieldError id={errorId("scheduledAt")}>
                  {errors.scheduledAt?.message}
                </FieldError>
              </div>
            )}
          </FormCard>
        </fieldset>
      </div>

      {readOnly ? null : (
        <FormActionsBar
          variant="sticky"
          formId={FORM_ID}
          dirtySections={dirtySections}
          summary={
            showErrors
              ? dict.pages.formErrorsBar(failedFields.length)
              : !id
                ? dict.pages.newUnsaved
                : undefined
          }
          onDiscard={() => reset()}
          saveLabel={isPending ? dict.common.saving : submitLabel}
          isSaving={isPending}
        />
      )}
    </form>
  );
}

/** One section card of the form, titled, with its index anchor. */
function FormCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="flex scroll-mt-4 flex-col gap-4 rounded-lg border bg-card p-4 shadow-card"
    >
      <h3 id={headingId} className="text-sm font-semibold text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
