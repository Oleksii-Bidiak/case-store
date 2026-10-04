"use client";

import * as React from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import {
  useCategoryControllerGetAdminTree,
  type CategoryTreeNodeEntity,
} from "@/shared/api";
import { useProductGroupControllerFindAll } from "@/entities/product-group";
import { useBrandControllerAdminFindAll } from "@/entities/brand";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { useMediaControllerUpload } from "@/entities/media";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { slugify } from "@/shared/lib";
import {
  resolveSeoPreviewTitle,
  resolveSeoPreviewDescription,
  resolveEffectiveTitleTemplate,
  resolvePreviewSiteName,
} from "@/shared/lib/seo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  CollapsibleSection,
  FormActionsBar,
  FormSectionNav,
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
  type FormSection,
  type StatusDotTone,
} from "@/shared/ui";
import {
  ContentImageField,
  useImageUploadField,
} from "@/features/content-image-upload";
import { MediaPicker, MediaPickerEditorButton } from "@/features/media-picker";
import { dict, STOREFRONT_HOST } from "@/shared/config";
import {
  productSchema,
  type ProductFormInput,
  type ProductFormValues,
} from "../model/product-schema";
import { OptionCombobox } from "./option-combobox";

const t = dict.productForm;

/* ── sections ───────────────────────────────────────────────────────────── */

/** The form's sections, in page order (ProductFormProposal Ф1). */
export type ProductFormSectionId =
  | "main"
  | "price"
  | "description"
  | "specs"
  | "photos"
  | "compat"
  | "addons"
  | "seo";

const SECTION_LABEL: Record<ProductFormSectionId, string> = {
  main: t.sectionMain,
  price: t.sectionPrice,
  description: t.sectionDescription,
  specs: t.sectionSpecs,
  photos: t.sectionPhotos,
  compat: t.sectionCompat,
  addons: t.sectionAddons,
  seo: t.sectionSeo,
};

/** Which form fields live in which section — drives the «є зміни» dots. */
const FIELD_SECTION: Record<keyof ProductFormInput, ProductFormSectionId> = {
  name: "main",
  slug: "main",
  categoryId: "main",
  brandId: "main",
  groupId: "main",
  positionOrder: "main",
  attributes: "main",
  price: "price",
  compareAtPrice: "price",
  sku: "price",
  stock: "price",
  description: "description",
  metaTitle: "seo",
  metaDescription: "seo",
  keywords: "seo",
  ogImage: "seo",
};

/** The section's title as the bar lists it. */
export function productFormSectionLabel(id: ProductFormSectionId): string {
  return SECTION_LABEL[id];
}

const sectionAnchor = (id: ProductFormSectionId) => `product-section-${id}`;

/* ── category tree → picker options ─────────────────────────────────────── */

/**
 * The category tree as picker options (TASK-236, wave 198): every node with its
 * depth (real indentation, no «— » prefixes), branches shown as non-pickable
 * headings — a product is filed on a LEAF, and the backend rolls parents up to
 * their subtree on read. A root with no children is a leaf and stays pickable.
 * `description` carries the ancestor path for the search results.
 */
function categoryOptionsOf(
  nodes: readonly CategoryTreeNodeEntity[],
  depth = 0,
  ancestors: string[] = [],
): ComboboxOption[] {
  const out: ComboboxOption[] = [];
  for (const node of nodes) {
    const isBranch = Boolean(node.children && node.children.length > 0);
    out.push({
      value: node.id,
      label: node.name,
      depth,
      disabled: isBranch || undefined,
      description: ancestors.length > 0 ? ancestors.join(" › ") : undefined,
    });
    if (isBranch) {
      out.push(
        ...categoryOptionsOf(node.children ?? [], depth + 1, [
          ...ancestors,
          node.name,
        ]),
      );
    }
  }
  return out;
}

/* ── props ──────────────────────────────────────────────────────────────── */

export interface ProductFormSubmitContext {
  /** Any form field differs from what was loaded. */
  mainDirty: boolean;
  /** Titles of the sections whose FORM fields changed («Основне», «Опис»…). */
  mainSections: string[];
}

export interface ProductFormSubmitResult {
  /** The product's own fields were written — the form becomes pristine. */
  mainSaved: boolean;
}

