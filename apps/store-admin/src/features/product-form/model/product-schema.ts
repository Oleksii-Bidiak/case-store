import { z } from "zod";
import type { CreateProductDto, UpdateProductDto } from "@/entities/product";
import { dict } from "@/shared/config";

const e = dict.productForm.errors;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Is this rich-text value visually empty? Tiptap serializes a cleared document
 * as `<p></p>`, which is 7 non-blank characters that render as nothing. Without
 * this check a description the admin never typed would be persisted as markup,
 * and the storefront — which decides between the HTML and legacy plain-text
 * renderer by looking for tags — would draw an empty paragraph instead of its
 * "no description" state. Mirrors the same test in `RichTextPreview`.
 */
function isBlankRichText(html: string): boolean {
  return !html.replace(/<[^>]*>/g, "").trim();
}
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

  // Rich-text HTML since TASK-361. The cap counts MARKUP as well as prose and
  // mirrors the API's MAX_DESCRIPTION_LENGTH — keep the two in step.
  description: z
    .string()
    .trim()
    .max(20000, e.descriptionMax)
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

  // No `isActive` field (TASK-361). Product visibility is not a form field any
  // more — `ProductPublishPanel` owns it through the activate/deactivate
  // endpoints, so a stale checkbox can never unpublish a product on save.

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
 *
 * SEO-override handling differs by mode (mirrors `categoryFormValuesToDto`):
 * - CREATE (`isUpdate` false): blank `metaTitle`/`metaDescription` → `undefined`
 *   (omitted; backend leaves the column unset).
 * - UPDATE (`isUpdate` true): blank → `null` (explicit clear). With `undefined`
 *   Prisma would treat the field as "no change", so a once-set override could
 *   never be blanked back to the auto-derived value (TASK-245).
 */
export function productFormValuesToDto(
  values: ProductFormValues,
): CreateProductDto;
export function productFormValuesToDto(
  values: ProductFormValues,
  options: { isUpdate: true },
): UpdateProductDto;
export function productFormValuesToDto(
  values: ProductFormValues,
  options: { isUpdate?: boolean } = {},
): CreateProductDto | UpdateProductDto {
  const slug = values.slug?.trim();
  const description = values.description?.trim();
  const hasDescription = Boolean(description) && !isBlankRichText(description!);
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
    // Same clear-semantics as the SEO overrides below: blank means "clear it" on
    // UPDATE (explicit null, or Prisma would read `undefined` as "no change" and
    // the old text would survive) and "omit it" on CREATE.
    description: hasDescription
      ? description
      : options.isUpdate
        ? null
        : undefined,
    price: values.price,
    compareAtPrice: values.compareAtPrice,
    sku: sku ? sku : undefined,
    stock: values.stock,
    categoryId: values.categoryId,
    groupId: groupId ? groupId : undefined,
    brandId: brandId ? brandId : undefined,
    attributes,
    positionOrder: values.positionOrder,
    // `isActive` is deliberately absent: omitted on CREATE the backend makes a
    // hidden draft, and omitted on UPDATE Prisma leaves the flag alone.
    // Blank clears the override on UPDATE (explicit null so Prisma writes it,
    // reverting to auto-derived SEO), and is simply omitted on CREATE (same
    // rule as parentId on the category form, TASK-245).
    metaTitle: metaTitle ? metaTitle : options.isUpdate ? null : undefined,
    metaDescription: metaDescription
      ? metaDescription
      : options.isUpdate
        ? null
        : undefined,
  };
}
