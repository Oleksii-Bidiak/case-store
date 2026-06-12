import { z } from "zod";
import type { CreateProductDto } from "@/entities/product";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validation schema for the admin product form.
 *
 * Form fields are bound to text inputs, so every numeric field is modelled as a
 * string on the INPUT side and transformed to a number on the OUTPUT side. This
 * keeps `react-hook-form` registration friction-free (inputs hold strings) while
 * `onSubmit` receives properly typed numbers.
 *
 *   - `ProductFormInput`  = `z.input`  — the shape the form fields hold.
 *   - `ProductFormValues` = `z.output` — the parsed values passed to `onSubmit`.
 */
export const productSchema = z.object({
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
    .max(5000, "Description must be at most 5000 characters")
    .optional()
    .or(z.literal("")),

  price: z
    .string()
    .trim()
    .min(1, "Price is required")
    .refine((v) => !Number.isNaN(Number(v)), "Price must be a number")
    .refine((v) => Number(v) > 0, "Price must be greater than 0")
    .transform((v) => Number(v)),

  compareAtPrice: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || !Number.isNaN(Number(v)),
      "Compare-at price must be a number",
    )
    .refine(
      (v) => v === undefined || v === "" || Number(v) > 0,
      "Compare-at price must be greater than 0",
    )
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

  sku: z
    .string()
    .trim()
    .max(50, "SKU must be at most 50 characters")
    .optional()
    .or(z.literal("")),

  categoryId: z.string().uuid("Select a category"),

  isActive: z.boolean().optional(),
});

export type ProductFormInput = z.input<typeof productSchema>;
export type ProductFormValues = z.output<typeof productSchema>;

/**
 * Map parsed form values to a create/update payload, dropping blank optional
 * strings so the backend treats them as "not provided" (e.g. an empty slug is
 * auto-generated rather than failing the slug-format validator).
 */
export function productFormValuesToDto(
  values: ProductFormValues,
): CreateProductDto {
  const slug = values.slug?.trim();
  const description = values.description?.trim();
  const sku = values.sku?.trim();

  return {
    name: values.name,
    slug: slug ? slug : undefined,
    description: description ? description : undefined,
    price: values.price,
    compareAtPrice: values.compareAtPrice,
    sku: sku ? sku : undefined,
    categoryId: values.categoryId,
    isActive: values.isActive,
  };
}