interface ProductFormProps {
  /**
   * Entity id (edit mode). The form re-seeds through RHF's `values` +
   * `keepDirtyValues`, so it needs no id — but the rich-text editor's "the
   * admin has edited here" latch is per entity (forms.md Rule 2b).
   */
  id?: string;
  defaultValues?: Partial<ProductFormInput>;
  /**
   * The page's save. May be async and report whether the product fields were
   * written, so the form can mark itself pristine (wave 198: the one
   * «Зберегти» also saves sections with their own endpoints).
   */
  onSubmit: (
    values: ProductFormValues,
    context: ProductFormSubmitContext,
  ) => void | Promise<ProductFormSubmitResult | void>;
  isPending: boolean;
  /** Each screen names its own action («Створити товар» / «Зберегти»). */
  submitLabel: string;
  /**
   * The «Характеристики» section body — receives the LIVE selected category
   * so the structured-spec editor tracks an in-form category change (TASK-191).
   */
  renderSpecsSection?: (categoryId: string) => React.ReactNode;
  /** «Фото» — saves on its own (uploads, reorder): never in the dirty list. */
  photosSection?: React.ReactNode;
  /** «Сумісні пристрої». */
  compatSection?: React.ReactNode;
  /** «Додаткові послуги» — saves per action, like the photos. */
  addonsSection?: React.ReactNode;
  /** Right column: publication (edit mode). */
  aside?: React.ReactNode;
  /** Above the sections — e.g. what a save left unsaved. */
  alert?: React.ReactNode;
  /** Derived stock breakdown (TASK-254) — edit mode only. */
  stockInfo?: { reservedQty: number; physicalQty: number };
  /**
   * The product is on the storefront: its address changes only through
   * «Змінити…» → «Змінити адресу товару?» (TASK-285, Ф4) — never by a stray
   * keystroke, and never with a `window.confirm` at save time.
   */
  slugLocked?: boolean;
  /** Sections with unsaved edits outside this form (specs, compat). */
  externalDirty?: Partial<Record<ProductFormSectionId, boolean>>;
  /** Sections with an unmet publication check — a «не заповнено» dot. */
  missingSections?: readonly string[];
  /** «Скасувати зміни» also throws away the external sections' edits. */
  onDiscard?: () => void;
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

const SEO_FIELDS = ["metaTitle", "metaDescription", "keywords", "ogImage"];

function discountPercent(price: string, compare: string): number | null {
  const p = Number(price);
  const c = Number(compare);
  if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0 || c <= p) {
    return null;
  }
  return Math.round(((c - p) / c) * 100);
}

/**
 * The product form, laid out by ProductFormProposal Ф1–Ф5 (wave 198,
 * TASK-1050): a section index on the left with a state dot per section
 * (unsaved = primary, not filled for publication = warning, fine = success),
 * the sections as cards in the middle, the page's aside on the right, and ONE
 * sticky «Зберегти» bar that names the sections with unsaved changes.
 *
 * The form owns the product's FIELDS; the specs, photos, compatibility and
 * add-on sections are slots the page fills — the specs and compatibility are
 * saved by the page's one save (they report their dirtiness back as
 * `externalDirty`), photos and add-ons keep saving per action.
 *
 * Numeric fields are bound as text inputs; the zod schema parses them before
 * `onSubmit`. Edit mode seeds through `values` + `keepDirtyValues`
 * (docs/conventions/forms.md Rule 2a).
 */
