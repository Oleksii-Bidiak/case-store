import { OrderEntityStatus } from "@/entities/order";

type OrderStatus = (typeof OrderEntityStatus)[keyof typeof OrderEntityStatus];

/**
 * Allowed forward status transitions for the admin order workflow.
 *
 * The backend `updateStatus` does not guard transitions by design (it is also
 * driven by the future payment webhook), so the admin UI is the first line of
 * consistency: each status maps to the set of statuses an admin may move it to.
 * Terminal statuses map to an empty list.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderEntityStatus.PENDING]: [
    OrderEntityStatus.CONFIRMED,
    OrderEntityStatus.CANCELLED,
  ],
  [OrderEntityStatus.CONFIRMED]: [
    OrderEntityStatus.PROCESSING,
    OrderEntityStatus.CANCELLED,
  ],
  [OrderEntityStatus.PROCESSING]: [
    OrderEntityStatus.SHIPPED,
    OrderEntityStatus.CANCELLED,
  ],
  [OrderEntityStatus.SHIPPED]: [OrderEntityStatus.DELIVERED],
  [OrderEntityStatus.DELIVERED]: [],
  [OrderEntityStatus.CANCELLED]: [],
  [OrderEntityStatus.REFUNDED]: [],
};

/**
 * Return the statuses an order in `current` may be transitioned to. Unknown
 * statuses are treated as terminal (no transitions).
 */
export function getAllowedTransitions(current: string): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[current as OrderStatus] ?? [];
}
