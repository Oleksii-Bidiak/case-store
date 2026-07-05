import { z } from "zod";
import type {
  CreateDeviceBrandDto,
  UpdateDeviceBrandDto,
} from "@/entities/device";
import { dict } from "@/shared/config";

const e = dict.deviceBrandForm.errors;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validation schema for the admin device-brand form (TASK-190). The numeric
 * `sortOrder` is modelled as a string on the INPUT side (bound to a text input)
 * and transformed to a number on OUTPUT — same pattern as the category form.
 */
export const deviceBrandSchema = z.object({
  name: z.string().trim().min(1, e.nameRequired).max(255, e.nameMax),
  slug: z
    .string()
    .trim()
    .max(255, e.slugMax)
    .regex(SLUG_PATTERN, e.slugPattern)
    .optional()
    .or(z.literal("")),
  sortOrder: z
    .string()
    .trim()
    .optional()
    .refine((v) => v === undefined || v === "" || /^\d+$/.test(v), e.sortInt)
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
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
    sortOrder: values.sortOrder,
    isActive: values.isActive,
  };
}
