import {
  OrderEntityStatus,
  OrderStatusHistoryEntityChangeType,
  orderStatusLabelFor,
  type OrderEntity,
  type OrderStatusHistoryEntity,
} from "@/entities/order";
import type { StepperStep } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";

/** The forward path an order walks (OrdersProposal К1). */
export const ORDER_PATH: readonly string[] = [
  OrderEntityStatus.PENDING,
  OrderEntityStatus.CONFIRMED,
  OrderEntityStatus.PROCESSING,
  OrderEntityStatus.SHIPPED,
  OrderEntityStatus.DELIVERED,
];

/**
 * «Створено → Підтверджено → В обробці → Відправлено → Отримано покупцем»,
 * each with the time it was reached, read off the status history. On a pickup
 * order the fourth step is «Готово до видачі» (TASK-2052).
 *
 * - The current status is «now»; Отримано покупцем, being the end, is «done».
 * - A step the order jumped over (PENDING straight to SHIPPED) is «skip» —
 *   once the history has loaded and shows no arrival there.
 * - A cancelled or refunded order is off the path: the steps it did reach are
 *   «done», the rest «skip»; the header badge says where it ended.
 */
export function orderPath(
  order: Pick<OrderEntity, "status" | "createdAt"> &
    Partial<Pick<OrderEntity, "deliveryMethod">>,
  history: readonly OrderStatusHistoryEntity[] | undefined,
): StepperStep[] {
  const reachedAt = new Map<string, string>([
    [OrderEntityStatus.PENDING, order.createdAt],
  ]);
  for (const entry of history ?? []) {
    const to = entry.toStatus as string | null;
    if (
      entry.changeType === OrderStatusHistoryEntityChangeType.STATUS &&
      to &&
      ORDER_PATH.includes(to)
    ) {
      reachedAt.set(to, entry.changedAt);
    }
  }

  const index = ORDER_PATH.indexOf(order.status);
  return ORDER_PATH.map((status, i) => {
    const at = reachedAt.get(status);
    let state: StepperStep["state"];
    if (index === -1) {
      state = at && history ? "done" : history ? "skip" : "todo";
    } else if (i < index) {
      state = history && !at ? "skip" : "done";
    } else if (i === index) {
      state = status === OrderEntityStatus.DELIVERED ? "done" : "now";
    } else {
      state = "todo";
    }
    return {
      id: status,
      title:
        i === 0
          ? dict.orders.colCreated
          : orderStatusLabelFor(status, order.deliveryMethod),
      description: at && state !== "skip" ? formatDateTime(at) : undefined,
      state,
    };
  });
}
