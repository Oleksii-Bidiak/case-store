import { z } from "zod";
import type { UseFormSetError } from "react-hook-form";
import type {
  CreateDeviceBrandDto,
  UpdateDeviceBrandDto,
} from "@/entities/device";
import { dict } from "@/shared/config";
import { SLUG_PATTERN } from "@/shared/lib/slug";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";

const e = dict.deviceBrandForm.errors;

/**
 * The DTO's `@MaxLength` caps (`apps/store-api/src/device/dto/create-device
 * -brand.dto.ts`) — read by the schema and the inputs' `maxLength`
 * (TASK-1984, Rule 5d).
 */
export const DEVICE_BRAND_LIMITS = { name: 255, slug: 255 } as const;

/** `CreateDeviceBrandDto` / `UpdateDeviceBrandDto` paths → form fields. */
const DEVICE_BRAND_FIELD_MAP: ServerFieldMap = { name: "name", slug: "slug" };

/**
 * Puts a refused device-brand save under its field (TASK-1984, Rule 6b) and
 * says whether it did — `false` leaves the toast to the caller. 409
 * `DEVICE_BRAND_SLUG_CONFLICT` is the slug (typed, or from the name) taken.
 */
export function placeDeviceBrandSaveError(
  error: unknown,
  setError: UseFormSetError<DeviceBrandFormInput>,
): boolean {
  const status = apiErrorStatus(error);
  if (status === 409 && apiErrorCode(error) === "DEVICE_BRAND_SLUG_CONFLICT") {
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
      DEVICE_BRAND_FIELD_MAP,
    );
    return mapped.length > 0 && unmapped.length === 0;
  }
  return false;
}

/**
 * Validation schema for the admin device-brand form (TASK-190).
 *
 * TASK-295: no `sortOrder` field — the order is set by dragging (or keyboard-moving)
 * rows in the brands grid, and a new brand is appended by the backend.
 */
export const deviceBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, e.nameRequired)
    .max(DEVICE_BRAND_LIMITS.name, e.nameMax),
  slug: z
    .string()
    .trim()
    .max(DEVICE_BRAND_LIMITS.slug, e.slugMax)
    .regex(SLUG_PATTERN, e.slugPattern)
    .optional()
    .or(z.literal("")),
  isActive: z.boolean().optional(),
});

export type DeviceBrandFormInput = z.input<typeof deviceBrandSchema>;
export type DeviceBrandFormValues = z.output<typeof deviceBrandSchema>;

/** Map parsed form values to a create/update payload (blank slug → auto-slug). */
export function deviceBrandValuesToDto(
  values: DeviceBrandFormValues,
): CreateDeviceBrandDto;
export function deviceBrandValuesToDto(
  values: DeviceBrandFormValues,
  options: { isUpdate: true },
): UpdateDeviceBrandDto;
export function deviceBrandValuesToDto(
  values: DeviceBrandFormValues,
): CreateDeviceBrandDto | UpdateDeviceBrandDto {
  const slug = values.slug?.trim();
  return {
    name: values.name,
    slug: slug ? slug : undefined,
    isActive: values.isActive,
  };
}
