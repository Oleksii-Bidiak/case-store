import { z } from "zod";
import type { UseFormSetError } from "react-hook-form";
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
import { optionalHttpUrl } from "@/shared/lib/http-url";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";

const e = dict.categoryForm.errors;
const seoErrors = dict.seoFields.errors;

/**
 * The DTO's `@MaxLength` caps (`apps/store-api/src/category/dto/create-category
 * .dto.ts`; `ogImage` is `OG_IMAGE_MAX_LENGTH` of `IsOgImageField` in
 * `apps/store-api/src/common/validators/seo-fields.decorator.ts`) — read by the
 * schema and by the inputs' `maxLength` (TASK-1984, Rule 5d).
 */
export const CATEGORY_LIMITS = {
  name: 255,
  slug: 255,
  description: 2000,
  ogImage: 2048,
} as const;

/** `CreateCategoryDto` / `UpdateCategoryDto` paths → form fields (Rule 6b). */
export const CATEGORY_FIELD_MAP: ServerFieldMap = {
  name: "name",
  slug: "slug",
  description: "description",
  image: "image",
  parentId: "parentId",
  icon: "icon",
  metaTitle: "metaTitle",
  metaDescription: "metaDescription",
  keywords: "keywords",
  "keywords.*": "keywords",
  ogImage: "ogImage",
};

/**
 * Puts a refused category save under its field (TASK-1984, Rule 6b) and says
 * whether it did — `false` leaves the toast to the caller. 409
 * `CATEGORY_SLUG_CONFLICT` is the slug (typed, or derived from the name) taken.
 */
export function placeCategorySaveError(
  error: unknown,
  setError: UseFormSetError<CategoryFormInput>,
): boolean {
  const status = apiErrorStatus(error);
  if (status === 409 && apiErrorCode(error) === "CATEGORY_SLUG_CONFLICT") {
    setError(
      "slug",
      { type: "server", message: e.slugTaken },
      { shouldFocus: true },
    );
    return true;
  }
  if (status === 400) {
    const { mapped, unmapped } = applyServerFieldErrors(
      error,
      setError,
      CATEGORY_FIELD_MAP,
    );
    return mapped.length > 0 && unmapped.length === 0;
  }
  return false;
}

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
  name: z
    .string()
    .trim()
    .min(1, e.nameRequired)
    .max(CATEGORY_LIMITS.name, e.nameMax),

  slug: z
    .string()
    .trim()
    .max(CATEGORY_LIMITS.slug, e.slugMax)
    .regex(SLUG_PATTERN, dict.seoFields.errors.slugPattern)
    .optional()
    .or(z.literal("")),

  description: z
    .string()
    .trim()
    .max(CATEGORY_LIMITS.description, e.descriptionMax)
    .optional()
    .or(z.literal("")),

  // TASK-1984 (Rule 5): the DTO's `@IsUrl(CATEGORY_IMAGE_URL_OPTIONS)` — an
  // absolute http(s) link, nothing else (zod's `.url()` took any scheme).
  image: optionalHttpUrl(e.imageUrl),

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

  // `ogImageField` checks the URL rule only; the cap is the DTO's
  // `IsOgImageField` → `@MaxLength(OG_IMAGE_MAX_LENGTH)` (Rule 5d).
  ogImage: ogImageField().refine(
    (value) => value === undefined || value.length <= CATEGORY_LIMITS.ogImage,
    seoErrors.ogImageMax(CATEGORY_LIMITS.ogImage),
  ),
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
