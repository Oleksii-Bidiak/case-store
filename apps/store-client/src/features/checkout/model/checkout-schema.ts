import { z } from "zod";
import { dict } from "@/shared/config";
// Direct import (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders this form model has no use for.
import { isValidUAPhone } from "@/shared/lib/phone";
import {
  CHECKOUT_PAYMENT_METHODS,
  DEFAULT_PAYMENT_METHOD,
} from "./payment-methods";
import { CHECKOUT_DELIVERY_METHODS, DEFAULT_DELIVERY_METHOD } from "./delivery";

/**
 * Checkout form schema — simplified for the Ukrainian market. We collect the
 * minimum a human needs to fulfil an order: recipient name, a contact phone,
 * and WHERE the parcel goes — which, since TASK-646, depends on the delivery
 * method the shopper picked.
 *
 * ── One object, one form type ───────────────────────────────────────────────
 * The four delivery branches are NOT a discriminated union. They share one flat
 * object — so `CheckoutFormValues` stays a single type behind a single
 * `useForm`, exactly as the guest variant below does — and a `superRefine`
 * decides which of the branch fields are required:
 *
 *   - NOVA_POSHTA — a city picked from the directory (`npCityRef`) and a
 *                   branch (`deliveryAddress`). Or, when the directory is down
 *                   (`npManual`, TASK-1097), a typed city and address.
 *   - PICKUP      — a pickup point (`pickupPointId`).
 *   - COURIER     — street and house; the city is the courier's own, or
 *                   typed (`courierCity`) when the shop named none.
 *   - OTHER       — a city and a free-text address / carrier.
 *
 * The flat fields are mapped onto the backend `AddressDto` in `useCheckout`.
 * `notes` is capped at 500 chars to match the backend DTO.
 *
 * Zod runs a refinement only when the object itself parsed — a field that is
 * missing altogether (`undefined` where a string belongs) skips it. That is a
 * second reason every field has a default (forms.md Rule 4c).
 *
 * UA phone (TASK-407): validated on the NORMALISED number, not on the mask.
 * `isValidUAPhone` strips the separators first and then requires `380` + 9
 * digits — the old mask-shaped regex let a string of brackets through.
 */
