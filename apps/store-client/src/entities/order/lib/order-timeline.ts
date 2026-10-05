import type { OrderEntityStatus } from "@/shared/api/generated/models";

/** The four stages the account order detail draws (AccountOrders.dc.html). */
export const ORDER_TIMELINE_LENGTH = 4;

/**
 * How far an OPEN order has got on «Оформлено → Підтверджено → Відправлено →
 * Доставлено» (TASK-217): the index of the stage it is at. PROCESSING has no
 * stage of its own — it is still «Підтверджено», with «В обробці» under it.
 *
 * `null` for a closed order (CANCELLED, REFUNDED): it left the road, and the
 * detail draws a strip instead of a timeline.
 */
const REACHED: Partial<Record<OrderEntityStatus, number>> = {
  PENDING: 0,
  CONFIRMED: 1,
  PROCESSING: 1,
  SHIPPED: 2,
  DELIVERED: 3,
};

export function orderTimelineIndex(status: OrderEntityStatus): number | null {
  return REACHED[status] ?? null;
}

export type OrderTimelineStepState = "done" | "current" | "next";

/**
 * The state of each of the four stages. Stages before the reached one are
 * done; the reached one is current — except on DELIVERED, the last stage,
 * where there is nothing left to wait for and all four are done.
 */
export function orderTimelineStates(
  status: OrderEntityStatus,
): OrderTimelineStepState[] | null {
  const reached = orderTimelineIndex(status);
  if (reached === null) return null;
  return Array.from({ length: ORDER_TIMELINE_LENGTH }, (_, index) => {
    if (index < reached) return "done";
    if (index > reached) return "next";
    return status === "DELIVERED" ? "done" : "current";
  });
}
