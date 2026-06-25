"use client";

import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useCategoryControllerGetRootCategories } from "@/shared/api";
import { useProductGroupControllerFindAll } from "@/entities/product-group";
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

/** Radix Select forbids an empty-string item value; this stands in for "no group". */
const NO_GROUP = "__none__";

interface ProductFormProps {
  defaultValues?: Partial<ProductFormInput>;
  onSubmit: (values: ProductFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: ProductFormInput = {
  name: "",
  slug: "",
  description: "",
  price: "",
  compareAtPrice: "",
  sku: "",
  stock: "0",
  categoryId: "",
  groupId: "",
  positionOrder: "0",
  attributes: [],
  isActive: true,
};

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
    defaultValues: EMPTY_VALUES,
    // In edit mode, `values` live-syncs the form when the entity refetches in the
    // background (TASK-141-B). `keepDirtyValues` updates only pristine fields, so
    // the admin's in-progress edits are never clobbered. In create mode
    // (`defaultValues` undefined) `values` is omitted and the form stays editable.
    values: defaultValues ? { ...EMPTY_VALUES, ...defaultValues } : undefined,
    resetOptions: { keepDirtyValues: true },
  });

  const {
    fields: attributeFields,
    append: appendAttribute,
    remove: removeAttribute,
  } = useFieldArray({ control, name: "attributes" });

  const categoriesQuery = useCategoryControllerGetRootCategories({
    limit: 100,
  });
  const categories = categoriesQuery.data?.data ?? [];

  const groupsQuery = useProductGroupControllerFindAll();
  const groups = groupsQuery.data?.data ?? [];

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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-stock">Stock</Label>
          <Input
            id="product-stock"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            {...register("stock")}
          />
          {errors.stock && (
            <p role="alert" className="text-sm text-destructive">
              {errors.stock.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-position-order">Position order</Label>
          <Input
            id="product-position-order"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            {...register("positionOrder")}
          />
          {errors.positionOrder && (
            <p role="alert" className="text-sm text-destructive">
              {errors.positionOrder.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-group">Group</Label>
        <Controller
          control={control}
          name="groupId"
          render={({ field }) => (
            <Select
              value={field.value ? field.value : NO_GROUP}
              onValueChange={(value) =>
                field.onChange(value === NO_GROUP ? "" : value)
              }
            >
              <SelectTrigger id="product-group">
                <SelectValue
                  placeholder={groupsQuery.isLoading ? "Loading…" : "No group"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP}>No group</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.groupId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.groupId.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Attributes</Label>
        <p className="text-sm text-muted-foreground">
          Position attribute values keyed by the group&apos;s axis names (e.g.
          color / blue).
        </p>
        <div className="flex flex-col gap-2">
          {attributeFields.map((attributeField, index) => (
            <div key={attributeField.id} className="flex items-center gap-2">
              <Input
                aria-label={`Attribute ${index + 1} key`}
                placeholder="key (e.g. color)"
                {...register(`attributes.${index}.key` as const)}
              />
              <Input
                aria-label={`Attribute ${index + 1} value`}
                placeholder="value (e.g. blue)"
                {...register(`attributes.${index}.value` as const)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove attribute ${index + 1}`}
                onClick={() => removeAttribute(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => appendAttribute({ key: "", value: "" })}
        >
          <Plus className="size-4" />
          Add attribute
        </Button>
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