const checkoutFields = z.object({
  firstName: z.string().min(1, dict.checkout.validation.firstName),
  lastName: z.string().min(1, dict.checkout.validation.lastName),
  phone: z
    .string()
    .min(1, dict.checkout.validation.phone)
    .refine(isValidUAPhone, dict.checkout.validation.phone),
  /**
   * Delivery method (TASK-646). Defaults to Nova Poshta; the view moves it to
   * the first method the shop offers once `GET /api/delivery/methods` answers.
   */
  deliveryMethod: z.enum(CHECKOUT_DELIVERY_METHODS),
  /**
   * The Nova Poshta directory failed and the shopper types the address by hand
   * (TASK-1097). Set by code, never by a control of its own.
   */
  npManual: z.boolean().optional(),
  // City and address are required per branch — see `refineDelivery`.
  city: z.string(),
  // Nova Poshta refs (TASK-080) — set when the user picks from the autocomplete.
  npCityRef: z.string().optional(),
  deliveryAddress: z.string(),
  npWarehouseRef: z.string().optional(),
  pickupPointId: z.string().optional(),
  courierStreet: z.string().optional(),
  courierHouse: z.string().optional(),
  courierApartment: z.string().optional(),
  /**
   * The courier's city, typed by the shopper — only when the shop switched the
   * courier on without naming its city (the API allows that; only the admin
   * screen insists). Otherwise the city is the shop's and this stays empty.
   */
  courierCity: z.string().optional(),
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

export type CheckoutFormValues = z.infer<typeof checkoutFields>;

const isBlank = (value: string | undefined) => !(value ?? "").trim();

/** What the per-method rules need to know about the shop's offer. */
export interface CheckoutSchemaOptions {
  /**
   * The shop named the courier's city (`GET /api/delivery/methods` →
   * `courier.cityName`). When it did not, the shopper types it, and the courier
   * branch requires it — `AddressDto.city` is `@IsNotEmpty`. Default `true`,
   * the normal case.
   */
  courierCityFixed?: boolean;
}

/** The per-method requirements — see the schema's own comment. */
function refineDelivery(
  values: CheckoutFormValues,
  ctx: z.RefinementCtx,
  { courierCityFixed = true }: CheckoutSchemaOptions = {},
) {
  const require = (
    field: keyof CheckoutFormValues,
    value: string | undefined,
    message: string,
  ) => {
    if (isBlank(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    }
  };
  const v = dict.checkout.validation;
  const dv = dict.checkout.delivery.validation;

  switch (values.deliveryMethod) {
    case "PICKUP":
      require("pickupPointId", values.pickupPointId, dv.pickupPoint);
      return;
    case "COURIER":
      if (!courierCityFixed) {
        require("courierCity", values.courierCity, v.city);
      }
      require("courierStreet", values.courierStreet, dv.courierStreet);
      require("courierHouse", values.courierHouse, dv.courierHouse);
      return;
    case "OTHER":
      require("city", values.city, v.city);
      require("deliveryAddress", values.deliveryAddress, dv.otherAddress);
      return;
    case "NOVA_POSHTA":
    default:
      require("city", values.city, v.city);
      // A typed-but-not-picked city has no ref, and the server refuses a Nova
      // Poshta order without one. The manual path (directory down) is the one
      // place a typed city is the whole answer — it books as OTHER.
      if (!values.npManual && !isBlank(values.city)) {
        require("city", values.npCityRef, dv.npCity);
      }
      require("deliveryAddress", values.deliveryAddress, v.deliveryAddress);
  }
}

/** The guest's email: required, and an email. */
function refineGuestEmail(values: CheckoutFormValues, ctx: z.RefinementCtx) {
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
}

/**
 * The signed-in and the guest schema for one shape of the shop's offer.
 *
 * The guest variant is a refinement of the base schema rather than a second
 * `z.object`, so both infer the **same** `CheckoutFormValues`. That keeps one
 * form type and one `useForm<CheckoutFormValues>` while letting the resolver be
 * swapped once we know whether the visitor is a guest.
 */
function buildSchemas(options: CheckoutSchemaOptions) {
  const signedIn = checkoutFields.superRefine((values, ctx) =>
    refineDelivery(values, ctx, options),
  );
  return { signedIn, guest: signedIn.superRefine(refineGuestEmail) };
}

// Built once each: the resolver is re-read on every render.
const COURIER_CITY_FIXED = buildSchemas({ courierCityFixed: true });
const COURIER_CITY_TYPED = buildSchemas({ courierCityFixed: false });

export const checkoutSchema = COURIER_CITY_FIXED.signedIn;

/** Guest variant: the same shape with `email` actually required. */
export const guestCheckoutSchema = COURIER_CITY_FIXED.guest;

/** Pick the schema that matches the visitor and the shop's offer. */
export function checkoutSchemaFor(
  isGuest: boolean,
  { courierCityFixed = true }: CheckoutSchemaOptions = {},
) {
  const schemas = courierCityFixed ? COURIER_CITY_FIXED : COURIER_CITY_TYPED;
  return isGuest ? schemas.guest : schemas.signedIn;
}

/**
 * Static form defaults. Constant by construction — never seeded from async
 * server data, per `docs/conventions/forms.md`.
 *
 * Every field is listed (Rule 4c). `phone` is the one that taught us (TASK-407):
 * without a default the field starts `undefined`, and zod reports an untouched
 * phone as the English "Required" instead of the Ukrainian sentence in the
 * dictionary — the one thing on this screen a shopper could not read.
 */
export const CHECKOUT_DEFAULT_VALUES = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  deliveryMethod: DEFAULT_DELIVERY_METHOD,
  npManual: false,
  city: "",
  npCityRef: "",
  deliveryAddress: "",
  npWarehouseRef: "",
  pickupPointId: "",
  courierStreet: "",
  courierHouse: "",
  courierApartment: "",
  courierCity: "",
  notes: "",
  paymentMethod: DEFAULT_PAYMENT_METHOD,
} satisfies CheckoutFormValues;
