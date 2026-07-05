import { z } from "zod";
import type { CreateBrandDto, UpdateBrandDto } from "@/entities/brand";
import { dict } from "@/shared/config";

const e = dict.brandForm.errors;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validation schema for the admin brand form.
 *
 * Mirrors the category form: `name` is required, `slug` is optional (auto-derived
 * from the name by the backend when blank) and, when present, must match the
 * lowercase-hyphen slug pattern. `logo` is a plain URL text input (no upload
 * pipeline in TASK-189). `isActive` is the reversible visibility toggle.
 */
export const brandSchema = z.object({
  name: z.string().trim().min(1, e.nameRequired).max(255, e.nameMax),

  slug: z
    .string()
    .trim()
    .max(255, e.slugMax)
    .regex(SLUG_PATTERN, e.slugPattern)
    .optional()
    .or(z.literal("")),

  logo: z.string().trim().url(e.logoUrl).optional().or(z.literal("")),

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
