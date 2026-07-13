"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCategoryControllerGetAdminTree,
  type CategoryTreeNodeEntity,
} from "@/shared/api";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  carouselSchema,
  CAROUSEL_PLACEMENT,
  CAROUSEL_SOURCE,
  type CarouselFormInput,
  type CarouselFormValues,
  type CarouselSourceValue,
} from "../model/carousel-schema";

/** A selectable category, flattened out of the admin tree with its depth. */
interface CategoryOption {
  id: string;
  name: string;
  depth: number;
}

/**
 * Flatten the admin category tree keeping EVERY node (parents included), with
 * its depth for visual indent. Deliberately NOT `product-form`'s leaf-only
 * `collectLeafCategories`: a CATEGORY carousel legitimately targets a parent
 * category — `ProductService.findAll` rolls the subtree up on read (TASK-236),
 * so picking «Чохли» includes every продукт filed under its subcategories.
 */
export function flattenCategoryTree(
  nodes: CategoryTreeNodeEntity[],
  depth = 0,
): CategoryOption[] {
  const out: CategoryOption[] = [];
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, depth });
    if (node.children && node.children.length > 0) {
      out.push(...flattenCategoryTree(node.children, depth + 1));
    }
  }
  return out;
}

interface CarouselFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different
   *  carousel, never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<CarouselFormInput>;
  onSubmit: (values: CarouselFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  /**
   * Optional slot rendered below the fields — receives the LIVE selected
   * `source` so the edit view can show the MANUAL item picker the moment the
   * admin flips the source select, before saving (mirrors `product-form`'s
   * `renderSpecsSection` slot shape). Omitted in create mode (items cannot
   * exist before the carousel does).
   */
  renderItemsSection?: (source: CarouselSourceValue) => React.ReactNode;
}

/** Empty form baseline used for create mode and as the merge base in edit mode. */
const EMPTY_VALUES: CarouselFormInput = {
  title: "",
  source: "BESTSELLING",
  // Mirrors the API's create-time default (CreateCarouselDto.placement).
  placement: "HOME_RAILS",
  categoryId: "",
  itemLimit: "12",
  sortOrder: "0",
  status: "DRAFT",
  scheduledAt: "",
};

/**
 * Reusable create/edit carousel form: title, source select, placement select
 * (TASK-288 — tab inside the home "Популярне" section vs. its own rail below),
 * a conditional category select (visible only for `source = CATEGORY`, offering
 * ALL tree nodes — parents roll up their subtree), item limit (kept visible but
 * labelled as ignored for MANUAL), sort order, plus the shared publish
 * controls (status / scheduledAt) — byte-for-byte the `BannerForm` block.
 */
export function CarouselForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.carouselForm.submit,
  renderItemsSection,
}: CarouselFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CarouselFormInput, unknown, CarouselFormValues>({
    resolver: zodResolver(carouselSchema),
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

  const statusValue = useWatch({ control, name: "status" });
  const sourceValue = useWatch({ control, name: "source" }) ?? "BESTSELLING";

  // Full admin tree (ALL nodes, inactive included) so an existing carousel
  // pointed at a now-hidden category still shows it selected.
  const categoriesQuery = useCategoryControllerGetAdminTree();
  const categoryOptions = flattenCategoryTree(categoriesQuery.data?.data ?? []);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex max-w-2xl flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="carousel-title">{dict.carouselForm.title}</Label>
          <Input id="carousel-title" {...register("title")} />
          {errors.title && (
            <p role="alert" className="text-sm text-destructive">
              {errors.title.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="carousel-source">{dict.carouselForm.source}</Label>
          <select
            id="carousel-source"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            {...register("source")}
          >
            {CAROUSEL_SOURCE.map((value) => (
              <option key={value} value={value}>
                {dict.carouselForm.sourceOptions[value]}
              </option>
            ))}
          </select>
        </div>

        {sourceValue === "CATEGORY" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="carousel-category">
              {dict.carouselForm.category}
            </Label>
            <select
              id="carousel-category"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              {...register("categoryId")}
            >
              <option value="">{dict.carouselForm.categoryPlaceholder}</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {`${" ".repeat(option.depth * 2)}${option.name}`}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.categoryId.message}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="carousel-placement">
            {dict.carouselForm.placement}
          </Label>
          <select
            id="carousel-placement"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            {...register("placement")}
          >
            {CAROUSEL_PLACEMENT.map((value) => (
              <option key={value} value={value}>
                {dict.carouselForm.placementOptions[value]}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            {dict.carouselForm.placementHint}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="carousel-item-limit">
            {dict.carouselForm.itemLimit}
          </Label>
          <Input
            id="carousel-item-limit"
            type="number"
            inputMode="numeric"
            min="1"
            max="24"
            step="1"
            {...register("itemLimit")}
          />
          <p className="text-sm text-muted-foreground">
            {dict.carouselForm.itemLimitHint}
          </p>
          {errors.itemLimit && (
            <p role="alert" className="text-sm text-destructive">
              {errors.itemLimit.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="carousel-sort">{dict.carouselForm.sortOrder}</Label>
          <Input
            id="carousel-sort"
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
          <Label htmlFor="carousel-status">{dict.carouselForm.status}</Label>
          <select
            id="carousel-status"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            {...register("status")}
          >
            <option value="DRAFT">{dict.carouselForm.statusDraft}</option>
            <option value="SCHEDULED">
              {dict.carouselForm.statusScheduled}
            </option>
            <option value="PUBLISHED">
              {dict.carouselForm.statusPublished}
            </option>
          </select>
        </div>

        {statusValue === "SCHEDULED" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="carousel-scheduled-at">
              {dict.carouselForm.scheduledAt}
            </Label>
            <Input
              id="carousel-scheduled-at"
              type="datetime-local"
              {...register("scheduledAt")}
            />
            <p className="text-sm text-muted-foreground">
              {dict.carouselForm.scheduledAtHint}
            </p>
            {errors.scheduledAt && (
              <p role="alert" className="text-sm text-destructive">
                {errors.scheduledAt.message}
              </p>
            )}
          </div>
        )}
      </div>

      {renderItemsSection?.(sourceValue)}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
