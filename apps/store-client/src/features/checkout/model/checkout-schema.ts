import { z } from "zod";

/**
 * Address schema — mirrors the backend `AddressDto` validation rules.
 * Optional fields (company, address2, state, phone) use `.optional()`; `country`
 * must be a 2-letter ISO-3166-1 alpha-2 code.
 */
export const addressSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  company: z.string().optional(),
  address1: z.string().min(1, "Address line 1 is required"),
  address2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().optional(),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().length(2, "Country must be a 2-letter ISO code"),
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
    notes: z
      .string()
      .max(500, "Notes must be 500 characters or fewer")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.billingSameAsShipping && !data.billingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billingAddress"],
        message: "Billing address is required when it differs from shipping.",
      });
    }
  });

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
