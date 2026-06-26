import { z } from "zod";
import type { CreateCategoryDto } from "@/entities/category";
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
});

export type CategoryFormInput = z.input<typeof categorySchema>;
export type CategoryFormValues = z.output<typeof categorySchema>;

/**
 * Map parsed form values to a create/update payload, dropping blank optional
 * strings so the backend treats them as "not provided" (blank slug → auto-slug,
 * blank parent → root category).
 */
export function categoryFormValuesToDto(
  values: CategoryFormValues,
): CreateCategoryDto {
  const slug = values.slug?.trim();
  const description = values.description?.trim();
  const image = values.image?.trim();
  const parentId = values.parentId?.trim();

  return {
    name: values.name,
    slug: slug ? slug : undefined,
    description: description ? description : undefined,
    image: image ? image : undefined,
    parentId: parentId ? parentId : undefined,
    sortOrder: values.sortOrder,
    isActive: values.isActive,
  };
}