export function ProductForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  renderSpecsSection,
  photosSection,
  compatSection,
  addonsSection,
  aside,
  alert,
  stockInfo,
  slugLocked = false,
  externalDirty,
  missingSections = [],
  onDiscard,
}: ProductFormProps) {
  const formId = React.useId();
  const {
    register,
    control,
    setValue,
    getValues,
    reset,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: EMPTY_VALUES,
    values: defaultValues ? { ...EMPTY_VALUES, ...defaultValues } : undefined,
    resetOptions: { keepDirtyValues: true },
  });

  const {
    fields: attributeFields,
    append: appendAttribute,
    remove: removeAttribute,
  } = useFieldArray({ control, name: "attributes" });

  const nameValue = useWatch({ control, name: "name" });
  const slugValue = useWatch({ control, name: "slug" }) ?? "";
  const categoryIdValue = useWatch({ control, name: "categoryId" });
  const priceValue = useWatch({ control, name: "price" }) ?? "";
  const compareValue = useWatch({ control, name: "compareAtPrice" }) ?? "";
  const keywordsValue = useWatch({ control, name: "keywords" }) ?? "";

  // Live SERP preview (TASK-268).
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

  // TASK-728: the social-card image takes a file and a library pick as well as
  // a link — see the note in git history; unchanged by wave 198.
  const { can } = useAuth();
  const ogImageValue = useWatch({ control, name: "ogImage" }) ?? "";
  const ogImageUpload = useImageUploadField({
    upload: useMediaControllerUpload(),
    copy: dict.seoFields.ogImageUpload,
    onUploaded: (url) =>
      setValue("ogImage", url, { shouldDirty: true, shouldValidate: true }),
  });

  // TASK-236: leaves of the FULL admin tree (inactive ones included).
  const categoriesQuery = useCategoryControllerGetAdminTree();
  const categoryOptions = React.useMemo(
    () => categoryOptionsOf(categoriesQuery.data?.data ?? []),
    [categoriesQuery.data],
  );
  const categoryName =
    categoryOptions.find((option) => option.value === categoryIdValue)?.label ??
    "";

  const groupsQuery = useProductGroupControllerFindAll();
  const groups = groupsQuery.data?.data ?? [];
  // Brand picker (TASK-189): the admin list includes inactive brands.
  const brandsQuery = useBrandControllerAdminFindAll({ limit: 100 });
  const brands = brandsQuery.data?.data ?? [];
  const groupOptions: ComboboxOption[] = groups.map((group) => ({
    value: group.id,
    label: group.name,
  }));
  const brandOptions: ComboboxOption[] = brands.map((brand) => ({
    value: brand.id,
    label: brand.name,
  }));

  /* ── dirtiness, per section ──────────────────────────────────────────── */

  const dirtyIds = new Set<ProductFormSectionId>();
  for (const key of Object.keys(dirtyFields) as (keyof ProductFormInput)[]) {
    const value = dirtyFields[key];
    const touched = Array.isArray(value)
      ? value.some((entry) =>
          entry && typeof entry === "object"
            ? Object.values(entry).some(Boolean)
            : Boolean(entry),
        )
      : Boolean(value);
    if (touched && FIELD_SECTION[key]) dirtyIds.add(FIELD_SECTION[key]);
  }
  const mainDirty = dirtyIds.size > 0;
  const mainSections = (Object.keys(SECTION_LABEL) as ProductFormSectionId[])
    .filter((section) => dirtyIds.has(section))
    .map((section) => SECTION_LABEL[section]);
  for (const [section, dirty] of Object.entries(externalDirty ?? {})) {
    if (dirty) dirtyIds.add(section as ProductFormSectionId);
  }

  const sectionIds: ProductFormSectionId[] = [
    "main",
    "price",
    "description",
    ...(renderSpecsSection ? (["specs"] as const) : []),
    ...(photosSection ? (["photos"] as const) : []),
    ...(compatSection ? (["compat"] as const) : []),
    ...(addonsSection ? (["addons"] as const) : []),
    "seo",
  ];

  const navSections: FormSection[] = sectionIds.map((section) => {
    const tone: StatusDotTone = dirtyIds.has(section)
      ? "primary"
      : missingSections.includes(section)
        ? "warning"
        : "success";
    return {
      id: sectionAnchor(section),
      label: SECTION_LABEL[section],
      status: tone,
      statusLabel:
        tone === "primary"
          ? t.statusDirty
          : tone === "warning"
            ? t.statusMissing
            : t.statusDone,
    };
  });
  const dirtyLabels = sectionIds
    .filter((section) => dirtyIds.has(section))
    .map((section) => SECTION_LABEL[section]);

  /* ── SEO block: folded in edit mode, opened by its own errors ─────────── */

  const [seoOpen, setSeoOpen] = React.useState(!defaultValues);
  const onInvalid = (invalid: FieldErrors<ProductFormInput>) => {
    if (SEO_FIELDS.some((field) => field in invalid)) setSeoOpen(true);
  };
  const tagCount = keywordsValue
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean).length;
  const seoSummary = [
    t.seoSummaryMeta(
      Boolean(metaTitleValue.trim() || metaDescriptionValue.trim()),
    ),
    t.seoSummaryOg(Boolean(ogImageValue.trim())),
    t.seoSummaryTags(tagCount),
  ].join(", ");

  /* ── slug dialog (TASK-285, Ф4) ───────────────────────────────────────── */

  const [slugDialogOpen, setSlugDialogOpen] = React.useState(false);
  const [slugDraft, setSlugDraft] = React.useState("");
  const slugDraftId = React.useId();

  const submit = handleSubmit(async (values) => {
    const result = await onSubmit(values, { mainDirty, mainSections });
    if (result?.mainSaved) {
      // Pristine at what was just written; the refetch then lands on equal
      // values (Rule 2a), so nothing flickers back to «є зміни».
      reset(getValues(), { keepDirtyValues: false, keepFieldsRef: true });
    }
  }, onInvalid);

  const discount = discountPercent(priceValue, compareValue);

  const fieldError = (message?: string) =>
    message ? (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <FormSectionNav
          sections={navSections}
          aria-label={t.sectionsNav}
          className="lg:w-42 lg:shrink-0"
        />

        <form
          id={formId}
          onSubmit={(event) => void submit(event)}
          className="flex min-w-0 flex-1 flex-col gap-4"
          noValidate
        >
          {alert}

          {/* ── Основне ────────────────────────────────────────────── */}
          <SectionCard id="main">
            <div className="flex flex-col gap-1.5">
              <RequiredLabel htmlFor="product-name">{t.name}</RequiredLabel>
              <Input
                id="product-name"
                aria-required="true"
                aria-invalid={errors.name ? true : undefined}
                {...register("name")}
              />
              {fieldError(errors.name?.message)}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-slug">{t.slug}</Label>
              {slugLocked ? (
                <>
                  <div className="flex gap-2">
                    <div className="flex h-9 min-w-0 flex-1 items-center rounded-md border bg-muted px-3 font-mono text-sm">
                      <span className="text-muted-foreground">
                        {t.slugPrefix}
                      </span>
                      <input
                        id="product-slug"
                        readOnly
                        value={slugValue}
                        className="min-w-0 flex-1 truncate bg-transparent text-foreground outline-none"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSlugDraft(slugValue);
                        setSlugDialogOpen(true);
                      }}
                    >
                      {t.slugChange}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.slugLockedHint}
                  </p>
                </>
              ) : (
                <>
                  <Input
                    id="product-slug"
                    placeholder={t.slugPlaceholder}
                    {...register("slug")}
                  />
                  {!slugValue && nameValue.trim().length > 0 && (
                    <p
                      className="text-sm text-muted-foreground"
                      data-testid="slug-preview"
                    >
                      {t.slugPreview(slugify(nameValue))}
                    </p>
                  )}
                </>
              )}
              {fieldError(errors.slug?.message)}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <RequiredLabel htmlFor="product-category">
                  {t.category}
                </RequiredLabel>
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
                      placeholder={t.categoryPlaceholder}
                      aria-invalid={errors.categoryId ? true : undefined}
                    />
                  )}
                />
                {fieldError(errors.categoryId?.message)}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-brand">{t.brand}</Label>
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
                      placeholder={t.brandNone}
                      clearLabel={t.brandNone}
                      aria-invalid={errors.brandId ? true : undefined}
                    />
                  )}
                />
                {fieldError(errors.brandId?.message)}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-group">{t.group}</Label>
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
                      placeholder={t.groupNone}
                      // «Без групи» is a real entry: the operator can take
                      // the product back out of a group.
                      clearLabel={t.groupNone}
                      aria-invalid={errors.groupId ? true : undefined}
                    />
                  )}
                />
                {fieldError(errors.groupId?.message)}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-position-order">
                  {t.positionOrder}
                </Label>
                <Input
                  id="product-position-order"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  {...register("positionOrder")}
                />
                {fieldError(errors.positionOrder?.message)}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t.attributes}</Label>
              <p className="text-sm text-muted-foreground">
                {t.attributesHint}
              </p>
              <div className="flex flex-col gap-2">
                {attributeFields.map((attributeField, index) => (
                  <div
                    key={attributeField.id}
                    className="flex items-center gap-2"
                  >
                    <Input
                      aria-label={t.attrKeyAria(index + 1)}
                      placeholder={t.attrKeyPlaceholder}
                      {...register(`attributes.${index}.key` as const)}
                    />
                    <Input
                      aria-label={t.attrValueAria(index + 1)}
                      placeholder={t.attrValuePlaceholder}
                      {...register(`attributes.${index}.value` as const)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t.removeAttrAria(index + 1)}
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
                {t.addAttribute}
              </Button>
            </div>
          </SectionCard>

          {/* ── Ціна і склад ───────────────────────────────────────── */}
          <SectionCard id="price">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <RequiredLabel htmlFor="product-price">{t.price}</RequiredLabel>
                <Input
                  id="product-price"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  aria-required="true"
                  aria-invalid={errors.price ? true : undefined}
                  {...register("price")}
                />
                {fieldError(errors.price?.message)}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-compare-price">
                  {t.compareAtPrice}
                </Label>
                <Input
                  id="product-compare-price"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  {...register("compareAtPrice")}
                />
                {discount !== null ? (
                  <p className="text-xs text-muted-foreground">
                    {t.compareAtHint(discount)}
                  </p>
                ) : null}
                {fieldError(errors.compareAtPrice?.message)}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-sku">{t.sku}</Label>
                <Input id="product-sku" {...register("sku")} />
                {fieldError(errors.sku?.message)}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-stock">{t.stock}</Label>
                <Input
                  id="product-stock"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  {...register("stock")}
                />
                {fieldError(errors.stock?.message)}
              </div>

              <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:col-span-2 sm:pt-6">
                {stockInfo && (
                  <p className="text-foreground tabular-nums">
                    {t.stockBreakdownHint(
                      stockInfo.physicalQty,
                      stockInfo.reservedQty,
                    )}
                  </p>
                )}
                <p className="text-xs">{t.stockHint}</p>
              </div>
            </div>
          </SectionCard>

          {/* ── Опис ──────────────────────────────────────────────── */}
          <SectionCard id="description" title={t.description}>
            {/* Rich text since TASK-361 — the same editor/preview pair the
                blog and static pages use. Radix unmounts the inactive panel,
                which is safe: the editor is fully controlled by the field. */}
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
                      placeholder={t.descriptionPlaceholder}
                      disabled={isPending}
                      // TASK-547 — the media library is handed in.
                      imagePicker={(insert) => (
                        <MediaPickerEditorButton insert={insert} />
                      )}
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
            {fieldError(errors.description?.message)}
          </SectionCard>

          {/* ── Характеристики (own endpoint, saved by the bar) ───── */}
          {renderSpecsSection ? (
            <SectionCard
              id="specs"
              hint={
                categoryName ? t.specsTemplateHint(categoryName) : undefined
              }
            >
              {renderSpecsSection(categoryIdValue)}
            </SectionCard>
          ) : null}

          {photosSection ? (
            <SectionCard id="photos">{photosSection}</SectionCard>
          ) : null}

          {compatSection ? (
            <SectionCard id="compat" title={dict.productCompat.title}>
              {compatSection}
            </SectionCard>
          ) : null}

          {addonsSection ? (
            <section
              id={sectionAnchor("addons")}
              aria-label={SECTION_LABEL.addons}
              className="flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
            >
              {addonsSection}
            </section>
          ) : null}

          {/* ── SEO і соцмережі — folded to a summary (Ф1) ─────────── */}
          <CollapsibleSection
            id={sectionAnchor("seo")}
            title={SECTION_LABEL.seo}
            summary={seoSummary}
            open={seoOpen}
            onOpenChange={setSeoOpen}
            className="scroll-mt-4"
          >
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-meta-title">{t.metaTitle}</Label>
                <Input
                  id="product-meta-title"
                  placeholder={t.metaTitlePlaceholder}
                  {...register("metaTitle")}
                />
                <p className="text-sm text-muted-foreground">
                  {t.metaTitleHint}
                </p>
                {fieldError(errors.metaTitle?.message)}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-meta-description">
                  {t.metaDescription}
                </Label>
                <Textarea
                  id="product-meta-description"
                  rows={3}
                  placeholder={t.metaDescriptionPlaceholder}
                  {...register("metaDescription")}
                />
                <p className="text-sm text-muted-foreground">
                  {t.metaDescriptionHint}
                </p>
                {fieldError(errors.metaDescription?.message)}
              </div>

              {/* TASK-437 — tags and the social card sit above the SERP
                  preview because neither shows up in it. */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-keywords">
                  {dict.seoFields.keywords}
                </Label>
                <Input
                  id="product-keywords"
                  placeholder={dict.seoFields.keywordsPlaceholder}
                  {...register("keywords")}
                />
                <p className="text-sm text-muted-foreground">
                  {dict.seoFields.keywordsHint}
                </p>
                {fieldError(errors.keywords?.message)}
              </div>

              <div className="flex flex-col gap-1.5">
                <ContentImageField
                  id="product-og-image"
                  label={dict.seoFields.ogImage}
                  urlPlaceholder={dict.seoFields.ogImagePlaceholder(
                    STOREFRONT_HOST,
                  )}
                  copy={dict.seoFields.ogImageUpload}
                  value={ogImageValue}
                  urlInput={register("ogImage")}
                  onRemove={() =>
                    setValue("ogImage", "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  fieldError={errors.ogImage?.message}
                  canUpload={can(PERM.mediaWrite)}
                  picker={
                    <MediaPicker
                      ariaLabel={dict.seoFields.ogImagePickerAria}
                      onPick={(asset) =>
                        setValue("ogImage", asset.url, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    />
                  }
                  {...ogImageUpload}
                />
                <p className="text-sm text-muted-foreground">
                  {dict.seoFields.ogImageHint}
                </p>
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
            </div>
          </CollapsibleSection>

          {/* No `isActive` control here on purpose (TASK-361): visibility is
              owned by the publication panel and its readiness checklist. */}
        </form>

        {aside ? (
          <aside className="flex flex-col gap-4 lg:sticky lg:top-0 lg:w-65 lg:shrink-0">
            {aside}
          </aside>
        ) : null}
      </div>

      <FormActionsBar
        variant="sticky"
        formId={formId}
        dirtySections={dirtyLabels}
        onDiscard={() => {
          // Explicitly back to what was loaded. `reset` merges the form's
          // `resetOptions` in, so `keepDirtyValues: false` must be said out
          // loud — otherwise it keeps exactly the edits being discarded.
          // `keepFieldsRef` writes the values into the mounted inputs.
          reset(
            defaultValues
              ? { ...EMPTY_VALUES, ...defaultValues }
              : EMPTY_VALUES,
            { keepDirtyValues: false, keepFieldsRef: true },
          );
          setSeoOpen(!defaultValues);
          onDiscard?.();
        }}
        saveLabel={isPending ? dict.common.saving : submitLabel}
        isSaving={isPending}
      />

      <AlertDialog open={slugDialogOpen} onOpenChange={setSlugDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.slugDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.slugDialogDescription(
                (defaultValues?.slug as string | undefined) ?? slugValue,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={slugDraftId}>{t.slugDialogLabel}</Label>
            <Input
              id={slugDraftId}
              value={slugDraft}
              onChange={(event) => setSlugDraft(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!slugDraft.trim() || slugDraft.trim() === slugValue}
              onClick={() =>
                setValue("slug", slugDraft.trim(), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              {t.slugDialogConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** A label with the required star (the input carries `aria-required`). */
function RequiredLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-0.5">
      <Label htmlFor={htmlFor}>{children}</Label>
      <span
        aria-hidden="true"
        title={t.requiredMark}
        className="text-sm text-destructive"
      >
        *
      </span>
    </div>
  );
}

/** One section of the form: a card with its title, anchored for the nav. */
function SectionCard({
  id,
  title,
  hint,
  children,
}: {
  id: ProductFormSectionId;
  /** Defaults to the section's nav label. */
  title?: string;
  /** Right-aligned muted note in the header («Список — із шаблону…»). */
  hint?: string;
  children: React.ReactNode;
}) {
  const headingId = `${sectionAnchor(id)}-title`;
  return (
    <section
      id={sectionAnchor(id)}
      aria-labelledby={headingId}
      className="flex scroll-mt-4 flex-col gap-4 rounded-lg border bg-card p-4 shadow-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {title ?? SECTION_LABEL[id]}
        </h3>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
