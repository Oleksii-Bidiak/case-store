import { z } from "zod";
import { dict } from "@/shared/config";
import {
  CHECKOUT_PAYMENT_METHODS,
  DEFAULT_PAYMENT_METHOD,
} from "./payment-methods";

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
  // Nova Poshta refs (TASK-080) — set when the user picks from the autocomplete;
  // empty for the free-text fallback (NP not configured / offline). The visible
  // `city`/`deliveryAddress` strings stay required so manual orders still submit.
  npCityRef: z.string().optional(),
  deliveryAddress: z.string().min(1, dict.checkout.validation.deliveryAddress),
  npWarehouseRef: z.string().optional(),
  notes: z.string().max(500, dict.checkout.validation.notesMax).optional(),
  /**
   * Guest contact email (TASK-338). Optional here and required by
   * {@link guestCheckoutSchema}, because a signed-in shopper has no such field —
   * the backend ignores a contact block from an authenticated caller, their
   * account being the source of truth.
   */
  email: z.string().optional(),
  /**
   * Chosen payment method (TASK-330-B). Always present: the form declares
   * {@link DEFAULT_PAYMENT_METHOD} as its default, so an untouched form submits
   * cash on delivery — which is also the backend's own column default, meaning
   * the shopper's choice and the stored value agree.
   */
  paymentMethod: z.enum(CHECKOUT_PAYMENT_METHODS),
});

/**
 * Guest variant: the same shape with `email` actually required.
 *
 * Expressed as a refinement of the base object rather than a second `z.object`
 * so both schemas infer the **same** `CheckoutFormValues`. That keeps one form
 * type and one `useForm<CheckoutFormValues>` while letting the resolver be
 * swapped once we know whether the visitor is a guest.
 */
export const guestCheckoutSchema = checkoutSchema.superRefine((values, ctx) => {
  const email = values.email?.trim() ?? "";

  if (!email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: dict.checkout.guest.validationEmailRequired,
    });
    return;
  }

  if (!z.string().email().safeParse(email).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: dict.checkout.guest.validationEmail,
    });
  }
});

/** Pick the schema that matches the visitor. */
export function checkoutSchemaFor(isGuest: boolean) {
  return isGuest ? guestCheckoutSchema : checkoutSchema;
}

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;

/**
 * Static form defaults. Constant by construction — never seeded from async
 * server data, per `docs/conventions/forms.md`.
 */
export const CHECKOUT_DEFAULT_VALUES = {
  email: "",
  paymentMethod: DEFAULT_PAYMENT_METHOD,
} satisfies Partial<CheckoutFormValues>;
