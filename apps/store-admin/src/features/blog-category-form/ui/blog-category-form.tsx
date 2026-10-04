"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, FieldError, Input, Label } from "@/shared/ui";
import { slugify } from "@/shared/lib/slug";
import { dict } from "@/shared/config";
import {
  blogCategorySchema,
  type BlogCategoryFormInput,
  type BlogCategoryFormValues,
} from "../model/blog-category-schema";

const f = dict.blogCategoryForm;

interface BlogCategoryFormProps {
  id?: string;
  defaultValues?: Partial<BlogCategoryFormInput>;
  onSubmit: (values: BlogCategoryFormValues) => void;
  /** «Скасувати» — shown when the host (a dialog) can be closed. */
  onCancel?: () => void;
  isPending: boolean;
  submitLabel?: string;
}

const EMPTY_VALUES: BlogCategoryFormInput = {
  name: "",
  slug: "",
};

const errorId = (field: string) => `blog-category-${field}-error`;

/**
 * Reusable create/edit blog-category form (name + the filter address) — the
 * body of the dialog over the categories list since wave 198
 * (BlogCategoriesProposal КБ4, owner decision 2026-10-01). The slug is named
 * for what it is on the site: `/blog?category=<slug>`.
 */
export function BlogCategoryForm({
  id,
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
  submitLabel = f.submit,
}: BlogCategoryFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BlogCategoryFormInput, unknown, BlogCategoryFormValues>({
    resolver: zodResolver(blogCategorySchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md: re-seed only when a different category is opened.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const nameValue = useWatch({ control, name: "name" }) ?? "";
  const slugValue = useWatch({ control, name: "slug" });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="blog-category-name" required>
          {f.name}
        </Label>
        <Input
          id="blog-category-name"
          aria-required="true"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? errorId("name") : undefined}
          {...register("name")}
        />
        <FieldError id={errorId("name")}>{errors.name?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="blog-category-slug">{f.slug}</Label>
        <div className="flex">
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 items-center rounded-l-md border border-r-0 border-input bg-muted px-2.5 font-mono text-sm text-muted-foreground"
          >
            {f.slugPrefix}
          </span>
          <Input
            id="blog-category-slug"
            placeholder={f.slugPlaceholder}
            className="rounded-l-none font-mono"
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby={[
              "blog-category-slug-hint",
              errors.slug ? errorId("slug") : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
            {...register("slug")}
          />
        </div>
        {!slugValue && nameValue.trim().length > 0 && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="slug-preview"
          >
            {f.slugPreview(slugify(nameValue))}
          </p>
        )}
        <p
          id="blog-category-slug-hint"
          className="text-xs text-muted-foreground"
        >
          {f.slugHint}
        </p>
        <FieldError id={errorId("slug")}>{errors.slug?.message}</FieldError>
      </div>

      <p className="text-xs text-muted-foreground">{f.chipHint}</p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            {dict.common.cancel}
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
