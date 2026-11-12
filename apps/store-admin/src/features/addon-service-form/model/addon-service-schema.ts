import { z } from "zod";
import type { UseFormSetError } from "react-hook-form";
import { apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import { parseKop } from "@/shared/lib/money-kop";
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
 * AddonServicesProposal ДП4, TASK-1083).
 *
 * Stricter than the DTO ON PURPOSE (forms Rule 5f): `CreateAddonServiceDto` /
 * `UpdateAddonServiceDto` keep `@MaxLength(2000)` because descriptions saved
 * before the 300 rule exist, and the form lets such a text through unchanged
 * (see `addonServiceSchemaFor`). Lowering the DTO would make every save of
 * those services fail until someone cut the text.
 */
export const ADDON_DESCRIPTION_MAX = 300;

/** The DTOs' `@MaxLength(255)` on `name` (create-addon-service.dto.ts). */
export const ADDON_NAME_MAX = 255;

/** `CreateAddonServiceDto` / `UpdateAddonServiceDto` paths → form fields. */
const ADDON_SERVICE_FIELD_MAP: ServerFieldMap = {
  name: "name",
  description: "description",
  price: "price",
};

/**
 * Puts a refused add-on save under its field (TASK-1984, Rule 6b) and says
 * whether it did — `false` leaves the toast to the caller.
 */
export function placeAddonServiceSaveError(
  error: unknown,
  setError: UseFormSetError<AddonServiceFormInput>,
): boolean {
  if (apiErrorStatus(error) !== 400) return false;
  const { mapped, unmapped } = applyServerFieldErrors(
    error,
    setError,
    ADDON_SERVICE_FIELD_MAP,
  );
  return mapped.length > 0 && unmapped.length === 0;
}

/** A typed price in the DTO's hryvnia number, or `null` when it is not one. */
function parsePrice(raw: string): number | null {
  const kop = parseKop(raw);
  return kop === null ? null : Number((kop / 100).toFixed(2));
}

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
    name: z
      .string()
      .trim()
      .min(1, e.nameRequired)
      .max(ADDON_NAME_MAX, e.nameMax),

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

    // TASK-1984 (Rule 5e): the money helper, never `Number(x)` alone —
    // «Infinity» / «1e3» are refused here, not by the API's `@IsNumber()`. The
    // floor is the DTO's `@Min(0)`; a minus sign is not an amount at all.
    // Stricter on purpose (Rule 5f): at most two decimals (money).
    price: z
      .string()
      .trim()
      .min(1, e.priceRequired)
      .refine((value) => !value.startsWith("-"), e.priceNonNegative)
      .refine(
        (value) => value.startsWith("-") || parsePrice(value) !== null,
        e.priceNumber,
      ),

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
    // The schema already refused anything `parsePrice` cannot read.
    price: parsePrice(values.price) ?? 0,
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
