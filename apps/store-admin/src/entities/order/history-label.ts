import type { OrderStatusHistoryEntity } from "@/shared/api";
import {
  OrderStatusHistoryEntityChangeType,
  OrderStatusHistoryEntityNote,
} from "@/shared/api";
import { dict } from "@/shared/config";
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
  // Nullable since TASK-338: a guest order has no owning account. The null case
  // needs no special branch — a guest cannot act as an authenticated user, so
  // `changedBy` for their own actions is null and the "Система" branch below
  // catches it first. Writing `orderUserId: string` again would only force a
  // caller-side cast, which is how a null reaches the comparison and every
  // system row starts claiming to be the customer.
  orderUserId: string | null,
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

/**
 * The flag a history row carries, as the operator reads it (TASK-932 /
 * TASK-788) — or null on an ordinary row. Shown UNDER the change label: the
 * transition itself reads the same as any other, and the note is what makes it
 * not ordinary.
 */
export function historyNoteLabel(
  entry: OrderStatusHistoryEntity,
): string | null {
  switch (entry.note) {
    case OrderStatusHistoryEntityNote.SHIPPED_UNPAID:
      return dict.orderStatus.unpaidShipHistoryNote;
    case OrderStatusHistoryEntityNote.PAID_AFTER_CANCEL:
      return dict.orderStatus.paidAfterCancelHistoryNote;
    default:
      return null;
  }
}
