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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/shared/ui";
import { slugify } from "@/shared/lib/slug";
import {
  resolveSeoPreviewTitle,
  resolveSeoPreviewDescription,
  resolveEffectiveTitleTemplate,
} from "@/shared/lib/seo";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { dict } from "@/shared/config";
import {
  pageSchema,
  type PageFormInput,
  type PageFormValues,
} from "../model/page-schema";

interface PageFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different page,
   *  never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<PageFormInput>;
  onSubmit: (values: PageFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: PageFormInput = {
  title: "",
  slug: "",
  content: "",
  excerpt: "",
  metaTitle: "",
  metaDescription: "",
  sortOrder: "0",
  status: "DRAFT",
  scheduledAt: "",
};

/**
 * Reusable create/edit page form with a Tiptap rich-text editor for the body.
 *
 * The slug auto-fills from the title while the slug field is still untouched
 * (create-mode convenience); once the admin edits the slug manually, typing in
 * the title no longer overwrites it.
 */
export function PageForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.pageForm.submit,
}: PageFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
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

  // Live slug preview: read-only observers on the same `control`. When the slug
  // field is blank, show what the backend would auto-derive from the title (the
  // `slugify` port mirrors the server's `generateSlug`). Pure render-time
  // computation — no state, no side effects.
  const titleValue = useWatch({ control, name: "title" }) ?? "";
  const slugValue = useWatch({ control, name: "slug" });
  const statusValue = useWatch({ control, name: "status" });

  // Live SERP preview (TASK-268): resolve the exact title/description the
  // storefront would render for this /legal/[slug] page through the same
  // three-tier precedence. Title tier-3 derives from the page title; the
  // description derives from the excerpt (its short-summary field), then the
  // body content. `SeoSettings` feeds tier-2 defaults + the title template.
  const excerptValue = useWatch({ control, name: "excerpt" }) ?? "";
  const contentValue = useWatch({ control, name: "content" }) ?? "";
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
      dict.brand,
    ),
  });
  const previewDescription = resolveSeoPreviewDescription({
    entityDescription: metaDescriptionValue,
    defaultDescription: seoSettings?.defaultMetaDescription,
    contentDescription: excerptValue || contentValue,
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
        <Label htmlFor="page-title">{dict.pageForm.title}</Label>
        <Input id="page-title" {...register("title")} />
        {errors.title && (
          <p role="alert" className="text-sm text-destructive">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-slug">{dict.pageForm.slug}</Label>
        <Input
          id="page-slug"
          placeholder={dict.pageForm.slugPlaceholder}
          {...register("slug")}
        />
        {!slugValue && titleValue.trim().length > 0 && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="slug-preview"
          >
            {dict.pageForm.slugPreview(slugify(titleValue))}
          </p>
        )}
        {errors.slug && (
          <p role="alert" className="text-sm text-destructive">
            {errors.slug.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-content">{dict.pageForm.content}</Label>
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
                  placeholder={dict.pageForm.contentPlaceholder}
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
        <Label htmlFor="page-excerpt">{dict.pageForm.excerpt}</Label>
        <Textarea
          id="page-excerpt"
          rows={2}
          placeholder={dict.pageForm.excerptPlaceholder}
          {...register("excerpt")}
        />
        {errors.excerpt && (
          <p role="alert" className="text-sm text-destructive">
            {errors.excerpt.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-meta-title">{dict.pageForm.metaTitle}</Label>
        <Input id="page-meta-title" {...register("metaTitle")} />
        {errors.metaTitle && (
          <p role="alert" className="text-sm text-destructive">
            {errors.metaTitle.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-meta-description">
          {dict.pageForm.metaDescription}
        </Label>
        <Textarea
          id="page-meta-description"
          rows={2}
          {...register("metaDescription")}
        />
        {errors.metaDescription && (
          <p role="alert" className="text-sm text-destructive">
            {errors.metaDescription.message}
          </p>
        )}
      </div>

      <SeoSnippetPreview
        title={previewTitle.text}
        titleTier={previewTitle.tier}
        description={previewDescription.text || undefined}
        descriptionTier={previewDescription.tier}
        url={`${dict.seoSnippetPreview.urlHost} › legal › ${previewSlug}`}
        rawTitleLength={metaTitleValue.trim().length}
        rawDescriptionLength={metaDescriptionValue.trim().length}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-sort">{dict.pageForm.sortOrder}</Label>
        <Input
          id="page-sort"
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
        <Label htmlFor="page-status">{dict.pageForm.status}</Label>
        <select
          id="page-status"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          {...register("status")}
        >
          <option value="DRAFT">{dict.pageForm.statusDraft}</option>
          <option value="SCHEDULED">{dict.pageForm.statusScheduled}</option>
          <option value="PUBLISHED">{dict.pageForm.statusPublished}</option>
        </select>
      </div>

      {statusValue === "SCHEDULED" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="page-scheduled-at">{dict.pageForm.scheduledAt}</Label>
          <Input
            id="page-scheduled-at"
            type="datetime-local"
            {...register("scheduledAt")}
          />
          <p className="text-sm text-muted-foreground">
            {dict.pageForm.scheduledAtHint}
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
