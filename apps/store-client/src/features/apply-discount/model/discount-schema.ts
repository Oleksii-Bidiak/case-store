import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Zod schema for the promo-code input. The code is trimmed and upper-cased to
 * match the server's case-insensitive (uppercase-stored) lookup, so the request
 * sends exactly what the backend matches on.
 */
export const discountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { message: dict.discounts.required })
    .max(64, { message: dict.discounts.tooLong })
    .transform((value) => value.toUpperCase()),
});

export type DiscountFormValues = z.infer<typeof discountSchema>;
