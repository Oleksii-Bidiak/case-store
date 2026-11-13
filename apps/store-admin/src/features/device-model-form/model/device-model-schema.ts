import { z } from "zod";
import type { UseFormSetError } from "react-hook-form";
import type {
  CreateDeviceModelDto,
  UpdateDeviceModelDto,
} from "@/entities/device";
import { dict } from "@/shared/config";
import { SLUG_PATTERN } from "@/shared/lib/slug";
import { seoTextFields } from "@/shared/lib/seo-fields-schema";
import { UUID_PATTERN } from "@/shared/lib/uuid";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";

const e = dict.deviceModelForm.errors;

/**
 * The DTO's `@MaxLength` caps (`apps/store-api/src/device/dto/create-device
 * -model.dto.ts`) — read by the schema and the inputs' `maxLength`
 * (TASK-1984, Rule 5d). The SEO pair is `seoTextFields`' 255 / 500.
 */
export const DEVICE_MODEL_LIMITS = {
  name: 255,
  slug: 255,
  series: 255,
  description: 2000,
} as const;

/** `CreateDeviceModelDto` / `UpdateDeviceModelDto` paths → form fields. */
const DEVICE_MODEL_FIELD_MAP: ServerFieldMap = {
  deviceBrandId: "deviceBrandId",
  name: "name",
  slug: "slug",
  series: "series",
  releaseYear: "releaseYear",
  metaTitle: "metaTitle",
  metaDescription: "metaDescription",
  description: "description",
};

/**
 * Puts a refused device-model save under its field (TASK-1984, Rule 6b) and
 * says whether it did — `false` leaves the toast to the caller. 409
 * `DEVICE_MODEL_SLUG_CONFLICT` is the slug (typed, or from the name) taken.
 */
export function placeDeviceModelSaveError(
  error: unknown,
  setError: UseFormSetError<DeviceModelFormInput>,
): boolean {
  const status = apiErrorStatus(error);
  if (status === 409 && apiErrorCode(error) === "DEVICE_MODEL_SLUG_CONFLICT") {
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
      DEVICE_MODEL_FIELD_MAP,
    );
    return mapped.length > 0 && unmapped.length === 0;
  }
  return false;
}

/**
 * Validation schema for the admin device-model form (TASK-190). `releaseYear` is
 * a string on the INPUT side, transformed to a number on OUTPUT.
 */
export const deviceModelSchema = z.object({
  // Shape only — the brand id was read off the database (TASK-808).
  deviceBrandId: z.string().trim().regex(UUID_PATTERN, e.brandRequired),
  name: z
    .string()
    .trim()
    .min(1, e.nameRequired)
    .max(DEVICE_MODEL_LIMITS.name, e.nameMax),
  slug: z
    .string()
    .trim()
    .max(DEVICE_MODEL_LIMITS.slug, e.slugMax)
    .regex(SLUG_PATTERN, e.slugPattern)
    .optional()
    .or(z.literal("")),
  series: z
    .string()
    .trim()
    .max(DEVICE_MODEL_LIMITS.series, e.seriesMax)
    .optional()
    .or(z.literal("")),
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
  ...seoTextFields(),
  description: z
    .string()
    .trim()
    .max(DEVICE_MODEL_LIMITS.description, e.descriptionMax)
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
