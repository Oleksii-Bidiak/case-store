import { z } from "zod";
import type {
  CreateDeviceModelDto,
  UpdateDeviceModelDto,
} from "@/entities/device";
import { dict } from "@/shared/config";

const e = dict.deviceModelForm.errors;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validation schema for the admin device-model form (TASK-190). `releaseYear` is
 * a string on the INPUT side, transformed to a number on OUTPUT.
 */
export const deviceModelSchema = z.object({
  deviceBrandId: z.string().trim().uuid(e.brandRequired),
  name: z.string().trim().min(1, e.nameRequired).max(255, e.nameMax),
  slug: z
    .string()
    .trim()
    .max(255, e.slugMax)
    .regex(SLUG_PATTERN, e.slugPattern)
    .optional()
    .or(z.literal("")),
  series: z.string().trim().max(255, e.seriesMax).optional().or(z.literal("")),
  releaseYear: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) =>
        v === undefined ||
        v === "" ||
        (/^\d{4}$/.test(v) && Number(v) >= 1990 && Number(v) <= 2100),
      e.yearInt,
    )
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
  isActive: z.boolean().optional(),

  // Compatibility-landing copy (TASK-490) — the texts of
  // `/catalog/<категорія>/<модель>`. Same caps as the category form's SEO pair,
  // so one admin habit covers both screens.
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
  description: z
    .string()
    .trim()
    .max(2000, e.descriptionMax)
    .optional()
    .or(z.literal("")),
});

export type DeviceModelFormInput = z.input<typeof deviceModelSchema>;
export type DeviceModelFormValues = z.output<typeof deviceModelSchema>;

/**
 * Map parsed form values to a create/update payload. On UPDATE a blank
 * series/releaseYear/SEO field becomes an explicit `null` (clear); on CREATE it
 * is omitted.
 *
 * The blank→null rule is what makes an override REMOVABLE (TASK-490): with
 * `undefined` Prisma reads "no change", so an admin could set a landing-page
 * title once and never get back to the generated one. Same rule the category
 * form has applied to `metaTitle`/`metaDescription` since TASK-236.
 */
export function deviceModelValuesToDto(
  values: DeviceModelFormValues,
): CreateDeviceModelDto;
export function deviceModelValuesToDto(
  values: DeviceModelFormValues,
  options: { isUpdate: true },
): UpdateDeviceModelDto;
export function deviceModelValuesToDto(
  values: DeviceModelFormValues,
  options: { isUpdate?: boolean } = {},
): CreateDeviceModelDto | UpdateDeviceModelDto {
  const slug = values.slug?.trim();
  const series = values.series?.trim();
  const metaTitle = values.metaTitle?.trim();
  const metaDescription = values.metaDescription?.trim();
  const description = values.description?.trim();
  return {
    deviceBrandId: values.deviceBrandId,
    name: values.name,
    slug: slug ? slug : undefined,
    series: series ? series : options.isUpdate ? null : undefined,
    releaseYear:
      values.releaseYear != null
        ? values.releaseYear
        : options.isUpdate
          ? null
          : undefined,
    isActive: values.isActive,
    metaTitle: metaTitle ? metaTitle : options.isUpdate ? null : undefined,
    metaDescription: metaDescription
      ? metaDescription
      : options.isUpdate
        ? null
        : undefined,
    description: description
      ? description
      : options.isUpdate
        ? null
        : undefined,
  };
}
