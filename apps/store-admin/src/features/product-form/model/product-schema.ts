import { z } from "zod";
import type { CreateProductDto } from "@/entities/product";
import { dict } from "@/shared/config";

const e = dict.productForm.errors;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    .max(5000, e.descriptionMax)
    .optional()
    .or(z.literal("")),

  price: z
    .string()
    .trim()
    .min(1, e.priceRequired)
    .refine((v) => !Number.isNaN(Number(v)), e.priceNumber)
    .refine((v) => Number(v) > 0, e.pricePositive)
    .transform((v) => Number(v)),

  compareAtPrice: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || !Number.isNaN(Number(v)),
      e.compareNumber,
    )
    .refine(
      (v) => v === undefined || v === "" || Number(v) > 0,
      e.comparePositive,
    )
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),

  sku: z.string().trim().max(50, e.skuMax).optional().or(z.literal("")),

  stock: z
    .string()
    .trim()
    .optional()
    .refine((v) => v === undefined || v === "" || /^\d+$/.test(v), e.stockInt)
    .transform((v) => (v === undefined || v === "" ? 0 : Number(v))),

  categoryId: z.string().uuid(e.categoryRequired),

  // "" represents "no group" — mapped to undefined in the DTO.
  groupId: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || UUID_PATTERN.test(v),
      e.groupInvalid,
    ),

  // "" represents "no brand" — mapped to undefined in the DTO (TASK-189).
  brandId: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || UUID_PATTERN.test(v),
      e.brandInvalid,
    ),

  positionOrder: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || /^\d+$/.test(v),
      e.positionInt,
    )
    .transform((v) => (v === undefined || v === "" ? 0 : Number(v))),

  // Key-value attribute pairs (e.g. color/blue). Blank keys are dropped on map.
  attributes: z
    .array(z.object({ key: z.string().trim(), value: z.string().trim() }))
    .optional(),

  isActive: z.boolean().optional(),

  // SEO overrides (TASK-241). Optional free text; blank is dropped on map so the
  // storefront PDP falls back to the auto-derived title/description (resolveSeo).
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
  const groupId = values.groupId?.trim();
  const brandId = values.brandId?.trim();
  const metaTitle = values.metaTitle?.trim();
  const metaDescription = values.metaDescription?.trim();

  // Collapse the key-value pairs into an attribute object, dropping blank keys
  // and de-duplicating on key (last value wins).
  const attributes: Record<string, string> = {};
  for (const pair of values.attributes ?? []) {
    const key = pair.key.trim();
    if (key) {
      attributes[key] = pair.value.trim();
    }
  }

  return {
    name: values.name,
    slug: slug ? slug : undefined,
    description: description ? description : undefined,
    price: values.price,
    compareAtPrice: values.compareAtPrice,
    sku: sku ? sku : undefined,
    stock: values.stock,
    categoryId: values.categoryId,
    groupId: groupId ? groupId : undefined,
    brandId: brandId ? brandId : undefined,
    attributes,
    positionOrder: values.positionOrder,
    isActive: values.isActive,
    // Blank clears back to auto-derived SEO: omitted so the backend leaves the
    // column untouched on update and unset on create (same rule as slug/sku).
    metaTitle: metaTitle ? metaTitle : undefined,
    metaDescription: metaDescription ? metaDescription : undefined,
  };
}
