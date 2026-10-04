"use client";

import { useEffect, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
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
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  type FormSection,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import {
  ContentImageField,
  useImageUploadField,
  useUploadsControllerUploadBlogCover,
} from "@/features/content-image-upload";
import { MediaPicker, MediaPickerEditorButton } from "@/features/media-picker";
import { useAdminBlogControllerFindCategories } from "@/entities/blog";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { slugify } from "@/shared/lib/slug";
import { countLabel } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  resolveEffectiveTitleTemplate,
  resolvePreviewSiteName,
  resolveSeoPreviewDescription,
  resolveSeoPreviewTitle,
} from "@/shared/lib/seo";
import { dict, STOREFRONT_HOST } from "@/shared/config";
import {
  blogPostSchema,
  type BlogPostFormInput,
  type BlogPostFormValues,
  type BlogPostStatus,
} from "../model/blog-post-schema";
import {
  BLOG_CONTENT_MAX_LENGTH,
  blogContentStats,
} from "../model/content-stats";

const f = dict.blogPostForm;
const FORM_ID = "blog-post-form";

/** Section anchors of the form's index (FormSectionNav). */
export const BLOG_POST_SECTION_IDS = {
  main: "post-section-main",
  content: "post-section-content",
  cover: "post-section-cover",
  show: "post-section-show",
  seo: "post-section-seo",
  publish: "post-section-publish",
} as const;

type FieldName = keyof BlogPostFormInput;

/** Which field sits in which section — drives the index dots and the bar. */
const SECTIONS: ReadonlyArray<{
  id: string;
  label: string;
  fields: readonly FieldName[];
}> = [
  {
    id: BLOG_POST_SECTION_IDS.main,
    label: f.sectionMain,
    fields: ["title", "categoryId", "authorName", "slug", "excerpt"],
  },
  {
    id: BLOG_POST_SECTION_IDS.content,
    label: f.sectionContent,
    fields: ["content", "readingMinutes"],
  },
  {
    id: BLOG_POST_SECTION_IDS.cover,
    label: f.sectionCover,
    fields: ["coverImageUrl"],
  },
  {
    id: BLOG_POST_SECTION_IDS.show,
    label: f.sectionShow,
    fields: ["featured", "listed"],
  },
  {
    id: BLOG_POST_SECTION_IDS.seo,
    label: f.sectionSeo,
    fields: ["metaTitle", "metaDescription", "keywords", "ogImage"],
  },
  {
    id: BLOG_POST_SECTION_IDS.publish,
    label: f.sectionPublish,
    fields: ["status", "scheduledAt"],
  },
];

/** How each field is named in the «Перевірте N полів» line, in form order. */
const FIELD_LABELS: ReadonlyArray<[FieldName, string]> = [
  ["title", f.title],
  ["categoryId", f.category],
  ["authorName", f.author],
  ["slug", f.slug],
  ["excerpt", f.excerpt],
  ["content", f.content],
  ["readingMinutes", f.readingMinutes],
  ["coverImageUrl", f.coverImageUrl],
  ["metaTitle", f.metaTitle],
  ["metaDescription", f.metaDescription],
  ["keywords", dict.seoFields.keywords],
  ["ogImage", dict.seoFields.ogImage],
  ["scheduledAt", f.scheduledAt],
];

/** The switch's segments, in the artboard's order (БЛ7). */
const STATUS_OPTIONS: ReadonlyArray<{ value: BlogPostStatus; label: string }> =
  [
    { value: "PUBLISHED", label: f.statusPublished },
    { value: "DRAFT", label: f.statusDraft },
    { value: "SCHEDULED", label: f.statusScheduled },
  ];

const MAX_LENGTH_LABEL = BLOG_CONTENT_MAX_LENGTH.toLocaleString("uk-UA");

