"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Label, RichTextEditor, Textarea } from "@/shared/ui";
import { slugify } from "@/shared/lib/slug";
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
  isActive: false,
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
        <Controller
          control={control}
          name="content"
          render={({ field }) => (
            <RichTextEditor
              value={field.value ?? ""}
              onChange={field.onChange}
              placeholder={dict.pageForm.contentPlaceholder}
              disabled={isPending}
            />
          )}
        />
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

      <div className="flex items-center gap-2">
        <input
          id="page-active"
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        <Label htmlFor="page-active">{dict.pageForm.active}</Label>
      </div>

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
