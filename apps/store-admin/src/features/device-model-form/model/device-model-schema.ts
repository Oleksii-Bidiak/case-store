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
});

export type DeviceModelFormInput = z.input<typeof deviceModelSchema>;
export type DeviceModelFormValues = z.output<typeof deviceModelSchema>;

/**
 * Map parsed form values to a create/update payload. On UPDATE a blank
 * series/releaseYear becomes an explicit `null` (clear); on CREATE it is omitted.
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
  };
}
