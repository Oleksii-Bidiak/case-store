import {
  DeliveryMethod,
  type CourierTermsDto,
  type DeliveryMethodsDto,
  type DeliveryPaymentMatrixDto,
  type PickupPointPublicDto,
} from "@/entities/delivery";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";

/**
 * Delivery methods on the checkout (TASK-646) — the pure rules. The list, the
 * courier terms, the pickup points and the payment matrix all come from
 * `GET /api/delivery/methods`; nothing here is a second copy of a server rule.
 * The server recomputes the shipping cost and re-checks the matrix on every
 * order, so what follows only decides what the shopper SEES.
 */

/** The four methods, in the order the API always lists them. */
export const CHECKOUT_DELIVERY_METHODS = [
  DeliveryMethod.NOVA_POSHTA,
  DeliveryMethod.PICKUP,
  DeliveryMethod.COURIER,
  DeliveryMethod.OTHER,
] as const;

export type CheckoutDeliveryMethod = (typeof CHECKOUT_DELIVERY_METHODS)[number];

/** What an untouched form holds before the list has loaded. */
export const DEFAULT_DELIVERY_METHOD: CheckoutDeliveryMethod =
  DeliveryMethod.NOVA_POSHTA;

/** The normalised `GET /api/delivery/methods` payload the checkout works from. */
export interface CheckoutDeliveryOptions {
  methods: CheckoutDeliveryMethod[];
  courier: CourierTermsDto;
  pickupPoints: PickupPointPublicDto[];
  paymentMatrix: DeliveryPaymentMatrixDto;
}

/**
 * Used when the methods request fails. Nova Poshta only — the checkout this
 * replaced — with the matrix the server itself ships with (online payment for
 * everything except «інша доставка»). The server still has the last word: a
 * method the shop has switched off comes back as a 400 whose sentence the
 * checkout shows verbatim.
 */
export const FALLBACK_DELIVERY_OPTIONS: CheckoutDeliveryOptions = {
  methods: [DeliveryMethod.NOVA_POSHTA],
  courier: { price: "0.00", freeFrom: null, cityName: null },
  pickupPoints: [],
  paymentMatrix: {
    NOVA_POSHTA: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    PICKUP: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    COURIER: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
    OTHER: ["ON_DELIVERY"],
  },
};

/**
 * Normalise the payload. An empty list (every method switched off — the admin
 * screen refuses to save that, but the data could still say so) falls back
 * rather than rendering a checkout with nowhere to send the parcel.
 */
export function toDeliveryOptions(
  dto: DeliveryMethodsDto | undefined,
): CheckoutDeliveryOptions {
  if (!dto) return FALLBACK_DELIVERY_OPTIONS;
  const known = new Set<string>(CHECKOUT_DELIVERY_METHODS);
  const methods = dto.methods.filter(
    (method): method is CheckoutDeliveryMethod => known.has(method),
  );
  if (methods.length === 0) return FALLBACK_DELIVERY_OPTIONS;
  return {
    methods,
    courier: dto.courier,
    pickupPoints: dto.pickupPoints,
    paymentMatrix: dto.paymentMatrix,
  };
}

/**
 * The method the form should hold: the selection while the shop still offers
 * it, otherwise the first offered method (the default the mockup prescribes).
 */
export function resolveDeliveryMethod(
  selected: CheckoutDeliveryMethod | undefined,
  methods: readonly CheckoutDeliveryMethod[],
): CheckoutDeliveryMethod {
  if (selected && methods.includes(selected)) return selected;
  return methods[0] ?? DEFAULT_DELIVERY_METHOD;
}

/**
 * The method the SERVER will book (TASK-1097). The Nova Poshta manual path —
 * the city lookup failed and the shopper typed the address by hand — is sent
 * without `deliveryMethod` and without `npCityRef`, and the server infers
 * `OTHER` from that. So the payment matrix and the cost read it as `OTHER`.
 */
export function bookedDeliveryMethod(
  method: CheckoutDeliveryMethod,
  npManual: boolean,
): CheckoutDeliveryMethod {
  return method === DeliveryMethod.NOVA_POSHTA && npManual
    ? DeliveryMethod.OTHER
    : method;
}

/** The title on the method card. The courier names its city, undeclined. */
export function deliveryMethodTitle(
  method: CheckoutDeliveryMethod,
  courierCity?: string | null,
): string {
  if (method === DeliveryMethod.COURIER && courierCity?.trim()) {
    return dict.checkout.delivery.courierTitle(courierCity.trim());
  }
  return dict.checkout.delivery.titles[method];
}

/** The short name — the review row and the summary's «Доставка · …». */
export function deliveryMethodShortTitle(
  method: CheckoutDeliveryMethod,
): string {
  return dict.checkout.delivery.short[method];
}

