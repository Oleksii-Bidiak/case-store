import { z } from "zod";
import type { UseFormSetError } from "react-hook-form";
import type { CreateBrandDto, UpdateBrandDto } from "@/entities/brand";
import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import { optionalHttpUrl } from "@/shared/lib/http-url";
import { SLUG_PATTERN } from "@/shared/lib/slug";

const e = dict.brandForm.errors;

/**
 * The DTO's `@MaxLength` caps (`apps/store-api/src/brand/dto/create-brand.dto.ts`)
 * — read by the schema and by the inputs' `maxLength` (TASK-1984, Rule 5d).
 */
export const BRAND_LIMITS = { name: 255, slug: 255 } as const;

/** `CreateBrandDto` / `UpdateBrandDto` paths → form fields (Rule 6b). */
export const BRAND_FIELD_MAP: ServerFieldMap = {
  name: "name",
  slug: "slug",
  logo: "logo",
};

/**
 * Puts a refused brand save under its field (TASK-1984, Rule 6b) and says
 * whether it did — `false` leaves the toast to the caller. 409
 * `BRAND_SLUG_CONFLICT` is the slug (typed, or derived from the name) taken.
 */
export function placeBrandSaveError(
  error: unknown,
  setError: UseFormSetError<BrandFormInput>,
): boolean {
  const status = apiErrorStatus(error);
  if (status === 409 && apiErrorCode(error) === "BRAND_SLUG_CONFLICT") {
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
      BRAND_FIELD_MAP,
    );
    return mapped.length > 0 && unmapped.length === 0;
  }
  return false;
}

/**
 * Validation schema for the admin brand form.
 *
 * Mirrors the category form: `name` is required, `slug` is optional (auto-derived
 * from the name by the backend when blank) and, when present, must match the
 * lowercase-hyphen slug pattern. `logo` is a plain URL text input (no upload
 * pipeline in TASK-189). `isActive` is the reversible visibility toggle.
 */
export const brandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, e.nameRequired)
    .max(BRAND_LIMITS.name, e.nameMax),

  slug: z
    .string()
    .trim()
    .max(BRAND_LIMITS.slug, e.slugMax)
    .regex(SLUG_PATTERN, e.slugPattern)
    .optional()
    .or(z.literal("")),

  // TASK-1984 (Rule 5): the DTO's `@IsUrl(BRAND_LOGO_URL_OPTIONS)` — an
  // absolute http(s) link, nothing else (zod's `.url()` took any scheme).
  logo: optionalHttpUrl(e.logoUrl),

  isActive: z.boolean().optional(),
});

export type BrandFormInput = z.input<typeof brandSchema>;
export type BrandFormValues = z.output<typeof brandSchema>;

/**
 * Map parsed form values to a create/update payload, dropping blank optional
 * strings so the backend treats them as "not provided" (blank slug → auto-slug).
 * Create and update share the same additive shape.
 */
export function brandFormValuesToDto(
  values: BrandFormValues,
): CreateBrandDto & UpdateBrandDto {
  const slug = values.slug?.trim();
  const logo = values.logo?.trim();

  return {
    name: values.name,
    slug: slug ? slug : undefined,
    logo: logo ? logo : undefined,
    isActive: values.isActive,
  };
}
