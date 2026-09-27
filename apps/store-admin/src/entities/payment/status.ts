import { PaymentEntityStatus } from "@/shared/api";
import { dict } from "@/shared/config";

type BadgeVariant =
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

/**
 * One payment ATTEMPT's status, in Ukrainian (TASK-371).
 *
 * Not the order's payment status (`entities/order` `paymentStatusLabel`): an
 * order has one payment status and possibly several attempts — a declined card
 * followed by a successful retry is the normal shape of a recovered payment —
 * so the two vocabularies are kept apart on purpose. An unknown value falls
 * back to itself rather than to a blank.
 */
export function paymentAttemptStatusLabel(status: string): string {
  // A switch rather than `labels[status]`: every key stays statically visible to
  // the dictionary-usage guard (TASK-816).
  switch (status) {
    case PaymentEntityStatus.PENDING:
      return dict.orders.paymentAttemptStatus.PENDING;
    case PaymentEntityStatus.SUCCEEDED:
      return dict.orders.paymentAttemptStatus.SUCCEEDED;
    case PaymentEntityStatus.FAILED:
      return dict.orders.paymentAttemptStatus.FAILED;
    case PaymentEntityStatus.EXPIRED:
      return dict.orders.paymentAttemptStatus.EXPIRED;
    case PaymentEntityStatus.REFUNDED:
      return dict.orders.paymentAttemptStatus.REFUNDED;
    default:
      return status;
  }
}

/**
 * Badge tone of an attempt, on the colour grammar of `entities/order`:
 * green = money arrived, amber = still open, red = refused or lapsed, grey =
 * money sent back (a finished refund is not an alarm on an ATTEMPT).
 */
export function paymentAttemptStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case PaymentEntityStatus.SUCCEEDED:
      return "success";
    case PaymentEntityStatus.FAILED:
    case PaymentEntityStatus.EXPIRED:
      return "destructive";
    case PaymentEntityStatus.REFUNDED:
      return "secondary";
    case PaymentEntityStatus.PENDING:
    default:
      return "warning";
  }
}

/** Whether this attempt can be refunded — the server refuses anything else (409). */
export function isRefundableAttempt(status: string): boolean {
  return status === PaymentEntityStatus.SUCCEEDED;
}
