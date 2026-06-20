import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Address schema — mirrors the backend `AddressDto` validation rules.
 * Optional fields (company, address2, state, phone) use `.optional()`; `country`
 * must be a 2-letter ISO-3166-1 alpha-2 code.
 */
export const addressSchema = z.object({
  firstName: z.string().min(1, dict.checkout.validation.firstName),
  lastName: z.string().min(1, dict.checkout.validation.lastName),
  company: z.string().optional(),
  address1: z.string().min(1, dict.checkout.validation.address1),
  address2: z.string().optional(),
  city: z.string().min(1, dict.checkout.validation.city),
  state: z.string().optional(),
  postalCode: z.string().min(1, dict.checkout.validation.postalCode),
  country: z.string().length(2, dict.checkout.validation.country),
  phone: z.string().optional(),
});

/**
 * Checkout form schema. `billingSameAsShipping` is supplied a `true` default by
 * the form's `defaultValues` (kept off the schema so the zod input and output
 * types match for react-hook-form). When it is `false` a separate
 * `billingAddress` becomes required (enforced via `superRefine`). `notes` is
 * capped at 500 characters to match the backend DTO.
 */
export const checkoutSchema = z
  .object({
    shippingAddress: addressSchema,
    billingSameAsShipping: z.boolean(),
    billingAddress: addressSchema.optional(),
    notes: z.string().max(500, dict.checkout.validation.notesMax).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.billingSameAsShipping && !data.billingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billingAddress"],
        message: dict.checkout.validation.billingRequired,
      });
    }
  });

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
