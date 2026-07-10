"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, FormActionsBar, Input, Label } from "@/shared/ui";
import { slugify } from "@/shared/lib/slug";
import { dict } from "@/shared/config";
import {
  blogCategorySchema,
  type BlogCategoryFormInput,
  type BlogCategoryFormValues,
} from "../model/blog-category-schema";

interface BlogCategoryFormProps {
  id?: string;
  defaultValues?: Partial<BlogCategoryFormInput>;
  onSubmit: (values: BlogCategoryFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

const EMPTY_VALUES: BlogCategoryFormInput = {
  name: "",
  slug: "",
  sortOrder: "0",
};

/** Reusable create/edit blog-category form (name, slug, sort order). */
export function BlogCategoryForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.blogCategoryForm.submit,
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
      className="flex max-w-lg flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-name">{dict.blogCategoryForm.name}</Label>
        <Input id="category-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-slug">{dict.blogCategoryForm.slug}</Label>
        <Input
          id="category-slug"
          placeholder={dict.blogCategoryForm.slugPlaceholder}
          {...register("slug")}
        />
        {!slugValue && nameValue.trim().length > 0 && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="slug-preview"
          >
            {dict.blogCategoryForm.slugPreview(slugify(nameValue))}
          </p>
        )}
        {errors.slug && (
          <p role="alert" className="text-sm text-destructive">
            {errors.slug.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-sort">{dict.blogCategoryForm.sortOrder}</Label>
        <Input
          id="category-sort"
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

      <FormActionsBar>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </FormActionsBar>
    </form>
  );
}
