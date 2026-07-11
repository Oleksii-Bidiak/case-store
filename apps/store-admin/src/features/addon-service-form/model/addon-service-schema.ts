import { z } from "zod";
import type {
  CreateAddonServiceDto,
  UpdateAddonServiceDto,
} from "@/entities/addon-service";
import { dict } from "@/shared/config";

const e = dict.addonServiceForm.errors;

/**
 * Validation schema for the admin add-on-service (catalog) form.
 *
 * `price` is typed as a string in the form (an `<input>` value) and coerced to a
 * number on parse — mirroring `product-form`. Unlike a product, an add-on may
 * legitimately be FREE (a complimentary trade-in valuation), so the floor is 0,
 * not 0.01 — the backend's `CreateAddonServiceDto` agrees.
 */
export const addonServiceSchema = z.object({
  name: z.string().trim().min(1, e.nameRequired).max(255, e.nameMax),

  description: z.string().trim().max(2000, e.descriptionMax).optional(),

  price: z
    .string()
    .trim()
    .min(1, e.priceRequired)
    .refine((value) => !Number.isNaN(Number(value)), e.priceNumber)
    .refine((value) => Number(value) >= 0, e.priceNonNegative),

  isActive: z.boolean().optional(),
});

export type AddonServiceFormInput = z.input<typeof addonServiceSchema>;
export type AddonServiceFormValues = z.output<typeof addonServiceSchema>;

/**
 * Map parsed form values to a create/update payload. A blank description is
 * dropped so the backend treats it as "not provided" rather than an empty
 * string. Create and update share the same additive shape.
 */
export function addonServiceFormValuesToDto(
  values: AddonServiceFormValues,
): CreateAddonServiceDto & UpdateAddonServiceDto {
  const description = values.description?.trim();

  return {
    name: values.name,
    description: description ? description : undefined,
    price: Number(values.price),
    isActive: values.isActive,
  };
}
