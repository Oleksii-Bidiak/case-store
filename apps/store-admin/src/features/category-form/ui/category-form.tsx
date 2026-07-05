"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAdminCategoryControllerFindAllWithProductCount } from "@/entities/category";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  categorySchema,
  type CategoryFormInput,
  type CategoryFormValues,
} from "../model/category-schema";

const ROOT_OPTION = "__root__";

interface CategoryFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different
   *  category, never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<CategoryFormInput>;
  onSubmit: (values: CategoryFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  /** Current category id (edit mode) — excluded from the parent options so a
   *  category cannot be set as its own parent. */
  excludeParentId?: string;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: CategoryFormInput = {
  name: "",
  slug: "",
  description: "",
  image: "",
  parentId: "",
  sortOrder: "0",
  isActive: true,
};

/**
 * Reusable create/edit category form.
 *
 * The parent selector lists existing categories (minus the category being
 * edited) plus a "Root (no parent)" option mapped to an empty parentId.
 */
export function CategoryForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.categoryForm.submit,
  excludeParentId,
}: CategoryFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormInput, unknown, CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: EMPTY_VALUES,
  });

  // forms.md Rule 2b: re-seed only when navigating to a different entity (`id`
  // changes), NOT on every render or background refetch. The previous `values`
  // live-sync (Rule 2a) could clobber an in-progress parent selection before
  // its dirty flag was committed under React 19 concurrent rendering, which is
  // why the chosen parent was silently dropped on save (TASK-149).
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const categoriesQuery = useAdminCategoryControllerFindAllWithProductCount({
    limit: 100,
  });
  const parentOptions = (categoriesQuery.data?.data ?? []).filter(
    (category) => category.id !== excludeParentId,
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-name">{dict.categoryForm.name}</Label>
        <Input id="category-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-slug">{dict.categoryForm.slug}</Label>
        <Input
          id="category-slug"
          placeholder={dict.categoryForm.slugPlaceholder}
          {...register("slug")}
        />
        {errors.slug && (
          <p role="alert" className="text-sm text-destructive">
            {errors.slug.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-description">
          {dict.categoryForm.description}
        </Label>
        <Textarea
          id="category-description"
          rows={4}
          {...register("description")}
        />
        {errors.description && (
          <p role="alert" className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-image">{dict.categoryForm.image}</Label>
        <Input
          id="category-image"
          placeholder={dict.categoryForm.imagePlaceholder}
          {...register("image")}
        />
        {errors.image && (
          <p role="alert" className="text-sm text-destructive">
            {errors.image.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category-parent">{dict.categoryForm.parent}</Label>
          <Controller
            control={control}
            name="parentId"
            render={({ field }) => (
              <Select
                value={field.value ? field.value : ROOT_OPTION}
                onValueChange={(value) => {
                  // Radix Select renders a hidden native <select> (bubble
                  // input) inside the form and re-dispatches a `change` event
                  // whenever the controlled value changes. When the id-keyed
                  // reset() seeds parentId BEFORE the parent options have
                  // loaded, that native select has no matching <option>, so
                  // the browser coerces its value to "" and Radix's autofill
                  // handler feeds "" back here — silently clearing the seeded
                  // parent (TASK-201). A real user action is never "": picking
                  // "Root" arrives as ROOT_OPTION. So "" can only be that
                  // bounce — ignore it.
                  if (value === "") return;
                  field.onChange(value === ROOT_OPTION ? "" : value);
                }}
              >
                <SelectTrigger id="category-parent">
                  <SelectValue
                    placeholder={
                      categoriesQuery.isLoading
                        ? dict.categoryForm.loading
                        : dict.categoryForm.rootOption
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_OPTION}>
                    {dict.categoryForm.rootOption}
                  </SelectItem>
                  {parentOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.parentId && (
            <p role="alert" className="text-sm text-destructive">
              {errors.parentId.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category-sort">{dict.categoryForm.sortOrder}</Label>
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
      </div>

      <div className="flex items-center gap-2">
        <input
          id="category-active"
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        <Label htmlFor="category-active">{dict.categoryForm.active}</Label>
      </div>

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
