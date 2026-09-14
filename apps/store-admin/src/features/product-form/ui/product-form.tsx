"use client";

import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import {
  useCategoryControllerGetAdminTree,
  type CategoryTreeNodeEntity,
} from "@/shared/api";
import { useProductGroupControllerFindAll } from "@/entities/product-group";
import { useBrandControllerAdminFindAll } from "@/entities/brand";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { slugify } from "@/shared/lib";
import {
  resolveSeoPreviewTitle,
  resolveSeoPreviewDescription,
  resolveEffectiveTitleTemplate,
  resolvePreviewSiteName,
} from "@/shared/lib/seo";
import {
  Button,
  FormActionsBar,
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
  type ComboboxOption,
} from "@/shared/ui";
import { dict, STOREFRONT_HOST } from "@/shared/config";
import {
  productSchema,
  type ProductFormInput,
  type ProductFormValues,
} from "../model/product-schema";
import { OptionCombobox } from "./option-combobox";

/** A selectable LEAF category, flattened out of the admin tree with its depth. */
interface LeafCategoryOption {
  id: string;
  name: string;
  depth: number;
}

/**
 * Flatten the admin category tree to its LEAF nodes only (TASK-236): products
 * are filed against the specific subcategory they belong to, never a parent
 * bucket, and the backend rolls parents up to their subtree on read. `depth`
 * (0-based) drives the visual indent so staff still see ancestry. A node with
 * no `children` is a leaf regardless of level, so a shallow root with no
 * subcategories stays selectable.
 */
function collectLeafCategories(
  nodes: CategoryTreeNodeEntity[],
  depth = 0,
): LeafCategoryOption[] {
  const out: LeafCategoryOption[] = [];
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      out.push(...collectLeafCategories(node.children, depth + 1));
    } else {
      out.push({ id: node.id, name: node.name, depth });
    }
  }
  return out;
}

