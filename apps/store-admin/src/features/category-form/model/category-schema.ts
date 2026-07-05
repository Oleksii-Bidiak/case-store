import { z } from "zod";
import type { CreateCategoryDto, UpdateCategoryDto } from "@/entities/category";
import { dict } from "@/shared/config";

const e = dict.categoryForm.errors;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validation schema for the admin category form.
 *
 * As in the product form, the single numeric field (`sortOrder`) is modelled as
 * a string on the zod INPUT side (bound to a text input) and transformed to a
 * number on the OUTPUT side, so `react-hook-form` registration stays string-only
 * while `onSubmit` receives a parsed number.
 */
export const categorySchema = z.object({
  name: z.string().trim().min(1, e.nameRequired).max(255, e.nameMax),

  slug: z
    .string()
    .trim()
    .max(255, e.slugMax)
    .regex(SLUG_PATTERN, e.slugPattern)
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
    .uuid(e.parentInvalid)
    .optional()
    .or(z.literal("")),

  sortOrder: z
    .string()
    .trim()
    .optional()
    .refine((v) => v === undefined || v === "" || /^\d+$/.test(v), e.sortInt)
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

  isActive: z.boolean().optional(),

  // SEO overrides (TASK-236). Optional free text; storefront <head> wiring is
  // deferred to Phase D, this only persists the values.
  metaTitle: z
    .string()
    .trim()
    .max(255, e.metaTitleMax)
    .optional()
    .or(z.literal("")),

  metaDescription: z
    .string()
    .trim()
    .max(500, e.metaDescriptionMax)
    .optional()
    .or(z.literal("")),
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

  return {
    name: values.name,
    slug: slug ? slug : undefined,
    description: description ? description : undefined,
    image: image ? image : undefined,
    parentId: parentId ? parentId : options.isUpdate ? null : undefined,
    sortOrder: values.sortOrder,
    isActive: values.isActive,
    // Blank clears the override on UPDATE (explicit null so Prisma writes it),
    // and is simply omitted on CREATE (same rule as parentId, TASK-236).
    metaTitle: metaTitle ? metaTitle : options.isUpdate ? null : undefined,
    metaDescription: metaDescription
      ? metaDescription
      : options.isUpdate
        ? null
        : undefined,
  };
}
