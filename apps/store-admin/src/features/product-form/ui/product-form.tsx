"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCategoryControllerGetRootCategories } from "@/shared/api";
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
  productSchema,
  type ProductFormInput,
  type ProductFormValues,
} from "../model/product-schema";

interface ProductFormProps {
  defaultValues?: Partial<ProductFormInput>;
  onSubmit: (values: ProductFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

/**
 * Reusable create/edit product form.
 *
 * Numeric fields are bound as text inputs; the zod schema parses them into
 * numbers before `onSubmit` is invoked. The category selector is populated from
 * the root-category list and bound through a `Controller` (Radix Select is a
 * controlled component).
 */
export function ProductForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = "Save product",
}: ProductFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      price: "",
      compareAtPrice: "",
      sku: "",
      categoryId: "",
      isActive: true,
      ...defaultValues,
    },
  });

  const categoriesQuery = useCategoryControllerGetRootCategories({
    limit: 100,
  });
  const categories = categoriesQuery.data?.data ?? [];

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-name">Name</Label>
        <Input id="product-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-slug">Slug</Label>
        <Input
          id="product-slug"
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
        <Label htmlFor="product-description">Description</Label>
        <Textarea
          id="product-description"
          rows={5}
          {...register("description")}
        />
        {errors.description && (
          <p role="alert" className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-price">Price</Label>
          <Input
            id="product-price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            {...register("price")}
          />
          {errors.price && (
            <p role="alert" className="text-sm text-destructive">
              {errors.price.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-compare-price">Compare-at price</Label>
          <Input
            id="product-compare-price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            {...register("compareAtPrice")}
          />
          {errors.compareAtPrice && (
            <p role="alert" className="text-sm text-destructive">
              {errors.compareAtPrice.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-sku">SKU</Label>
          <Input id="product-sku" {...register("sku")} />
          {errors.sku && (
            <p role="alert" className="text-sm text-destructive">
              {errors.sku.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-category">Category</Label>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="product-category">
                  <SelectValue
                    placeholder={
                      categoriesQuery.isLoading
                        ? "Loading…"
                        : "Select a category"
                    }
                  />
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
          {errors.categoryId && (
            <p role="alert" className="text-sm text-destructive">
              {errors.categoryId.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="product-active"
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        <Label htmlFor="product-active">Active (visible in the store)</Label>
      </div>

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
