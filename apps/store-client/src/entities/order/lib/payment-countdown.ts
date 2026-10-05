import type { OrderEntity } from "@/shared/api/generated/models";

const MINUTE_MS = 60_000;

/**
 * Whole minutes left on a stock reservation (TASK-217, TASK-471), rounded UP:
 * 22 min 10 s left reads «23 хв», and the last partial minute reads «1 хв»
 * rather than «0 хв» while the reservation still holds. `0` once the deadline
 * has passed, and for an order with no timed reservation at all (`null`) or a
 * deadline the browser cannot parse.
 */
export function reservationMinutesLeft(
  expiresAt: string | null | undefined,
  now: number,
): number {
  if (!expiresAt) return 0;
  const deadline = Date.parse(expiresAt);
  if (Number.isNaN(deadline)) return 0;
  const left = deadline - now;
  return left > 0 ? Math.ceil(left / MINUTE_MS) : 0;
}

type AwaitingFields = Pick<
  OrderEntity,
  "paymentMethod" | "paymentStatus" | "status" | "reservationExpiresAt"
>;

/**
 * Minutes left to pay an unpaid ONLINE order before its reservation lapses —
 * the «Очікує оплати · N хв» note and the «Оплатити» button of the order
 * history. `0` means "not awaiting payment": a cash-on-delivery order, a paid
 * or failed payment, an order an operator already moved past PENDING, or a
 * reservation whose deadline has passed (the TTL worker cancels or releases it;
 * the checkout endpoint would refuse a new attempt anyway).
 */
export function awaitingPaymentMinutes(
  order: AwaitingFields,
  now: number,
): number {
  if (
    order.paymentMethod !== "ONLINE" ||
    order.paymentStatus !== "PENDING" ||
    order.status !== "PENDING"
  ) {
    return 0;
  }
  return reservationMinutesLeft(order.reservationExpiresAt, now);
}
