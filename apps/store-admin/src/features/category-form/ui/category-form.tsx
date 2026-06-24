"use client";

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
import {
  categorySchema,
  type CategoryFormInput,
  type CategoryFormValues,
} from "../model/category-schema";

const ROOT_OPTION = "__root__";

interface CategoryFormProps {
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
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = "Save category",
  excludeParentId,
}: CategoryFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryFormInput, unknown, CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: EMPTY_VALUES,
    // In edit mode, `values` live-syncs the form when the entity refetches in the
    // background (TASK-141-B). `keepDirtyValues` updates only pristine fields, so
    // the admin's in-progress edits are never clobbered. In create mode
    // (`defaultValues` undefined) `values` is omitted and the form stays editable.
    values: defaultValues ? { ...EMPTY_VALUES, ...defaultValues } : undefined,
    resetOptions: { keepDirtyValues: true },
  });

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
        <Label htmlFor="category-name">Name</Label>
        <Input id="category-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-slug">Slug</Label>
        <Input
          id="category-slug"
          placeholder="Leave blank to auto-generate from name"
          {...register("slug")}
        />
        {errors.slug && (
          <p role="alert" className="text-sm text-destructive">
            {errors.slug.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-description">Description</Label>
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
        <Label htmlFor="category-image">Image URL</Label>
        <Input
          id="category-image"
          placeholder="https://…"
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
          <Label htmlFor="category-parent">Parent category</Label>
          <Controller
            control={control}
            name="parentId"
            render={({ field }) => (
              <Select
                value={field.value ? field.value : ROOT_OPTION}
                onValueChange={(value) =>
                  field.onChange(value === ROOT_OPTION ? "" : value)
                }
              >
                <SelectTrigger id="category-parent">
                  <SelectValue
                    placeholder={
                      categoriesQuery.isLoading
                        ? "Loading…"
                        : "Root (no parent)"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_OPTION}>Root (no parent)</SelectItem>
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
          <Label htmlFor="category-sort">Sort order</Label>
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
        <Label htmlFor="category-active">Active (visible in the store)</Label>
      </div>

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
