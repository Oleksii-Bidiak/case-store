import { z } from "zod";
import type { CreateCategoryDto } from "@/entities/category";

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
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(255, "Name must be at most 255 characters"),

  slug: z
    .string()
    .trim()
    .max(255, "Slug must be at most 255 characters")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers, and single hyphens")
    .optional()
    .or(z.literal("")),

  description: z
    .string()
    .trim()
    .max(2000, "Description must be at most 2000 characters")
    .optional()
    .or(z.literal("")),

  image: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),

  parentId: z
    .string()
    .trim()
    .uuid("Must be a valid category")
    .optional()
    .or(z.literal("")),

  sortOrder: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || /^\d+$/.test(v),
      "Sort order must be a non-negative integer",
    )
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
