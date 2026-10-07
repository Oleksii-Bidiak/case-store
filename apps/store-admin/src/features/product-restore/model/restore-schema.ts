import { z } from "zod";
import { SLUG_PATTERN } from "@/shared/lib";
import { dict } from "@/shared/config";
import type { RestoreProductDto } from "@/entities/product";

const d = dict.products;

/** `CreateProductDto.slug` — `@MaxLength(255)`, picked by `RestoreProductDto`. */
export const RESTORE_SLUG_MAX_LENGTH = 255;
/** `CreateProductDto.sku` — `@MaxLength(50)`. */
export const RESTORE_SKU_MAX_LENGTH = 50;

/** Which unique slot(s) a 409 said are taken. */
export interface RestoreConflict {
  slug: boolean;
  sku: boolean;
}

export const NO_CONFLICT: RestoreConflict = { slug: false, sku: false };

/**
 * The three codes of `apps/store-api/src/product/product.errors.ts` — the API's
 * exception filter passes only `error` and `message` through, so the code
 * itself names the field(s). Pinned there; anything else is not a conflict
 * this dialog can resolve.
 */
export function conflictFromCode(
  code: string | undefined,
): RestoreConflict | null {
  switch (code) {
    case "PRODUCT_SLUG_CONFLICT":
      return { slug: true, sku: false };
    case "PRODUCT_SKU_CONFLICT":
      return { slug: false, sku: true };
    case "PRODUCT_SLUG_SKU_CONFLICT":
      return { slug: true, sku: true };
    default:
      return null;
  }
}

/** A field once asked for stays on screen: the union of every answer. */
export function mergeConflicts(
  current: RestoreConflict,
  next: RestoreConflict,
): RestoreConflict {
  return { slug: current.slug || next.slug, sku: current.sku || next.sku };
}

/**
 * The conflict dialog's fields (Т10). BOTH always exist (forms.md Rule 4c),
 * whichever is on screen — a second 409 may add the other one, and an absent
 * field would let zod answer in English.
 */
export interface RestoreConflictValues {
  slug: string;
  sku: string;
}

/** Т10: «…-2» after the native value, ready to accept or edit. */
export function restoreConflictDefaults(
  nativeSlug: string,
  nativeSku: string | null,
): RestoreConflictValues {
  return {
    slug: `${nativeSlug}-2`,
    sku: nativeSku ? `${nativeSku}-2` : "",
  };
}

/** Values the server already refused (the native ones and any earlier try). */
export interface TakenValues {
  slug: readonly string[];
  sku: readonly string[];
}

/**
 * Validates exactly the fields the conflict asks for, with the API's own rules
 * (`RestoreProductDto` picks them from `CreateProductDto`), plus one the API
 * cannot know in advance: a value it has ALREADY refused is not sent again.
 */
export function makeRestoreConflictSchema(
  conflict: RestoreConflict,
  taken: TakenValues,
) {
  return z
    .object({ slug: z.string(), sku: z.string() })
    .superRefine((values, ctx) => {
      if (conflict.slug) {
        const slug = values.slug.trim();
        const message = !slug
          ? d.conflictSlugRequired
          : slug.length > RESTORE_SLUG_MAX_LENGTH
            ? d.conflictSlugMax
            : !SLUG_PATTERN.test(slug)
              ? d.conflictSlugPattern
              : taken.slug.includes(slug)
                ? d.conflictSlugSame
                : null;
        if (message) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["slug"],
            message,
          });
        }
      }
      if (conflict.sku) {
        const sku = values.sku.trim();
        const message = !sku
          ? d.conflictSkuRequired
          : sku.length > RESTORE_SKU_MAX_LENGTH
            ? d.conflictSkuMax
            : taken.sku.includes(sku)
              ? d.conflictSkuSame
              : null;
        if (message) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sku"], message });
        }
      }
    });
}

/**
 * The retry body: only the field(s) the conflict named. An omitted field
 * means «the native value» to the API, which is exactly right for the slot
 * that was free.
 */
export function toRestoreProductDto(
  values: RestoreConflictValues,
  conflict: RestoreConflict,
): RestoreProductDto {
  const body: RestoreProductDto = {};
  if (conflict.slug) body.slug = values.slug.trim();
  if (conflict.sku) body.sku = values.sku.trim();
  return body;
}