interface ProductFormProps {
  /**
   * Entity id (edit mode). The form itself re-seeds through RHF's `values` +
   * `keepDirtyValues`, so it needs no id — but the rich-text editor's
   * "the admin has edited here" latch is per entity (forms.md Rule 2b) and has
   * no other way to learn that a different product is now on screen.
   */
  id?: string;
  defaultValues?: Partial<ProductFormInput>;
  onSubmit: (values: ProductFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  /**
   * Optional slot rendered below the fields (TASK-191) — receives the LIVE
   * selected `categoryId` so an embedded structured-spec editor re-renders its
   * effective-definition set the moment the admin picks a different category,
   * before saving. Filled in BOTH modes since TASK-442: the create page passes a
   * staged editor (no product id, values held until `POST /products` answers),
   * so the two forms offer the same fields.
   */
  renderSpecsSection?: (categoryId: string) => React.ReactNode;
  /**
   * Derived stock breakdown (TASK-254) — passed in EDIT mode only. When present,
   * a dynamic line under the static stock hint shows the physical / reserved
   * split. Omitted in create mode (a brand-new product always has reservedQty 0,
   * so the line would be a no-op).
   */
  stockInfo?: { reservedQty: number; physicalQty: number };
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
  brandId: "",
  positionOrder: "0",
  attributes: [],
  metaTitle: "",
  metaDescription: "",
  keywords: "",
  ogImage: "",
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
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = dict.productForm.submit,
  renderSpecsSection,
  stockInfo,
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

  // Live slug preview: read-only observers on the same `control`. When the slug
  // field is blank, show what the backend would auto-derive from the name (the
  // `slugify` port mirrors the server's `generateSlug`). Pure render-time
  // computation — no state, no side effects (forms.md Rule 1/3 not triggered).
  const nameValue = useWatch({ control, name: "name" });
  const slugValue = useWatch({ control, name: "slug" });
  // Live selected category — drives the embedded structured-spec editor's
  // effective-definition set (TASK-191).
  const categoryIdValue = useWatch({ control, name: "categoryId" });

  // Live SERP preview (TASK-268): watch the meta fields and resolve the exact
  // title/description the storefront would render through the same three-tier
  // precedence. `SeoSettings` (tier-2 defaults + title template) is served from
  // the one shared TanStack Query cache entry `/settings/seo` already populates.
  const metaTitleValue = useWatch({ control, name: "metaTitle" }) ?? "";
  const metaDescriptionValue =
    useWatch({ control, name: "metaDescription" }) ?? "";
  const descriptionValue = useWatch({ control, name: "description" }) ?? "";
  const seoSettings = useSeoSettingsControllerGetSettings().data?.data;
  const previewSlug = slugValue || (nameValue.trim() ? slugify(nameValue) : "");
  const previewTitle = resolveSeoPreviewTitle({
    entityTitle: metaTitleValue,
    defaultTitle: seoSettings?.defaultMetaTitle,
    contentName: nameValue,
    titleTemplate: resolveEffectiveTitleTemplate(
      seoSettings?.titleTemplate,
      resolvePreviewSiteName(seoSettings),
    ),
  });
  const previewDescription = resolveSeoPreviewDescription({
    entityDescription: metaDescriptionValue,
    defaultDescription: seoSettings?.defaultMetaDescription,
    contentDescription: descriptionValue,
  });

  // TASK-236: the picker offers LEAF categories from the FULL admin tree
  // (including inactive ones) so a product is assigned to its specific
  // subcategory; the backend subtree rollup makes a parent filter still find it.
  const categoriesQuery = useCategoryControllerGetAdminTree();
  const leafCategories = collectLeafCategories(
    categoriesQuery.data?.data ?? [],
  );

  const groupsQuery = useProductGroupControllerFindAll();
  const groups = groupsQuery.data?.data ?? [];

  // Brand picker (TASK-189): the admin list includes inactive brands so a product
  // already tagged with a hidden brand still shows it selected. Brands are
  // low-volume (dozens), so a single high-limit page covers them.
  const brandsQuery = useBrandControllerAdminFindAll({ limit: 100 });
  const brands = brandsQuery.data?.data ?? [];

  // TASK-423: the three reference pickers as combobox option lists. The
  // category labels keep the em-dash indentation that showed tree depth in the
  // old Select — typing narrows the list, but the operator still needs to see
  // which «Чохли» is which.
  const categoryOptions: ComboboxOption[] = leafCategories.map((category) => ({
    value: category.id,
    label:
      category.depth > 0
        ? `${"— ".repeat(category.depth)}${category.name}`
        : category.name,
  }));
  const groupOptions: ComboboxOption[] = groups.map((group) => ({
    value: group.id,
    label: group.name,
  }));
  const brandOptions: ComboboxOption[] = brands.map((brand) => ({
    value: brand.id,
    label: brand.name,
  }));

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-name">{dict.productForm.name}</Label>
        <Input id="product-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-slug">{dict.productForm.slug}</Label>
        <Input
          id="product-slug"
          placeholder={dict.productForm.slugPlaceholder}
          {...register("slug")}
        />
        {!slugValue && nameValue.trim().length > 0 && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="slug-preview"
          >
            {dict.productForm.slugPreview(slugify(nameValue))}
          </p>
        )}
        {errors.slug && (
          <p role="alert" className="text-sm text-destructive">
            {errors.slug.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-description">
          {dict.productForm.description}
        </Label>
        {/* Rich text since TASK-361, using the very same editor/preview pair the
            blog and static pages already use (see `blog-post-form.tsx`). The
            description reaches the storefront as HTML, so the operator must be
            able to see what they are shipping — and the supplier catalogue
            import writes HTML into this same column. Radix unmounts the
            inactive panel, which is safe: the editor is fully controlled by the
            RHF field, so tabbing back re-seeds it from the current value. */}
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
              name="description"
              render={({ field }) => (
                <RichTextEditor
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  resetKey={id}
                  placeholder={dict.productForm.descriptionPlaceholder}
                  disabled={isPending}
                />
              )}
            />
          </TabsContent>
          <TabsContent value="preview">
            <RichTextPreview
              html={descriptionValue}
              emptyLabel={dict.contentPreview.emptyContent}
            />
          </TabsContent>
        </Tabs>
        {errors.description && (
          <p role="alert" className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-price">{dict.productForm.price}</Label>
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
          <Label htmlFor="product-compare-price">
            {dict.productForm.compareAtPrice}
          </Label>
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
          <Label htmlFor="product-sku">{dict.productForm.sku}</Label>
          <Input id="product-sku" {...register("sku")} />
          {errors.sku && (
            <p role="alert" className="text-sm text-destructive">
              {errors.sku.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-category">{dict.productForm.category}</Label>
          {/* TASK-423: a combobox, not a Select. The options are every LEAF of
              the whole admin tree — well past a hundred on a real catalogue —
              and a Select's only way to find one is to scroll.
              The native bubble-<select> "" bounce that both this picker and the
              two below had to defend against (TASK-232 / TASK-201) is gone with
              the Select: there is no hidden native select to coerce. */}
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <OptionCombobox
                id="product-category"
                value={field.value}
                onChange={field.onChange}
                options={categoryOptions}
                isLoading={categoriesQuery.isLoading}
                placeholder={dict.productForm.categoryPlaceholder}
                aria-invalid={errors.categoryId ? true : undefined}
              />
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
          <Label htmlFor="product-stock">{dict.productForm.stock}</Label>
          <Input
            id="product-stock"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            {...register("stock")}
          />
          <p className="text-sm text-muted-foreground">
            {dict.productForm.stockHint}
          </p>
          {stockInfo && (
            <p className="text-sm text-muted-foreground">
              {dict.productForm.stockBreakdownHint(
                stockInfo.physicalQty,
                stockInfo.reservedQty,
              )}
            </p>
          )}
          {errors.stock && (
            <p role="alert" className="text-sm text-destructive">
              {errors.stock.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-position-order">
            {dict.productForm.positionOrder}
          </Label>
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
        <Label htmlFor="product-group">{dict.productForm.group}</Label>
        <Controller
          control={control}
          name="groupId"
          render={({ field }) => (
            <OptionCombobox
              id="product-group"
              value={field.value ?? ""}
              onChange={field.onChange}
              options={groupOptions}
              isLoading={groupsQuery.isLoading}
              placeholder={dict.productForm.groupNone}
              // Optional field: «Без групи» is a real entry in the list, so the
              // operator can take the product back out of a group.
              clearLabel={dict.productForm.groupNone}
              aria-invalid={errors.groupId ? true : undefined}
            />
          )}
        />
        {errors.groupId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.groupId.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-brand">{dict.productForm.brand}</Label>
        <Controller
          control={control}
          name="brandId"
          render={({ field }) => (
            <OptionCombobox
              id="product-brand"
              value={field.value ?? ""}
              onChange={field.onChange}
              options={brandOptions}
              isLoading={brandsQuery.isLoading}
              placeholder={dict.productForm.brandNone}
              clearLabel={dict.productForm.brandNone}
              aria-invalid={errors.brandId ? true : undefined}
            />
          )}
        />
        {errors.brandId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.brandId.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{dict.productForm.attributes}</Label>
        <p className="text-sm text-muted-foreground">
          {dict.productForm.attributesHint}
        </p>
        <div className="flex flex-col gap-2">
          {attributeFields.map((attributeField, index) => (
            <div key={attributeField.id} className="flex items-center gap-2">
              <Input
                aria-label={dict.productForm.attrKeyAria(index + 1)}
                placeholder={dict.productForm.attrKeyPlaceholder}
                {...register(`attributes.${index}.key` as const)}
              />
              <Input
                aria-label={dict.productForm.attrValueAria(index + 1)}
                placeholder={dict.productForm.attrValuePlaceholder}
                {...register(`attributes.${index}.value` as const)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={dict.productForm.removeAttrAria(index + 1)}
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
          {dict.productForm.addAttribute}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-meta-title">{dict.productForm.metaTitle}</Label>
        <Input
          id="product-meta-title"
          placeholder={dict.productForm.metaTitlePlaceholder}
          {...register("metaTitle")}
        />
        <p className="text-sm text-muted-foreground">
          {dict.productForm.metaTitleHint}
        </p>
        {errors.metaTitle && (
          <p role="alert" className="text-sm text-destructive">
            {errors.metaTitle.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-meta-description">
          {dict.productForm.metaDescription}
        </Label>
        <Textarea
          id="product-meta-description"
          rows={3}
          placeholder={dict.productForm.metaDescriptionPlaceholder}
          {...register("metaDescription")}
        />
        <p className="text-sm text-muted-foreground">
          {dict.productForm.metaDescriptionHint}
        </p>
        {errors.metaDescription && (
          <p role="alert" className="text-sm text-destructive">
            {errors.metaDescription.message}
          </p>
        )}
      </div>

      {/* TASK-437 — tags and the social card sit inside the SEO block, above the
          SERP preview, because neither of them shows up in that preview: the
          preview is the Google snippet, these two are for internal search and
          for Facebook/Telegram. */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-keywords">{dict.seoFields.keywords}</Label>
        <Input
          id="product-keywords"
          placeholder={dict.seoFields.keywordsPlaceholder}
          {...register("keywords")}
        />
        <p className="text-sm text-muted-foreground">
          {dict.seoFields.keywordsHint}
        </p>
        {errors.keywords && (
          <p role="alert" className="text-sm text-destructive">
            {errors.keywords.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-og-image">{dict.seoFields.ogImage}</Label>
        <Input
          id="product-og-image"
          placeholder={dict.seoFields.ogImagePlaceholder(STOREFRONT_HOST)}
          {...register("ogImage")}
        />
        <p className="text-sm text-muted-foreground">
          {dict.seoFields.ogImageHint}
        </p>
        {errors.ogImage && (
          <p role="alert" className="text-sm text-destructive">
            {errors.ogImage.message}
          </p>
        )}
      </div>

      <SeoSnippetPreview
        title={previewTitle.text}
        titleTier={previewTitle.tier}
        description={previewDescription.text || undefined}
        descriptionTier={previewDescription.tier}
        url={`${STOREFRONT_HOST} › products › ${previewSlug}`}
        rawTitleLength={metaTitleValue.trim().length}
        rawDescriptionLength={metaDescriptionValue.trim().length}
      />

      {/* No `isActive` control here on purpose (TASK-361). Visibility is owned by
          `ProductPublishPanel`, which drives the activate/deactivate endpoints
          and gates going live on a readiness checklist. Leaving a checkbox here
          too would give two sources of truth for one flag — and the stale one
          would silently unpublish a product the moment someone pressed Save. */}

      {/* Structured-spec editor slot (TASK-191). Its own save action targets the
          separate specs endpoint; receives the live category so its inputs
          track an in-form category change. */}
      {renderSpecsSection?.(categoryIdValue)}

      <FormActionsBar>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </FormActionsBar>
    </form>
  );
}
