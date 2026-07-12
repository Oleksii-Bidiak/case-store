"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  flattenAdminCategoryTree,
  useCategoryControllerGetAdminTree,
} from "@/entities/category";
import { descendantsOf } from "@/shared/lib/sortable-tree";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { slugify } from "@/shared/lib";
import {
  resolveSeoPreviewTitle,
  resolveSeoPreviewDescription,
  resolveEffectiveTitleTemplate,
} from "@/shared/lib/seo";
import {
  Button,
  FormActionsBar,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SeoSnippetPreview,
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
  isActive: true,
  metaTitle: "",
  metaDescription: "",
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

  // TASK-291 (§3.11 / §7.6.3): the parent <Select> is the WCAG 2.2 SC 2.5.7
  // non-dragging fallback and the no-JS fallback, so it is KEPT — but it is fed
  // from the COMPLETE admin tree, not from the 100-row-capped flat admin list.
  // A capped page is a PARTIAL graph: a descendant beyond the cap is simply
  // absent, so a descendant-exclusion computed over it silently UNDER-excludes
  // (and a legitimate parent may not be selectable at all). Options are indented
  // by their tree depth, and SELF *plus all descendants* are excluded.
  const categoriesQuery = useCategoryControllerGetAdminTree();
  const treeItems = useMemo(
    () => flattenAdminCategoryTree(categoriesQuery.data?.data),
    [categoriesQuery.data],
  );
  const parentOptions = useMemo(() => {
    if (!excludeParentId) return treeItems;
    const excluded = descendantsOf(treeItems, excludeParentId);
    return treeItems.filter(
      (item) => item.id !== excludeParentId && !excluded.has(item.id),
    );
  }, [treeItems, excludeParentId]);

  // Live SERP preview (TASK-268): resolve the exact title/description the
  // storefront would render for this category page through the same three-tier
  // precedence. `name` is not otherwise watched, so add it here alongside the
  // meta fields; `SeoSettings` feeds tier-2 defaults + the title template.
  const nameValue = useWatch({ control, name: "name" }) ?? "";
  const descriptionValue = useWatch({ control, name: "description" }) ?? "";
  const metaTitleValue = useWatch({ control, name: "metaTitle" }) ?? "";
  const metaDescriptionValue =
    useWatch({ control, name: "metaDescription" }) ?? "";
  const seoSettings = useSeoSettingsControllerGetSettings().data?.data;
  const previewTitle = resolveSeoPreviewTitle({
    entityTitle: metaTitleValue,
    defaultTitle: seoSettings?.defaultMetaTitle,
    contentName: nameValue,
    titleTemplate: resolveEffectiveTitleTemplate(
      seoSettings?.titleTemplate,
      dict.brand,
    ),
  });
  const previewDescription = resolveSeoPreviewDescription({
    entityDescription: metaDescriptionValue,
    defaultDescription: seoSettings?.defaultMetaDescription,
    contentDescription: descriptionValue,
  });
  // A category's public listing is /products?categoryId=…; the breadcrumb shows
  // a readable slug (create mode has no real slug yet → placeholder).
  const previewSlug = nameValue.trim()
    ? slugify(nameValue)
    : dict.seoSnippetPreview.newCategorySlug;

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

      {/* TASK-291-K: the "Порядок сортування" number input that used to sit next
          to this Select is GONE — sibling order is owned by the treegrid alone.
          The parent Select stays (§7.6.3, WCAG 2.5.7 non-dragging fallback). */}
      <div className="flex flex-col gap-5">
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
                      {/* Depth indent via padding, not text: a text prefix would
                          leak into the option's accessible name. */}
                      <span
                        className="inline-block"
                        style={{
                          paddingInlineStart: `${(category.depth - 1) * 12}px`,
                        }}
                      >
                        {category.label}
                      </span>
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
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-meta-title">
          {dict.categoryForm.metaTitle}
        </Label>
        <Input
          id="category-meta-title"
          placeholder={dict.categoryForm.metaTitlePlaceholder}
          {...register("metaTitle")}
        />
        {errors.metaTitle && (
          <p role="alert" className="text-sm text-destructive">
            {errors.metaTitle.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-meta-description">
          {dict.categoryForm.metaDescription}
        </Label>
        <Textarea
          id="category-meta-description"
          rows={3}
          placeholder={dict.categoryForm.metaDescriptionPlaceholder}
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
        url={`${dict.seoSnippetPreview.urlHost} › products › ${previewSlug}`}
        rawTitleLength={metaTitleValue.trim().length}
        rawDescriptionLength={metaDescriptionValue.trim().length}
      />

      <div className="flex items-center gap-2">
        <input
          id="category-active"
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        <Label htmlFor="category-active">{dict.categoryForm.active}</Label>
      </div>

      <FormActionsBar>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </FormActionsBar>
    </form>
  );
}
