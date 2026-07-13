import { z } from "zod";
import type {
  CreateDeviceBrandDto,
  UpdateDeviceBrandDto,
} from "@/entities/device";
import { dict } from "@/shared/config";

const e = dict.deviceBrandForm.errors;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validation schema for the admin device-brand form (TASK-190).
 *
 * TASK-295: no `sortOrder` field — the order is set by dragging (or keyboard-moving)
 * rows in the brands grid, and a new brand is appended by the backend.
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
