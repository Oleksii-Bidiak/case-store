import { OrderEntityStatus, OrderEntityPaymentStatus } from "@/shared/api";

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
  [OrderEntityStatus.DELIVERED]: "Доставлено",
  [OrderEntityStatus.CANCELLED]: "Скасовано",
  [OrderEntityStatus.REFUNDED]: "Повернення коштів",
};

const PAYMENT_STATUS_LABELS: Record<OrderEntityPaymentStatus, string> = {
  [OrderEntityPaymentStatus.PENDING]: "Очікує оплати",
  [OrderEntityPaymentStatus.PAID]: "Оплачено",
  [OrderEntityPaymentStatus.FAILED]: "Помилка оплати",
  [OrderEntityPaymentStatus.REFUNDED]: "Кошти повернено",
};

/** Map a raw order-status enum to its Ukrainian label (falls back to input). */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderEntityStatus] ?? status;
}

/** Map a raw payment-status enum to its Ukrainian label (falls back to input). */
export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status as OrderEntityPaymentStatus] ?? status;
}