interface BlogPostFormProps {
  /** Entity id (edit mode) — drives the forms.md reset keyed to the entity. */
  id?: string;
  defaultValues?: Partial<BlogPostFormInput>;
  onSubmit: (values: BlogPostFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

/** Empty baseline for create mode and the merge base in edit mode. */
const EMPTY_VALUES: BlogPostFormInput = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  categoryId: "",
  authorName: "",
  coverImageUrl: "",
  readingMinutes: "",
  featured: false,
  listed: true,
  metaTitle: "",
  metaDescription: "",
  keywords: "",
  ogImage: "",
  status: "DRAFT",
  scheduledAt: "",
};

const errorId = (field: string) => `post-${field}-error`;

/**
 * Reusable create/edit blog-post form — sectioned since wave 198
 * (BlogProposal БЛ7–БЛ10): an index on the left, «Основне · Вміст · Обкладинка
 * · Показ у блозі · SEO і соцмережі · Публікація», and ONE sticky «Зберегти»
 * that names the sections with unsaved edits. An invalid submit names every
 * field to fix in one line above the form.
 *
 * Kept on purpose, because the API does not do it yet:
 * - «Автор» is a free-text byline — there is no authors endpoint to pick from
 *   (TASK-1176); the server links the byline to an Author record itself.
 * - «Час читання» stays a field — the API stores what is entered and derives
 *   nothing (TASK-1177). The form only OFFERS the estimate it computes.
 */
export function BlogPostForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
}: BlogPostFormProps) {
  const { data: categoriesData } = useAdminBlogControllerFindCategories();
  const categories = categoriesData?.data ?? [];

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, dirtyFields, submitCount },
  } = useForm<BlogPostFormInput, unknown, BlogPostFormValues>({
    resolver: zodResolver(blogPostSchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md: re-seed only when navigating to a different entity (`id` changes),
  // NOT on every render or background refetch.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const titleValue = useWatch({ control, name: "title" }) ?? "";
  const slugValue = useWatch({ control, name: "slug" });
  const statusValue = useWatch({ control, name: "status" });
  // Live body HTML for the preview tab (TASK-266) and the counters (БЛ7).
  const contentValue = useWatch({ control, name: "content" }) ?? "";
  const readingValue = useWatch({ control, name: "readingMinutes" }) ?? "";
  const stats = blogContentStats(contentValue);
  const overLimit = stats.length > BLOG_CONTENT_MAX_LENGTH;

  // TASK-424: the cover field takes a FILE as well as a pasted link. The uploaded
  // URL is written through `setValue`, so the form stays the single source of
  // truth for the field (docs/conventions/forms.md).
  const coverValue = useWatch({ control, name: "coverImageUrl" }) ?? "";
  const coverUpload = useImageUploadField({
    upload: useUploadsControllerUploadBlogCover(),
    copy: f.coverUpload,
    onUploaded: (url) =>
      setValue("coverImageUrl", url, {
        shouldDirty: true,
        shouldValidate: true,
      }),
  });
  // Live SERP preview (TASK-437). The tiers are the storefront's own
  // (`resolveSeo`): the overrides below, then the post's title/excerpt, then
  // the SeoSettings defaults.
  const excerptValue = useWatch({ control, name: "excerpt" }) ?? "";
  const metaTitleValue = useWatch({ control, name: "metaTitle" }) ?? "";
  const metaDescriptionValue =
    useWatch({ control, name: "metaDescription" }) ?? "";
  const seoSettings = useSeoSettingsControllerGetSettings().data?.data;
  const previewTitle = resolveSeoPreviewTitle({
    entityTitle: metaTitleValue,
    defaultTitle: seoSettings?.defaultMetaTitle,
    contentName: titleValue,
    titleTemplate: resolveEffectiveTitleTemplate(
      seoSettings?.titleTemplate,
      resolvePreviewSiteName(seoSettings),
    ),
  });
  const previewDescription = resolveSeoPreviewDescription({
    entityDescription: metaDescriptionValue,
    defaultDescription: seoSettings?.defaultMetaDescription,
    contentDescription: excerptValue,
  });
  const previewSlug =
    slugValue || (titleValue.trim() ? slugify(titleValue) : "");

  /* ── sections: dirty / error dots, the sticky bar's line ─────────────── */

  const sections = SECTIONS.map((section) => ({
    ...section,
    dirty: section.fields.some((field) => dirtyFields[field]),
    error: section.fields.some((field) => errors[field]),
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

  // БЛ10: after a refused submit, ONE line names every field to fix — and it
  // follows the errors as they are fixed, rather than freezing at submit time.
  const invalidLabels =
    submitCount > 0
      ? FIELD_LABELS.filter(([field]) => errors[field]).map(
          ([, label]) => `«${label}»`,
        )
      : [];

  const fieldA11y = (field: FieldName, hintId?: string) => {
    const describedBy = [hintId, errors[field] ? errorId(field) : undefined]
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
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
    >
      {invalidLabels.length > 0 ? (
        <FormAlert>
          {f.errorsSummary(
            countLabel(invalidLabels.length, f.fieldForms),
            invalidLabels.join(", "),
          )}
        </FormAlert>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <FormSectionNav
          sections={navSections}
          aria-label={f.sectionsAria}
          className="md:w-48 md:shrink-0"
        />

        <div className="flex max-w-3xl min-w-0 flex-1 flex-col gap-4">
          {/* ── Основне ─────────────────────────────────────────────── */}
          <FormSectionCard
            id={BLOG_POST_SECTION_IDS.main}
            title={f.sectionMain}
          >
            <Field>
              <Label htmlFor="post-title" required>
                {f.title}
              </Label>
              <Input
                id="post-title"
                aria-required="true"
                {...fieldA11y("title")}
                {...register("title")}
              />
              <FieldError id={errorId("title")}>
                {errors.title?.message}
              </FieldError>
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="post-category" required>
                  {f.category}
                </Label>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={(value) => {
                        // Radix re-dispatches "" from its hidden native select
                        // when the id-keyed reset() seeds a category before the
                        // options load (TASK-201) — a real pick is never "".
                        if (value === "") return;
                        field.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        id="post-category"
                        className="w-full"
                        aria-required="true"
                        {...fieldA11y("categoryId")}
                      >
                        <SelectValue placeholder={f.categoryPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError id={errorId("categoryId")}>
                  {errors.categoryId?.message}
                </FieldError>
              </Field>

              <Field>
                <Label htmlFor="post-author" required>
                  {f.author}
                </Label>
                <Input
                  id="post-author"
                  aria-required="true"
                  autoComplete="off"
                  {...fieldA11y("authorName")}
                  {...register("authorName")}
                />
                <FieldError id={errorId("authorName")}>
                  {errors.authorName?.message}
                </FieldError>
              </Field>
            </div>

            <Field>
              <Label htmlFor="post-slug">{f.slug}</Label>
              <div className="flex">
                <span
                  aria-hidden="true"
                  className="inline-flex shrink-0 items-center rounded-l-md border border-r-0 border-input bg-muted px-2.5 font-mono text-sm text-muted-foreground"
                >
                  {f.slugPrefix}
                </span>
                <Input
                  id="post-slug"
                  placeholder={f.slugPlaceholder}
                  className="rounded-l-none font-mono"
                  {...fieldA11y("slug", "post-slug-hint")}
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
              <p id="post-slug-hint" className="text-xs text-muted-foreground">
                {f.slugHint}
              </p>
              <FieldError id={errorId("slug")}>
                {errors.slug?.message}
              </FieldError>
            </Field>

            <Field>
              <Label htmlFor="post-excerpt" required>
                {f.excerpt}
              </Label>
              <Textarea
                id="post-excerpt"
                rows={2}
                aria-required="true"
                placeholder={f.excerptPlaceholder}
                {...fieldA11y("excerpt", "post-excerpt-hint")}
                {...register("excerpt")}
              />
              <FieldError id={errorId("excerpt")}>
                {errors.excerpt?.message}
              </FieldError>
              <p
                id="post-excerpt-hint"
                className="text-xs text-muted-foreground"
              >
                {f.excerptHint}
              </p>
            </Field>
          </FormSectionCard>

          {/* ── Вміст ───────────────────────────────────────────────── */}
          <FormSectionCard
            id={BLOG_POST_SECTION_IDS.content}
            title={f.sectionContent}
          >
            {/* Edit/preview tab pair (TASK-266). Radix TabsContent unmounts
                the inactive panel, which is safe here: the editor is fully
                controlled by the RHF field, so tabbing back re-seeds it from
                the up-to-date value with no data loss. */}
            <Tabs defaultValue="edit">
              <TabsList aria-label={f.content}>
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
                      disabled={isPending}
                      // TASK-547 — the editor lives in `shared/ui` and cannot
                      // reach the media library itself, so the control is
                      // handed in.
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

            {/* БЛ7: the text's own numbers, under the editor. */}
            <div
              id="post-content-stats"
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground"
            >
              <span>
                {stats.words === 0
                  ? f.contentStatsEmpty
                  : f.contentStats(
                      stats.minutes,
                      countLabel(stats.words, f.wordForms),
                      countLabel(stats.images, f.imageForms),
                    )}
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  overLimit && "font-medium text-destructive",
                )}
              >
                {f.contentLength(
                  stats.length.toLocaleString("uk-UA"),
                  MAX_LENGTH_LABEL,
                )}
              </span>
            </div>
            <FieldError id={errorId("content")}>
              {errors.content?.message}
            </FieldError>

            <Field>
              <Label htmlFor="post-reading">{f.readingMinutes}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="post-reading"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  className="w-24"
                  {...fieldA11y("readingMinutes", "post-reading-hint")}
                  {...register("readingMinutes")}
                />
                {stats.minutes > 0 &&
                String(stats.minutes) !== String(readingValue).trim() ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setValue("readingMinutes", String(stats.minutes), {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  >
                    {f.readingApply(stats.minutes)}
                  </Button>
                ) : null}
              </div>
              <p
                id="post-reading-hint"
                className="text-xs text-muted-foreground"
              >
                {f.readingHint}
              </p>
              <FieldError id={errorId("readingMinutes")}>
                {errors.readingMinutes?.message}
              </FieldError>
            </Field>
          </FormSectionCard>

          {/* ── Обкладинка ──────────────────────────────────────────── */}
          <FormSectionCard
            id={BLOG_POST_SECTION_IDS.cover}
            title={f.sectionCover}
          >
            <ContentImageField
              id="post-cover"
              label={f.coverImageUrl}
              urlPlaceholder={f.coverImageUrlPlaceholder}
              copy={f.coverUpload}
              value={coverValue}
              urlInput={register("coverImageUrl")}
              onRemove={() =>
                setValue("coverImageUrl", "", {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              fieldError={errors.coverImageUrl?.message}
              // TASK-441 — a picked asset writes its URL through the same
              // `setValue` the upload uses, so the SERP preview follows either way.
              picker={
                <MediaPicker
                  onPick={(asset) =>
                    setValue("coverImageUrl", asset.url, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              }
              {...coverUpload}
            />
          </FormSectionCard>

          {/* ── Показ у блозі ───────────────────────────────────────── */}
          {/* TASK-436 — both flags decide where the article APPEARS, so they sit
              together, each with a hint naming what it does to the site. */}
          <FormSectionCard
            id={BLOG_POST_SECTION_IDS.show}
            title={f.sectionShow}
          >
            <SwitchRow
              id="post-featured"
              label={f.featured}
              hint={f.featuredHint}
            >
              <Controller
                control={control}
                name="featured"
                render={({ field }) => (
                  <Switch
                    id="post-featured"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isPending}
                    aria-describedby="post-featured-hint"
                    className="mt-0.5"
                  />
                )}
              />
            </SwitchRow>
            <SwitchRow id="post-listed" label={f.listed} hint={f.listedHint}>
              <Controller
                control={control}
                name="listed"
                render={({ field }) => (
                  <Switch
                    id="post-listed"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isPending}
                    aria-describedby="post-listed-hint"
                    className="mt-0.5"
                  />
                )}
              />
            </SwitchRow>
          </FormSectionCard>

          {/* ── SEO і соцмережі ─────────────────────────────────────── */}
          {/* TASK-437 — the same shape as the product, category and page forms:
              overrides, the live SERP preview, then the shared tag/OG pair. */}
          <FormSectionCard id={BLOG_POST_SECTION_IDS.seo} title={f.sectionSeo}>
            <Field>
              <Label htmlFor="post-meta-title">{f.metaTitle}</Label>
              <Input
                id="post-meta-title"
                placeholder={f.metaTitlePlaceholder}
                {...fieldA11y("metaTitle", "post-meta-title-hint")}
                {...register("metaTitle")}
              />
              <p
                id="post-meta-title-hint"
                className="text-xs text-muted-foreground"
              >
                {f.metaTitleHint}
              </p>
              <FieldError id={errorId("metaTitle")}>
                {errors.metaTitle?.message}
              </FieldError>
            </Field>

            <Field>
              <Label htmlFor="post-meta-description">{f.metaDescription}</Label>
              <Textarea
                id="post-meta-description"
                rows={3}
                placeholder={f.metaDescriptionPlaceholder}
                {...fieldA11y("metaDescription", "post-meta-description-hint")}
                {...register("metaDescription")}
              />
              <p
                id="post-meta-description-hint"
                className="text-xs text-muted-foreground"
              >
                {f.metaDescriptionHint}
              </p>
              <FieldError id={errorId("metaDescription")}>
                {errors.metaDescription?.message}
              </FieldError>
            </Field>

            {/* The green breadcrumb is the article's real address —
                `/blog/<slug>`, the route the storefront serves. */}
            <SeoSnippetPreview
              title={previewTitle.text}
              titleTier={previewTitle.tier}
              description={previewDescription.text || undefined}
              descriptionTier={previewDescription.tier}
              url={`${STOREFRONT_HOST} › blog › ${previewSlug}`}
              rawTitleLength={metaTitleValue.trim().length}
              rawDescriptionLength={metaDescriptionValue.trim().length}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="post-keywords">{dict.seoFields.keywords}</Label>
                <Input
                  id="post-keywords"
                  placeholder={dict.seoFields.keywordsPlaceholder}
                  {...fieldA11y("keywords", "post-keywords-hint")}
                  {...register("keywords")}
                />
                <p
                  id="post-keywords-hint"
                  className="text-xs text-muted-foreground"
                >
                  {dict.seoFields.keywordsHint}
                </p>
                <FieldError id={errorId("keywords")}>
                  {errors.keywords?.message}
                </FieldError>
              </Field>

              <Field>
                <Label htmlFor="post-og-image">{dict.seoFields.ogImage}</Label>
                <Input
                  id="post-og-image"
                  placeholder={dict.seoFields.ogImagePlaceholder(
                    STOREFRONT_HOST,
                  )}
                  {...fieldA11y("ogImage", "post-og-image-hint")}
                  {...register("ogImage")}
                />
                <p
                  id="post-og-image-hint"
                  className="text-xs text-muted-foreground"
                >
                  {dict.seoFields.ogImageHint}
                </p>
                <FieldError id={errorId("ogImage")}>
                  {errors.ogImage?.message}
                </FieldError>
              </Field>
            </div>
          </FormSectionCard>

          {/* ── Публікація ──────────────────────────────────────────── */}
          <FormSectionCard
            id={BLOG_POST_SECTION_IDS.publish}
            title={f.sectionPublish}
          >
            <div className="flex flex-col gap-1.5">
              <span id="post-status-label" className="sr-only">
                {f.status}
              </span>
              {/* A three-way switch (БЛ7): native radios, so arrow keys, focus
                  and the checked state are the browser's own. Three equal
                  segments on a phone (БЛ8). */}
              <div
                role="radiogroup"
                aria-labelledby="post-status-label"
                aria-describedby="post-status-hint"
                className="grid grid-cols-3 rounded-md border border-input bg-background p-0.5 sm:inline-grid sm:w-fit"
              >
                {STATUS_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex min-h-11 cursor-pointer items-center justify-center rounded-sm px-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 md:min-h-9"
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
                id="post-status-hint"
                className="text-xs text-muted-foreground"
              >
                {statusValue === "PUBLISHED"
                  ? f.statusHintPublished
                  : statusValue === "SCHEDULED"
                    ? f.scheduledAtHint
                    : f.statusHintDraft}
              </p>
            </div>

            {statusValue === "SCHEDULED" && (
              <Field>
                <Label htmlFor="post-scheduled-at" required>
                  {f.scheduledAt}
                </Label>
                <Input
                  id="post-scheduled-at"
                  type="datetime-local"
                  className="sm:w-64"
                  {...fieldA11y("scheduledAt")}
                  {...register("scheduledAt")}
                />
                <FieldError id={errorId("scheduledAt")}>
                  {errors.scheduledAt?.message}
                </FieldError>
              </Field>
            )}
          </FormSectionCard>
        </div>
      </div>

      <FormActionsBar
        variant="sticky"
        formId={FORM_ID}
        dirtySections={dirtySections}
        onDiscard={() => reset()}
        saveLabel={isPending ? dict.common.saving : submitLabel}
        isSaving={isPending}
      />
    </form>
  );
}

function Field({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

/** A switch with its label and the hint that names what it does to the site. */
function SwitchRow({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {children}
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}