/** «вулиця, буд, кв. N» — what the courier branch sends as `address1`. */
export function courierAddressLine(values: {
  courierStreet?: string;
  courierHouse?: string;
  courierApartment?: string;
}): string {
  return dict.checkout.delivery.courierAddressLine(
    (values.courierStreet ?? "").trim(),
    (values.courierHouse ?? "").trim(),
    (values.courierApartment ?? "").trim(),
  );
}

/** Decimal-string money → integer kopecks (NaN-safe). */
export function toCents(value: string | null | undefined): number {
  const amount = Number(value ?? "0");
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

/** Integer kopecks → «1 234 ₴». */
export function centsToMoney(cents: number): string {
  return formatMoney((cents / 100).toFixed(2));
}

export interface CourierFreeProgress {
  /** The cart already clears the threshold — the courier is free. */
  free: boolean;
  /** What is still missing, in kopecks (0 once free). */
  remainingCents: number;
  /** 0–100, for the progress bar. */
  percent: number;
  /** The threshold, formatted. */
  thresholdText: string;
}

/**
 * How far the cart is from a free courier. The threshold counts the PRODUCT
 * subtotal, inclusive — the same base the server uses (plan 184, «Ризики»).
 * `null` when the shop set no threshold.
 */
export function courierFreeProgress(
  subtotal: string | null | undefined,
  freeFrom: string | null | undefined,
): CourierFreeProgress | null {
  if (freeFrom == null || freeFrom === "") return null;
  const thresholdCents = toCents(freeFrom);
  const subtotalCents = toCents(subtotal);
  const free = subtotalCents >= thresholdCents;
  return {
    free,
    remainingCents: free ? 0 : thresholdCents - subtotalCents,
    percent:
      thresholdCents > 0
        ? Math.min(100, Math.round((subtotalCents / thresholdCents) * 100))
        : 100,
    thresholdText: formatMoney(freeFrom),
  };
}

/**
 * What delivery will cost, as far as the storefront can tell.
 *
 *   - `select-city` — Nova Poshta before a city is picked;
 *   - `calculating` — the Nova Poshta estimate is in flight;
 *   - `amount`      — a real sum (NP estimate, or the courier's flat price);
 *   - `free`        — pickup, or a courier above the threshold;
 *   - `pending`     — nobody has priced it: «інша доставка», the NP manual
 *                     path, or an NP estimate that failed / came back empty.
 *                     Never rendered as «0 ₴» (plan 184, «Навіщо» §3).
 */
export type DeliveryQuote =
  | { kind: "select-city" }
  | { kind: "calculating" }
  | { kind: "amount"; cents: number; etaDays?: number | null }
  | { kind: "free" }
  | { kind: "pending" };

export interface QuoteDeliveryInput {
  method: CheckoutDeliveryMethod;
  npManual: boolean;
  npCityRef?: string;
  courier: CourierTermsDto;
  subtotal: string | null | undefined;
  estimate?: { cost: string; etaDays?: number | null } | null;
  isEstimating: boolean;
  isEstimateError: boolean;
}

export function quoteDelivery(input: QuoteDeliveryInput): DeliveryQuote {
  const method = bookedDeliveryMethod(input.method, input.npManual);
  switch (method) {
    case DeliveryMethod.PICKUP:
      return { kind: "free" };
    case DeliveryMethod.OTHER:
      return { kind: "pending" };
    case DeliveryMethod.COURIER: {
      const progress = courierFreeProgress(
        input.subtotal,
        input.courier.freeFrom,
      );
      const cents = toCents(input.courier.price);
      if (progress?.free || cents <= 0) return { kind: "free" };
      return { kind: "amount", cents };
    }
    case DeliveryMethod.NOVA_POSHTA:
    default: {
      if (!input.npCityRef) return { kind: "select-city" };
      if (input.isEstimating) return { kind: "calculating" };
      const cents = input.estimate ? toCents(input.estimate.cost) : 0;
      if (input.isEstimateError || cents <= 0) return { kind: "pending" };
      return { kind: "amount", cents, etaDays: input.estimate?.etaDays };
    }
  }
}

/** The quote as one short string — the review row. */
export function deliveryQuoteText(quote: DeliveryQuote): string {
  switch (quote.kind) {
    case "amount":
      return centsToMoney(quote.cents);
    case "free":
      return dict.checkout.delivery.free;
    case "calculating":
      return dict.checkout.shippingCalculating;
    case "select-city":
      return dict.checkout.shippingSelectCity;
    case "pending":
    default:
      return dict.checkout.shippingCostUnknown;
  }
}
