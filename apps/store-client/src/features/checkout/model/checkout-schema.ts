import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Checkout form schema — simplified for the Ukrainian market (manual delivery
 * for now; Nova Poshta API is a future integration). We collect the minimum a
 * human needs to fulfil an order by hand: recipient name, a contact phone,
 * the city, and a free-text delivery address / Nova Poshta branch.
 *
 * These flat fields are mapped onto the backend `AddressDto` in `useCheckout`
 * (`deliveryAddress` → `address1`, `country` hard-set to `"UA"`). There is no
 * separate billing address in the MVP. `notes` is capped at 500 chars to match
 * the backend DTO.
 *
 * UA phone: accept `+380…`, `0…` and common separators; require ≥ 10 digits.
 */
const phoneRegex = /^\+?[\d\s()-]{10,20}$/;

export const checkoutSchema = z.object({
  firstName: z.string().min(1, dict.checkout.validation.firstName),
  lastName: z.string().min(1, dict.checkout.validation.lastName),
  phone: z
    .string()
    .min(1, dict.checkout.validation.phone)
    .regex(phoneRegex, dict.checkout.validation.phone),
  city: z.string().min(1, dict.checkout.validation.city),
  deliveryAddress: z.string().min(1, dict.checkout.validation.deliveryAddress),
  notes: z.string().max(500, dict.checkout.validation.notesMax).optional(),
});

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
