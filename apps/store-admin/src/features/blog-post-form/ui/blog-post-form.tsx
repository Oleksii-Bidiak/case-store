"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Input,
  Label,
  RichTextEditor,
  RichTextPreview,
  SeoSnippetPreview,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/shared/ui";
import {
  ContentImageField,
  useImageUploadField,
  useUploadsControllerUploadBlogCover,
} from "@/features/content-image-upload";
import { useAdminBlogControllerFindCategories } from "@/entities/blog";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { slugify } from "@/shared/lib/slug";
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
} from "../model/blog-post-schema";

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

/**
 * Reusable create/edit blog-post form with a Tiptap rich-text body, a category
 * select (fetched from the admin categories endpoint), a featured toggle, and
 * publish controls. The slug auto-fills from the title until edited manually.
 */
export function BlogPostForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.blogPostForm.submit,
}: BlogPostFormProps) {
  const { data: categoriesData } = useAdminBlogControllerFindCategories();
  const categories = categoriesData?.data ?? [];

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
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
  // Live body HTML for the preview tab (TASK-266).
  const contentValue = useWatch({ control, name: "content" }) ?? "";

  // TASK-424: the cover field takes a FILE as well as a pasted link. The uploaded
  // URL is written through `setValue`, so the form stays the single source of
  // truth for the field (docs/conventions/forms.md).
  const coverValue = useWatch({ control, name: "coverImageUrl" }) ?? "";
  const coverUpload = useImageUploadField({
    upload: useUploadsControllerUploadBlogCover(),
    copy: dict.blogPostForm.coverUpload,
    onUploaded: (url) =>
      setValue("coverImageUrl", url, {
        shouldDirty: true,
        shouldValidate: true,
      }),
  });
  // Live SERP preview (TASK-437). The article form had no SEO section at all, so
  // an operator could not see — let alone control — what Google would show. The
  // tiers are the storefront's own (`resolveSeo`): the overrides below, then the
  // post's title/excerpt, then the SeoSettings defaults.
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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-title">{dict.blogPostForm.title}</Label>
        <Input id="post-title" {...register("title")} />
        {errors.title && (
          <p role="alert" className="text-sm text-destructive">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-slug">{dict.blogPostForm.slug}</Label>
        <Input
          id="post-slug"
          placeholder={dict.blogPostForm.slugPlaceholder}
          {...register("slug")}
        />
        {!slugValue && titleValue.trim().length > 0 && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="slug-preview"
          >
            {dict.blogPostForm.slugPreview(slugify(titleValue))}
          </p>
        )}
        {errors.slug && (
          <p role="alert" className="text-sm text-destructive">
            {errors.slug.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-category">{dict.blogPostForm.category}</Label>
        <select
          id="post-category"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          {...register("categoryId")}
        >
          <option value="">{dict.blogPostForm.categoryPlaceholder}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {errors.categoryId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.categoryId.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-excerpt">{dict.blogPostForm.excerpt}</Label>
        <Textarea
          id="post-excerpt"
          rows={2}
          placeholder={dict.blogPostForm.excerptPlaceholder}
          {...register("excerpt")}
        />
        {errors.excerpt && (
          <p role="alert" className="text-sm text-destructive">
            {errors.excerpt.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-content">{dict.blogPostForm.content}</Label>
        {/* Edit/preview tab pair (TASK-266). Radix TabsContent unmounts the
            inactive panel, which is safe here: the editor is fully controlled
            by the RHF field, so tabbing back re-seeds it from the up-to-date
            value with no data loss. Accepted trade-off (same as GitHub's
            markdown Preview tab): cursor/scroll position inside the editor is
            lost across a tab round-trip. */}
        <Tabs defaultValue="edit">
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
                  placeholder={dict.blogPostForm.contentPlaceholder}
                  disabled={isPending}
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
        {errors.content && (
          <p role="alert" className="text-sm text-destructive">
            {errors.content.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-author">{dict.blogPostForm.author}</Label>
        <Input id="post-author" {...register("authorName")} />
        {errors.authorName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.authorName.message}
          </p>
        )}
      </div>

      <ContentImageField
        id="post-cover"
        label={dict.blogPostForm.coverImageUrl}
        urlPlaceholder={dict.blogPostForm.coverImageUrlPlaceholder}
        copy={dict.blogPostForm.coverUpload}
        value={coverValue}
        urlInput={register("coverImageUrl")}
        onRemove={() =>
          setValue("coverImageUrl", "", {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        fieldError={errors.coverImageUrl?.message}
        {...coverUpload}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-reading">{dict.blogPostForm.readingMinutes}</Label>
        <Input
          id="post-reading"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          {...register("readingMinutes")}
        />
        {errors.readingMinutes && (
          <p role="alert" className="text-sm text-destructive">
            {errors.readingMinutes.message}
          </p>
        )}
      </div>

      {/* TASK-436 — both flags decide where the article APPEARS, so they sit
          together, each with a hint: a bare toggle tells the owner nothing about
          what it will do to the site. */}
      <div className="flex flex-col gap-4">
        <Controller
          control={control}
          name="featured"
          render={({ field }) => (
            <div className="flex items-start gap-3">
              <Switch
                id="post-featured"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isPending}
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="post-featured">
                  {dict.blogPostForm.featured}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {dict.blogPostForm.featuredHint}
                </p>
              </div>
            </div>
          )}
        />

        <Controller
          control={control}
          name="listed"
          render={({ field }) => (
            <div className="flex items-start gap-3">
              <Switch
                id="post-listed"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isPending}
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="post-listed">{dict.blogPostForm.listed}</Label>
                <p className="text-sm text-muted-foreground">
                  {dict.blogPostForm.listedHint}
                </p>
              </div>
            </div>
          )}
        />
      </div>

      {/* TASK-437 — the SEO block, built to the same shape as the product,
          category and page forms: overrides first, then the shared tag/OG pair,
          then the live SERP preview. */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-meta-title">{dict.blogPostForm.metaTitle}</Label>
        <Input
          id="post-meta-title"
          placeholder={dict.blogPostForm.metaTitlePlaceholder}
          {...register("metaTitle")}
        />
        <p className="text-sm text-muted-foreground">
          {dict.blogPostForm.metaTitleHint}
        </p>
        {errors.metaTitle && (
          <p role="alert" className="text-sm text-destructive">
            {errors.metaTitle.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-meta-description">
          {dict.blogPostForm.metaDescription}
        </Label>
        <Textarea
          id="post-meta-description"
          rows={3}
          placeholder={dict.blogPostForm.metaDescriptionPlaceholder}
          {...register("metaDescription")}
        />
        <p className="text-sm text-muted-foreground">
          {dict.blogPostForm.metaDescriptionHint}
        </p>
        {errors.metaDescription && (
          <p role="alert" className="text-sm text-destructive">
            {errors.metaDescription.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-keywords">{dict.seoFields.keywords}</Label>
        <Input
          id="post-keywords"
          placeholder={dict.seoFields.keywordsPlaceholder}
          {...register("keywords")}
        />
        <p className="text-sm text-muted-foreground">
          {dict.seoFields.keywordsHint}
        </p>
        {errors.keywords && (
          <p role="alert" className="text-sm text-destructive">
            {errors.keywords.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-og-image">{dict.seoFields.ogImage}</Label>
        <Input
          id="post-og-image"
          placeholder={dict.seoFields.ogImagePlaceholder(STOREFRONT_HOST)}
          {...register("ogImage")}
        />
        <p className="text-sm text-muted-foreground">
          {dict.seoFields.ogImageHint}
        </p>
        {errors.ogImage && (
          <p role="alert" className="text-sm text-destructive">
            {errors.ogImage.message}
          </p>
        )}
      </div>

      {/* The green breadcrumb is the article's real address — `/blog/<slug>`,
          the route the storefront serves — so the preview cannot imply a page
          that does not exist. */}
      <SeoSnippetPreview
        title={previewTitle.text}
        titleTier={previewTitle.tier}
        description={previewDescription.text || undefined}
        descriptionTier={previewDescription.tier}
        url={`${STOREFRONT_HOST} › blog › ${previewSlug}`}
        rawTitleLength={metaTitleValue.trim().length}
        rawDescriptionLength={metaDescriptionValue.trim().length}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-status">{dict.blogPostForm.status}</Label>
        <select
          id="post-status"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          {...register("status")}
        >
          <option value="DRAFT">{dict.blogPostForm.statusDraft}</option>
          <option value="SCHEDULED">{dict.blogPostForm.statusScheduled}</option>
          <option value="PUBLISHED">{dict.blogPostForm.statusPublished}</option>
        </select>
      </div>

      {statusValue === "SCHEDULED" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-scheduled-at">
            {dict.blogPostForm.scheduledAt}
          </Label>
          <Input
            id="post-scheduled-at"
            type="datetime-local"
            {...register("scheduledAt")}
          />
          <p className="text-sm text-muted-foreground">
            {dict.blogPostForm.scheduledAtHint}
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
