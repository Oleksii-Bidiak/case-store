"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type BaseSyntheticEvent,
  type FormEvent,
  type ReactNode,
} from "react";
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
  parseKeywords,
  resolveSeoPreviewTitle,
  resolveSeoPreviewDescription,
  resolveEffectiveTitleTemplate,
  resolvePreviewSiteName,
} from "@/shared/lib/seo";
import {
  CollapsibleSection,
  FieldError,
  FormActionsBar,
  FormSectionNav,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SeoSnippetPreview,
  Switch,
  Textarea,
  type FormSection,
} from "@/shared/ui";
import {
  ContentImageField,
  useImageUploadField,
  useUploadsControllerUploadCategoryImage,
} from "@/features/content-image-upload";
import { MediaPicker } from "@/features/media-picker";
import { dict, STOREFRONT_HOST } from "@/shared/config";
import {
  categorySchema,
  type CategoryFormInput,
  type CategoryFormValues,
} from "../model/category-schema";

const f = dict.categoryForm;
const ROOT_OPTION = "__root__";
const FORM_ID = "category-form";

/** Section anchors of the form's index (FormSectionNav). */
export const CATEGORY_SECTION_IDS = {
  main: "category-section-main",
  image: "category-section-image",
  seo: "category-section-seo",
} as const;

/** Which form fields belong to which section — drives the dirty / error dots. */
const MAIN_FIELDS = [
  "name",
  "slug",
  "description",
  "parentId",
  "isActive",
] as const;
const IMAGE_FIELDS = ["image"] as const;
const SEO_FIELDS = [
  "metaTitle",
  "metaDescription",
  "keywords",
  "ogImage",
] as const;

/** A section the host page slots between «Зображення» and SEO (edit mode). */
export interface CategoryFormExtraSection {
  /** The id of the section element inside `node` — the index anchor. */
  id: string;
  label: string;
  node: ReactNode;
}

interface CategoryFormProps {
  /** Entity id (edit mode). Drives the forms.md Rule 2b reset: the form
   *  re-seeds from `defaultValues` only when navigating to a different
   *  category, never on a background refetch. Omitted in create mode. */
  id?: string;
  defaultValues?: Partial<CategoryFormInput>;
  /**
   * The form's one «Зберегти». May return a promise: resolving to `true`
   * means everything saved and the form is clean again — it takes the
   * submitted values as its new baseline.
   */
  onSubmit: (
    values: CategoryFormValues,
    event?: BaseSyntheticEvent,
  ) => void | Promise<boolean | void>;
  isPending: boolean;
  submitLabel?: string;
  /** Current category id (edit mode) — excluded from the parent options so a
   *  category cannot be set as its own parent. */
  excludeParentId?: string;
  /** Sections owned by other features (characteristics, add-on services). */
  extraSections?: readonly CategoryFormExtraSection[];
  /** Labels of extra sections with unsaved edits — for the sticky bar. */
  extraDirtySections?: readonly string[];
  /** «Скасувати зміни» for the extra sections. */
  onDiscardExtra?: () => void;
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
  keywords: "",
  ogImage: "",
};

const errorId = (field: string) => `category-${field}-error`;

/**
 * Reusable create/edit category form — sectioned since wave 198
 * (CategoriesProposal КТ5): an index on the left, «Основне», «Зображення», the
 * host's extra sections, then «SEO і соцмережі» folded to a summary on an
 * existing category, and ONE sticky «Зберегти» that names what is unsaved.
 *
 * The parent selector lists existing categories (minus the category being
 * edited and its subtree) plus a "Root (no parent)" option mapped to an empty
 * parentId.
 */
