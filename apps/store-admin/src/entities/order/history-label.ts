import type { OrderStatusHistoryEntity } from "@/shared/api";
import { OrderStatusHistoryEntityChangeType } from "@/shared/api";
import { orderStatusLabel, paymentStatusLabel } from "./status-label";

/**
 * Ukrainian labels for the order status/payment-status history timeline
 * (TASK-251). A sibling of `status-label.ts`: it composes the per-status labels
 * into human-readable "what changed" and "who did it" strings for the admin
 * order-detail timeline. Kept pure and table-driven-testable — no hooks, no
 * component state.
 *
 * The three-way actor disambiguation is a pure frontend concern (plan 134
 * Design Decision 3): the backend stores the raw acting-user id, and the
 * timeline resolves it against the order's owner and the "system" (null) case.
 */

/**
 * Who authored a change: the customer (self-cancel — `changedBy` is the order's
 * own owner), an admin (any other non-null id), or the system (null — order
 * creation, a future payment webhook).
 */
export function historyActorLabel(
  changedBy: string | null,
  orderUserId: string,
): string {
  if (changedBy === null) {
    return "Система";
  }
  if (changedBy === orderUserId) {
    return "Клієнт";
  }
  return "Адміністратор";
}

/**
 * What a history row records: a status transition (with the order-creation row
 * treated as the order's birth), or a payment-status change.
 */
export function historyChangeLabel(entry: OrderStatusHistoryEntity): string {
  if (entry.changeType === OrderStatusHistoryEntityChangeType.PAYMENT_STATUS) {
    return `Оплата: ${paymentStatusLabel(
      entry.fromPaymentStatus ?? "",
    )} → ${paymentStatusLabel(entry.toPaymentStatus ?? "")}`;
  }

  // STATUS row. A null fromStatus is the creation row — the order was born, not
  // transitioned from a prior status.
  if (entry.fromStatus == null) {
    return `Замовлення створено (${orderStatusLabel(entry.toStatus ?? "")})`;
  }
  return `Статус: ${orderStatusLabel(entry.fromStatus)} → ${orderStatusLabel(
    entry.toStatus ?? "",
  )}`;
}
