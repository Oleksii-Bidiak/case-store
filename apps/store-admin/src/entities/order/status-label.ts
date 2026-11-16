import {
  OrderEntityDeliveryMethod,
  OrderEntityStatus,
  OrderEntityPaymentStatus,
  type OrderEntity,
} from "@/shared/api";
import { dict } from "@/shared/config";

/**
 * Ukrainian display labels for the order/payment status enums (TASK-129).
 *
 * Sibling of `status-badge.ts` (colours): this file owns the human-readable
 * labels. Typed `Record<Enum, string>` keys give exhaustiveness — adding a new
 * enum value without a label is a compile error. The accessors fall back to the
 * raw string for unknown runtime values.
 *
 * `PENDING` and `REFUNDED` appear in both enums but mean different things to a
 * customer, so the two maps are deliberately separate — never merge them.
 */
const ORDER_STATUS_LABELS: Record<OrderEntityStatus, string> = {
  [OrderEntityStatus.PENDING]: "Очікує підтвердження",
  [OrderEntityStatus.CONFIRMED]: "Підтверджено",
  [OrderEntityStatus.PROCESSING]: "В обробці",
  [OrderEntityStatus.SHIPPED]: "Відправлено",
  // TASK-2052: the end of the path is the buyer having it — true of a parcel
  // and of a pickup alike, so one word for both.
  [OrderEntityStatus.DELIVERED]: "Отримано покупцем",
  [OrderEntityStatus.CANCELLED]: "Скасовано",
  [OrderEntityStatus.REFUNDED]: "Повернення коштів",
};

/**
 * Payment labels read from the dictionary rather than being spelled here
 * (TASK-431). The order labels above still hold their own strings; this map moved
 * because PARTIALLY_REFUNDED had to be worded, and a status whose wording lives
 * in two places — the picker's texts in `dict` and a literal here — is a status
 * that will eventually be called two different things on one screen.
 *
 * The `Record<Enum, string>` typing is what makes that safe: a new enum value
 * without a label is a compile error, not a blank badge.
 */
const PAYMENT_STATUS_LABELS: Record<OrderEntityPaymentStatus, string> = {
  [OrderEntityPaymentStatus.PENDING]: dict.orderStatus.paymentLabels.PENDING,
  [OrderEntityPaymentStatus.PARTIALLY_PAID]:
    dict.orderStatus.paymentLabels.PARTIALLY_PAID,
  [OrderEntityPaymentStatus.PAID]: dict.orderStatus.paymentLabels.PAID,
  [OrderEntityPaymentStatus.FAILED]: dict.orderStatus.paymentLabels.FAILED,
  [OrderEntityPaymentStatus.PARTIALLY_REFUNDED]:
    dict.orderStatus.paymentLabels.PARTIALLY_REFUNDED,
  [OrderEntityPaymentStatus.REFUNDED]: dict.orderStatus.paymentLabels.REFUNDED,
};

/**
 * SHIPPED on a PICKUP order (TASK-2052, B-12 topic 6). There is no separate enum
 * value: the operator's «Відправити» on a pickup order means the order is
 * packed and waiting at the point — «Відправлено» would send the buyer looking
 * for a parcel.
 */
const PICKUP_READY_LABEL = "Готово до видачі";

/**
 * Map a raw order-status enum to its Ukrainian label (falls back to input).
 *
 * The GENERIC word — for places with no concrete order behind them: filter
 * checkboxes and chips, the orders-by-status chart, the audit log. Where an
 * order is on screen, use {@link orderStatusLabelFor}.
 */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderEntityStatus] ?? status;
}

/**
 * The status of ONE order, worded for how it leaves the shop (TASK-2052): a
 * SHIPPED pickup order reads «Готово до видачі»; everything else reads as
 * {@link orderStatusLabel}. A missing delivery method is the generic word.
 */
export function orderStatusLabelFor(
  status: string,
  deliveryMethod: string | null | undefined,
): string {
  if (
    status === OrderEntityStatus.SHIPPED &&
    deliveryMethod === OrderEntityDeliveryMethod.PICKUP
  ) {
    return PICKUP_READY_LABEL;
  }
  return orderStatusLabel(status);
}

/**
 * The status badge of an ORDER as the card header and the list row show it
 * (TASK-1970). A cancelled order never becomes REFUNDED (R2 A4), so the money
 * that went back after the cancel is said on the badge itself: «Скасовано ·
 * кошти повернено» when everything paid came back, «Скасовано · повернуто
 * частково» while part of it is still held. Every other status reads as
 * `orderStatusLabelFor` — a SHIPPED pickup order is «Готово до видачі» (TASK-2052).
 */
export function orderHeadlineStatusLabel(
  order: Pick<
    OrderEntity,
    "status" | "refundedAfterCancel" | "paidKop" | "refundedKop"
  > &
    Partial<Pick<OrderEntity, "deliveryMethod">>,
): string {
  if (!order.refundedAfterCancel) {
    return orderStatusLabelFor(order.status, order.deliveryMethod);
  }
  return order.refundedKop < order.paidKop
    ? dict.orderStatus.cancelledPartlyRefunded
    : dict.orderStatus.cancelledRefunded;
}

/** Map a raw payment-status enum to its Ukrainian label (falls back to input). */
export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status as OrderEntityPaymentStatus] ?? status;
}