export function CategoryForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
  excludeParentId,
  extraSections = [],
  extraDirtySections = [],
  onDiscardExtra,
}: CategoryFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors, dirtyFields },
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

  // КТ5: what switching «Показувати на сайті» off takes along — counted from
  // the tree already in memory; a new category has nothing to count yet.
  const visibilityHint = useMemo(() => {
    const self = id ? treeItems.find((item) => item.id === id) : undefined;
    if (!self) return f.hideConsequenceGeneric;
    return f.hideConsequence(
      descendantsOf(treeItems, self.id).size,
      self.subtreeProductCount,
    );
  }, [id, treeItems]);

  // TASK-424: the image field takes a FILE as well as a pasted link. The
  // uploaded URL is written through `setValue` — the form stays the single source
  // of truth for the field, so no local copy can disagree with an id-keyed
  // `reset()` (docs/conventions/forms.md).
  const imageValue = useWatch({ control, name: "image" }) ?? "";
  const imageUpload = useImageUploadField({
    upload: useUploadsControllerUploadCategoryImage(),
    copy: f.imageUpload,
    onUploaded: (url) =>
      setValue("image", url, { shouldDirty: true, shouldValidate: true }),
  });

  // TASK-728: the social-card image gets the same three paths as the tile
  // above — a file, a library pick, a link — through the same route (the form's
  // own `categories:write`), and is written through `setValue` for the same
  // reason. Its own mutation instance, so one field's spinner never shows on
  // the other.
  const ogImageValue = useWatch({ control, name: "ogImage" }) ?? "";
  const ogImageUpload = useImageUploadField({
    upload: useUploadsControllerUploadCategoryImage(),
    copy: dict.seoFields.ogImageUpload,
    onUploaded: (url) =>
      setValue("ogImage", url, { shouldDirty: true, shouldValidate: true }),
  });

  // Live SERP preview (TASK-268): resolve the exact title/description the
  // storefront would render for this category page through the same three-tier
  // precedence.
  const nameValue = useWatch({ control, name: "name" }) ?? "";
  const descriptionValue = useWatch({ control, name: "description" }) ?? "";
  const metaTitleValue = useWatch({ control, name: "metaTitle" }) ?? "";
  const metaDescriptionValue =
    useWatch({ control, name: "metaDescription" }) ?? "";
  const keywordsValue = useWatch({ control, name: "keywords" }) ?? "";
  const seoSettings = useSeoSettingsControllerGetSettings().data?.data;
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
  // A category's public listing is /products?categoryId=…; the breadcrumb shows
  // a readable slug (create mode has no real slug yet → placeholder).
  const previewSlug = nameValue.trim()
    ? slugify(nameValue)
    : dict.seoSnippetPreview.newCategorySlug;

  // SEO folds on an EXISTING category (most edits never touch it) and is open
  // on a new one, where there is nothing to summarise yet. An invalid field
  // inside forces it open — an error nobody can see is a dead «Зберегти».
  const [seoOpen, setSeoOpen] = useState(!id);
  const seoHasError = SEO_FIELDS.some((field) => errors[field]);

  const dirtyIn = (fields: readonly (keyof CategoryFormInput)[]) =>
    fields.some((field) => dirtyFields[field]);
  const errorIn = (fields: readonly (keyof CategoryFormInput)[]) =>
    fields.some((field) => errors[field]);

  const ownSections = [
    {
      id: CATEGORY_SECTION_IDS.main,
      label: f.sectionMain,
      dirty: dirtyIn(MAIN_FIELDS),
      error: errorIn(MAIN_FIELDS),
    },
    {
      id: CATEGORY_SECTION_IDS.image,
      label: f.sectionImage,
      dirty: dirtyIn(IMAGE_FIELDS),
      error: errorIn(IMAGE_FIELDS),
    },
  ];
  const seoSection = {
    id: CATEGORY_SECTION_IDS.seo,
    label: f.sectionSeo,
    dirty: dirtyIn(SEO_FIELDS),
    error: seoHasError,
  };
  const allSections = [
    ...ownSections,
    ...extraSections.map((section) => ({
      id: section.id,
      label: section.label,
      dirty: extraDirtySections.includes(section.label),
      error: false,
    })),
    seoSection,
  ];

  const navSections: FormSection[] = allSections.map((section) => ({
    id: section.id,
    label: section.label,
    ...(section.error
      ? { status: "warning" as const, statusLabel: f.sectionError }
      : section.dirty
        ? { status: "primary" as const, statusLabel: f.sectionDirty }
        : {}),
  }));
  // In form order: own sections, then the host's, then SEO.
  const dirtySections = [
    ...ownSections.filter((section) => section.dirty).map((s) => s.label),
    ...extraDirtySections,
    ...(seoSection.dirty ? [seoSection.label] : []),
  ];

  const submit = async (
    values: CategoryFormValues,
    event?: BaseSyntheticEvent,
  ) => {
    const saved = await onSubmit(values, event);
    // Everything went through: what was submitted is the new baseline.
    if (saved === true) reset(getValues());
  };

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    // A submit bubbling up the REACT tree from a portalled form inside an extra
    // section (the characteristic dialog) is that form's business, not ours.
    if (event.target !== event.currentTarget) return;
    void handleSubmit(submit, (invalid) => {
      if (SEO_FIELDS.some((field) => invalid[field])) setSeoOpen(true);
    })(event);
  };

  const fieldA11y = (field: keyof CategoryFormInput, hintId?: string) => {
    const describedBy = [hintId, errors[field] ? errorId(field) : undefined]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };

  return (
    <form
      id={FORM_ID}
      onSubmit={onFormSubmit}
      className="flex flex-col gap-6"
      noValidate
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <FormSectionNav
          sections={navSections}
          aria-label={f.sectionsAria}
          className="md:w-48 md:shrink-0"
        />

        <div className="flex max-w-3xl min-w-0 flex-1 flex-col gap-4">
          <FormCard id={CATEGORY_SECTION_IDS.main} title={f.sectionMain}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-name" required>
                  {f.name}
                </Label>
                <Input
                  id="category-name"
                  aria-required="true"
                  {...fieldA11y("name")}
                  {...register("name")}
                />
                <FieldError id={errorId("name")}>
                  {errors.name?.message}
                </FieldError>
              </div>

              {/* TASK-291-K: the "Порядок сортування" number input that used to
                  sit next to this Select is GONE — sibling order is owned by the
                  treegrid alone. The parent Select stays (§7.6.3, WCAG 2.5.7
                  non-dragging fallback). */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-parent">{f.parent}</Label>
                <Controller
                  control={control}
                  name="parentId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? field.value : ROOT_OPTION}
                      onValueChange={(value) => {
                        // Radix Select renders a hidden native <select> (bubble
                        // input) inside the form and re-dispatches a `change`
                        // event whenever the controlled value changes. When the
                        // id-keyed reset() seeds parentId BEFORE the parent
                        // options have loaded, that native select has no
                        // matching <option>, so the browser coerces its value to
                        // "" and Radix's autofill handler feeds "" back here —
                        // silently clearing the seeded parent (TASK-201). A real
                        // user action is never "": picking "Root" arrives as
                        // ROOT_OPTION. So "" can only be that bounce — ignore it.
                        if (value === "") return;
                        field.onChange(value === ROOT_OPTION ? "" : value);
                      }}
                    >
                      <SelectTrigger
                        id="category-parent"
                        className="w-full"
                        {...fieldA11y("parentId")}
                      >
                        <SelectValue
                          placeholder={
                            categoriesQuery.isLoading ? f.loading : f.rootOption
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ROOT_OPTION}>
                          {f.rootOption}
                        </SelectItem>
                        {parentOptions.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {/* Depth indent via padding, not text: a text prefix
                                would leak into the option's accessible name. */}
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
                <FieldError id={errorId("parentId")}>
                  {errors.parentId?.message}
                </FieldError>
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="category-slug">{f.slug}</Label>
                <Input
                  id="category-slug"
                  placeholder={f.slugPlaceholder}
                  {...fieldA11y("slug")}
                  {...register("slug")}
                />
                <FieldError id={errorId("slug")}>
                  {errors.slug?.message}
                </FieldError>
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="category-description">{f.description}</Label>
                <Textarea
                  id="category-description"
                  rows={3}
                  {...fieldA11y("description")}
                  {...register("description")}
                />
                <FieldError id={errorId("description")}>
                  {errors.description?.message}
                </FieldError>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Switch
                    id="category-active"
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-describedby="category-active-hint"
                    className="mt-0.5"
                  />
                )}
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor="category-active">{f.active}</Label>
                <p
                  id="category-active-hint"
                  className="text-xs text-muted-foreground"
                >
                  {visibilityHint}
                </p>
              </div>
            </div>
          </FormCard>

          <FormCard id={CATEGORY_SECTION_IDS.image} title={f.sectionImage}>
            <ContentImageField
              id="category-image"
              label={f.image}
              urlPlaceholder={f.imagePlaceholder}
              copy={f.imageUpload}
              value={imageValue}
              urlInput={register("image")}
              onRemove={() =>
                setValue("image", "", {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              fieldError={errors.image?.message}
              // TASK-441 — picked assets go in through the same `setValue` the
              // upload uses, so the form stays the single source of truth.
              picker={
                <MediaPicker
                  onPick={(asset) =>
                    setValue("image", asset.url, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              }
              {...imageUpload}
            />
          </FormCard>

          {extraSections.map((section) => (
            <Fragment key={section.id}>{section.node}</Fragment>
          ))}

          <CollapsibleSection
            id={CATEGORY_SECTION_IDS.seo}
            title={f.sectionSeo}
            open={seoOpen || seoHasError}
            onOpenChange={setSeoOpen}
            summary={f.seoSummary(
              metaTitleValue.trim().length > 0,
              parseKeywords(keywordsValue).length,
              ogImageValue.trim().length > 0,
            )}
            className="scroll-mt-4"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-meta-title">{f.metaTitle}</Label>
                <Input
                  id="category-meta-title"
                  placeholder={f.metaTitlePlaceholder}
                  {...fieldA11y("metaTitle")}
                  {...register("metaTitle")}
                />
                <FieldError id={errorId("metaTitle")}>
                  {errors.metaTitle?.message}
                </FieldError>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-meta-description">
                  {f.metaDescription}
                </Label>
                <Textarea
                  id="category-meta-description"
                  rows={3}
                  placeholder={f.metaDescriptionPlaceholder}
                  {...fieldA11y("metaDescription")}
                  {...register("metaDescription")}
                />
                <FieldError id={errorId("metaDescription")}>
                  {errors.metaDescription?.message}
                </FieldError>
              </div>

              {/* TASK-437 — tags and the OG card sit above the SERP preview:
                  neither shows up in it (tags are internal, the OG card is for
                  messengers). TASK-1117 — the hint says that NOTHING reads a
                  category's tags yet, instead of promising search. */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-keywords">{f.keywords}</Label>
                <Input
                  id="category-keywords"
                  placeholder={dict.seoFields.keywordsPlaceholder}
                  {...fieldA11y("keywords", "category-keywords-hint")}
                  {...register("keywords")}
                />
                <p
                  id="category-keywords-hint"
                  className="text-xs text-muted-foreground"
                >
                  {f.keywordsHint}
                </p>
                <FieldError id={errorId("keywords")}>
                  {errors.keywords?.message}
                </FieldError>
              </div>

              <div className="flex flex-col gap-1.5">
                <ContentImageField
                  id="category-og-image"
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
                <p className="text-xs text-muted-foreground">
                  {dict.seoFields.ogImageHint}
                </p>
              </div>

              <SeoSnippetPreview
                title={previewTitle.text}
                titleTier={previewTitle.tier}
                description={previewDescription.text || undefined}
                descriptionTier={previewDescription.tier}
                url={`${STOREFRONT_HOST} › categories › ${previewSlug}`}
                rawTitleLength={metaTitleValue.trim().length}
                rawDescriptionLength={metaDescriptionValue.trim().length}
              />
            </div>
          </CollapsibleSection>
        </div>
      </div>

      <FormActionsBar
        variant="sticky"
        formId={FORM_ID}
        dirtySections={dirtySections}
        onDiscard={() => {
          reset();
          onDiscardExtra?.();
        }}
        saveLabel={isPending ? dict.common.saving : submitLabel}
        isSaving={isPending}
      />
    </form>
  );
}

/** One section card of the form, titled, with its index anchor. */
function FormCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="flex scroll-mt-4 flex-col gap-4 rounded-lg border bg-card p-4 shadow-card"
    >
      <h3 id={headingId} className="text-sm font-semibold text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
