import { DeliveryMethod } from '@prisma/client';
import { centsToString, toCents } from '../addon-service';

/**
 * Shipping-cost rules that need no carrier call (TASK-643, plan 184; B-6 §6).
 *
 * Nova Poshta stays in `OrderService` because it is an async, cached, fallible
 * call to the carrier. Everything else is a pure function of the shop's delivery
 * settings and the basket, and lives here so every branch — above all the
 * courier threshold — is testable without a database.
 *
 * The client never sends a price. It sends a method; the server decides what that
 * method costs.
 */

/** Anything money-shaped: a decimal string, a number or a Prisma `Decimal`. */
type MoneyLike = { toString(): string };

/** The methods priced here — everything but the carrier-quoted Nova Poshta. */
export type FlatPricedDeliveryMethod = Exclude<DeliveryMethod, typeof DeliveryMethod.NOVA_POSHTA>;

/** Inputs to {@link flatShippingCost}. */
export interface FlatShippingInput {
  /**
   * The PRODUCT subtotal before any discount, add-ons excluded — the same base
   * the discount is computed on. Shipping never enters the discount base, and
   * the discount never lowers the base the threshold is compared against.
   */
  subtotal: MoneyLike;
  courierPrice: MoneyLike;
  /** Subtotal from which the courier is free; null = no threshold, never free. */
  courierFreeFrom: MoneyLike | null;
}

/**
 * Which delivery method a create-order request means.
 *
 * An explicit method wins. Without one — every storefront and client that
 * predates TASK-643 — the address decides: an NP city ref means the shopper
 * picked a Nova Poshta city (`NOVA_POSHTA`, priced exactly as before this wave),
 * anything else is free text (`OTHER`). An empty string counts as absent. This is
 * the same rule the TASK-642 backfill applied to historical orders, so a legacy
 * checkout and an old order agree about what they were.
 *
 * The storefront contract since plan 184 part U (TASK-646/1097): the checkout
 * sends `deliveryMethod` explicitly for every method the shopper picks, and
 * OMITS it on one path only — Nova Poshta is unavailable and the shopper typed
 * the city by hand. That request has no `npCityRef`, so it resolves here to
 * OTHER, and `OrderService.resolveDelivery` lets such an INFERRED OTHER through
 * even while «Інша доставка» is switched off (the payment matrix still applies).
 * Callers that need to tell the two apart compare against the request's own
 * `deliveryMethod`, not against this result.
 */
export function resolveDeliveryMethod(input: {
  deliveryMethod?: DeliveryMethod | null;
  npCityRef?: string | null;
}): DeliveryMethod {
  if (input.deliveryMethod) return input.deliveryMethod;
  return input.npCityRef ? DeliveryMethod.NOVA_POSHTA : DeliveryMethod.OTHER;
}

/**
 * Whether the courier is free for this subtotal. Compared in integer cents —
 * never floats — and a subtotal exactly on the threshold IS free ("від 1500 грн"
 * includes 1500). A null threshold means the courier is never free.
 */
export function isCourierFree(subtotal: MoneyLike, courierFreeFrom: MoneyLike | null): boolean {
  if (courierFreeFrom === null) return false;
  return toCents(subtotal) >= toCents(courierFreeFrom);
}

/**
 * The shipping cost of a non-NP method as a two-decimal string:
 *
 * - `PICKUP` → 0: the shopper collects it themselves.
 * - `COURIER` → `courierPrice`, or 0 from `courierFreeFrom` upwards.
 * - `OTHER` → 0 booked now; the operator quotes the real price later, and the
 *   order's address snapshot carries `shippingCostPending: true` so no surface
 *   presents this zero as "free delivery" (B-6 §4).
 */
export function flatShippingCost(
  method: FlatPricedDeliveryMethod,
  input: FlatShippingInput,
): string {
  if (method !== DeliveryMethod.COURIER) return '0.00';
  if (isCourierFree(input.subtotal, input.courierFreeFrom)) return '0.00';
  return centsToString(toCents(input.courierPrice));
}
