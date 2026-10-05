import { z } from "zod";
import type {
  AddonServiceEntity,
  CreateAddonServiceDto,
  UpdateAddonServiceDto,
} from "@/entities/addon-service";
import { dict } from "@/shared/config";

const e = dict.addonServiceForm.errors;

/**
 * The description is the one line a shopper reads next to the service's
 * checkbox in the cart — 300 is the owner-approved length (wave 198,
 * AddonServicesProposal ДП4, TASK-1083). The API still accepts 2000; aligning
 * its DTO is an API tail.
 */
export const ADDON_DESCRIPTION_MAX = 300;

/**
 * Validation schema for the admin add-on-service (catalog) form.
 *
 * `price` is typed as a string in the form (an `<input>` value) and coerced to a
 * number on parse — mirroring `product-form`. Unlike a product, an add-on may
 * legitimately be FREE (a complimentary trade-in valuation), so the floor is 0,
 * not 0.01 — the backend's `CreateAddonServiceDto` agrees.
 */
export const addonServiceSchemaFor = (savedDescription?: string | null) =>
  z.object({
    name: z.string().trim().min(1, e.nameRequired).max(255, e.nameMax),

    // A description saved before the 300 limit (the API took 2000) passes
    // UNCHANGED — otherwise changing a price meant cutting someone's text
    // first. Any edit to it is held to the limit.
    description: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) =>
          value === undefined ||
          value.length <= ADDON_DESCRIPTION_MAX ||
          value === savedDescription?.trim(),
        e.descriptionMax,
      ),

    price: z
      .string()
      .trim()
      .min(1, e.priceRequired)
      .refine((value) => !Number.isNaN(Number(value)), e.priceNumber)
      .refine((value) => Number(value) >= 0, e.priceNonNegative),

    isActive: z.boolean().optional(),
  });

/** The create form's schema — nothing saved to grandfather. */
export const addonServiceSchema = addonServiceSchemaFor();

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

/**
 * A fetched service onto the form's string-based input shape. The API sends
 * money as a two-decimal string («499.00»); the field shows the number as an
 * operator would type it («499», «29.9»).
 */
export function mapAddonServiceToFormValues(
  service: AddonServiceEntity,
): AddonServiceFormInput {
  const amount = Number(service.price);
  return {
    name: service.name,
    description: service.description ?? "",
    price: Number.isFinite(amount) ? String(amount) : service.price,
    isActive: service.isActive,
  };
}
