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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/shared/ui";
import { useAdminBlogControllerFindCategories } from "@/entities/blog";
import { slugify } from "@/shared/lib/slug";
import { dict } from "@/shared/config";
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-cover">{dict.blogPostForm.coverImageUrl}</Label>
        <Input
          id="post-cover"
          placeholder={dict.blogPostForm.coverImageUrlPlaceholder}
          {...register("coverImageUrl")}
        />
        {errors.coverImageUrl && (
          <p role="alert" className="text-sm text-destructive">
            {errors.coverImageUrl.message}
          </p>
        )}
      </div>

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

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" {...register("featured")} />
        {dict.blogPostForm.featured}
      </label>

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
