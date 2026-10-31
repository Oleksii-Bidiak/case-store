import { z } from "zod";
import {
  isCategoryIconKey,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from "@/entities/category";
import { dict } from "@/shared/config";
import { SLUG_PATTERN } from "@/shared/lib/slug";
import { ogImageField, seoTextFields } from "@/shared/lib/seo-fields-schema";
import {
  KEYWORDS_MAX_COUNT,
  KEYWORD_MAX_LENGTH,
  parseKeywords,
} from "@/shared/lib/seo";
import { UUID_PATTERN } from "@/shared/lib/uuid";

const e = dict.categoryForm.errors;
const seoErrors = dict.seoFields.errors;

/**
 * Validation schema for the admin category form.
 *
 * TASK-291 (§3.11): `sortOrder` is NOT part of this form any more. Sibling order
 * is owned exclusively by the treegrid (`PATCH /api/admin/categories/reorder`,
 * which rewrites a whole sibling bucket atomically); the narrowed
 * `CreateCategoryDto`/`UpdateCategoryDto` no longer accept the field, so a hand-
 * typed number here could only fight the tree.
 */
export const categorySchema = z.object({
  name: z.string().trim().min(1, e.nameRequired).max(255, e.nameMax),

  slug: z
    .string()
    .trim()
    .max(255, e.slugMax)
    .regex(SLUG_PATTERN, dict.seoFields.errors.slugPattern)
    .optional()
    .or(z.literal("")),

  description: z
    .string()
    .trim()
    .max(2000, e.descriptionMax)
    .optional()
    .or(z.literal("")),

  image: z.string().trim().url(e.imageUrl).optional().or(z.literal("")),

  parentId: z
    .string()
    .trim()
    // Shape only — the parent was read off the database (TASK-808).
    .regex(UUID_PATTERN, e.parentInvalid)
    .optional()
    .or(z.literal("")),

  isActive: z.boolean().optional(),

  // TASK-1956: a key into the category icon sprite; "" = no icon (the
  // storefront draws the generic folder). Deliberately NOT required for a root:
  // the approved plan keeps that soft — a hint under the field and the tree's
  // «Без іконки» badge — so an icon-less root still saves. An unknown key is
  // rejected (the API validates the same allow-list).
  icon: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || isCategoryIconKey(value),
      dict.categoryForm.icon.unknownKey,
    ),

  // SEO overrides (TASK-236). Optional free text; storefront <head> wiring is
  // deferred to Phase D, this only persists the values.
  ...seoTextFields(),

  // TASK-437 — internal tags as one comma-separated field, validated on the
  // PARSED list (see the product form's twin).
  keywords: z
    .string()
    .optional()
    .refine(
      (raw) => parseKeywords(raw).length <= KEYWORDS_MAX_COUNT,
      seoErrors.keywordsCount(KEYWORDS_MAX_COUNT),
    )
    .refine(
      (raw) => parseKeywords(raw).every((k) => k.length <= KEYWORD_MAX_LENGTH),
      seoErrors.keywordLength(KEYWORD_MAX_LENGTH),
    ),

  ogImage: ogImageField(),
});

export type CategoryFormInput = z.input<typeof categorySchema>;
export type CategoryFormValues = z.output<typeof categorySchema>;

/**
 * Map parsed form values to a create/update payload, dropping blank optional
 * strings so the backend treats them as "not provided" (blank slug → auto-slug).
 *
 * Parent handling differs by mode:
 * - CREATE (`isUpdate` false): blank parent → `undefined` (omitted; backend
 *   stores `null`).
 * - UPDATE (`isUpdate` true): blank parent → `null` (explicit clear). With
 *   `undefined` Prisma would treat the field as "no change", so an admin could
 *   never demote a sub-category back to a root one (TASK-149).
 */
export function categoryFormValuesToDto(
  values: CategoryFormValues,
): CreateCategoryDto;
export function categoryFormValuesToDto(
  values: CategoryFormValues,
  options: { isUpdate: true },
): UpdateCategoryDto;
export function categoryFormValuesToDto(
  values: CategoryFormValues,
  options: { isUpdate?: boolean } = {},
): CreateCategoryDto | UpdateCategoryDto {
  const slug = values.slug?.trim();
  const description = values.description?.trim();
  const image = values.image?.trim();
  const parentId = values.parentId?.trim();
  const metaTitle = values.metaTitle?.trim();
  const metaDescription = values.metaDescription?.trim();
  const ogImage = values.ogImage?.trim();
  const icon = values.icon && isCategoryIconKey(values.icon) ? values.icon : "";

  return {
    name: values.name,
    slug: slug ? slug : undefined,
    description: description ? description : undefined,
    image: image ? image : undefined,
    parentId: parentId ? parentId : options.isUpdate ? null : undefined,
    isActive: values.isActive,
    // TASK-1956: no icon clears it on UPDATE (explicit null), is omitted on
    // CREATE — the same rule as the SEO overrides below.
    icon: icon ? icon : options.isUpdate ? null : undefined,
    // Blank clears the override on UPDATE (explicit null so Prisma writes it),
    // and is simply omitted on CREATE (same rule as parentId, TASK-236).
    metaTitle: metaTitle ? metaTitle : options.isUpdate ? null : undefined,
    metaDescription: metaDescription
      ? metaDescription
      : options.isUpdate
        ? null
        : undefined,
    // A tag list clears by being EMPTY, so one array serves both verbs (TASK-437).
    keywords: parseKeywords(values.keywords),
    ogImage: ogImage ? ogImage : options.isUpdate ? null : undefined,
  };
}
