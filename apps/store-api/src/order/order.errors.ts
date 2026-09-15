import { ConflictException } from '@nestjs/common';
import type { OrderStatus, PaymentStatus } from '@prisma/client';

/**
 * Stable, machine-readable error codes for order-lifecycle conflicts (TASK-332).
 *
 * Same shape and same reasoning as `common/reorder/reorder.errors.ts` (TASK-295):
 * the admin panel keys ONE set of localized (UA) messages off these strings, so
 * they must stay stable even when the human-readable message is reworded.
 *
 * They reach the client through the HTTP error envelope's `error` field — see
 * {@link HttpExceptionFilter}, which surfaces ONLY `resp.error` and
 * `resp.message` and silently discards any other property on the thrown body.
 * That is why the exceptions below are built as `{ error, message }` and not with
 * extra diagnostic fields: anything else would never reach the wire.
 */
export const OrderErrorCode = {
  /** The requested status is not reachable from the order's current status. */
  TRANSITION_INVALID: 'ORDER_TRANSITION_INVALID',
  /** The order changed after the client read it — a lost update (edge case E-11). */
  STALE: 'ORDER_STALE',
  /**
   * The requested PAYMENT status is not reachable from the order's current one
   * (TASK-431). A separate code from {@link TRANSITION_INVALID} because the two
   * are repaired by different actions and by different pickers: this one means
   * "the money cannot have moved that way", and the payment select — not the
   * status select — is the control that must refetch its options.
   */
  PAYMENT_TRANSITION_INVALID: 'ORDER_PAYMENT_TRANSITION_INVALID',
  /**
   * A FULL refund was requested while the order is still live (TASK-431, B-1 §1).
   * Distinct from {@link PAYMENT_TRANSITION_INVALID} because nothing is wrong
   * with the payment move itself — the operator simply has one more thing to do
   * first (cancel the order), and a message that says so is the difference
   * between "try something else" and "do this, then this".
   */
  REFUND_REQUIRES_CLOSED_ORDER: 'ORDER_REFUND_REQUIRES_CLOSED_ORDER',
  /**
   * The same cross-rule as {@link REFUND_REQUIRES_CLOSED_ORDER}, refused from the
   * other side: the ORDER was asked to return to a live status while its payment
   * is recorded as fully REFUNDED (review of plan 180).
   *
   * A separate code because the repair is a different one. There the operator
   * closes the order and records the money; here there is nothing to record —
   * the money is already back with the customer, and the honest move is a new
   * order rather than reviving one the shop has settled.
   */
  REVIVE_REFUNDED_PAYMENT: 'ORDER_REVIVE_REFUNDED_PAYMENT',
} as const;

export type OrderErrorCode = (typeof OrderErrorCode)[keyof typeof OrderErrorCode];

/**
 * 409 for a move the state machine forbids.
 *
 * The message names both ends because the operator's next question is always
 * "from what?" — the admin table shows a status that may already be minutes old.
 */
export function invalidTransitionError(from: OrderStatus, to: OrderStatus): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.TRANSITION_INVALID,
    message: `Order status cannot move from ${from} to ${to}`,
  });
}

/**
 * 409 for a payment move the payment state machine forbids (TASK-431).
 *
 * Raised on the ADMIN door only. The webhook and the reconcile worker ask the
 * same table and get the same answer, but they must never see this exception: a
 * 409 handed to a payment provider is not a refusal, it is a retry every few
 * minutes forever. They ignore the move and record that they did — see
 * `planPaymentApplication`.
 */
export function invalidPaymentTransitionError(
  from: PaymentStatus,
  to: PaymentStatus,
): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.PAYMENT_TRANSITION_INVALID,
    message: `Order payment status cannot move from ${from} to ${to}`,
  });
}

/**
 * 409 for a full refund on an order that is still live (TASK-431).
 *
 * The cross-rule the payment table cannot express: marking every hryvnia
 * returned while the order still says DELIVERED describes a shop that gave back
 * the money AND the goods. A PARTIAL refund is deliberately NOT caught here —
 * refunding one line of a delivered order is an ordinary Tuesday.
 */
export function refundRequiresClosedOrderError(status: OrderStatus): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.REFUND_REQUIRES_CLOSED_ORDER,
    message:
      `A full refund needs the order cancelled or refunded first; it is ${status}. ` +
      'Use PARTIALLY_REFUNDED to record a partial return of money.',
  });
}

/**
 * 409 for reviving an order whose money is already back with the customer
 * (review of plan 180).
 *
 * {@link refundRequiresClosedOrderError} guards the pair «live order + fully
 * refunded money» from the payment side. It was reachable from the other side
 * anyway: CANCELLED + REFUNDED is an everyday, legal state, and
 * `ORDER_TRANSITIONS[CANCELLED]` contains the pre-shipment statuses, so one
 * ordinary revive produced a PROCESSING order that will be picked and shipped
 * with every hryvnia recorded as returned.
 *
 * Worse, it was unrepairable: `PAYMENT_TRANSITIONS[REFUNDED]` is empty by
 * design, so the operator could not correct the payment label afterwards. A rule
 * enforced on one door is not a rule, so it is asked here too.
 */
export function reviveRefundedPaymentError(to: OrderStatus): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.REVIVE_REFUNDED_PAYMENT,
    message:
      `This order cannot become ${to}: its payment is recorded as fully REFUNDED. ` +
      'The money is back with the customer — create a new order instead.',
  });
}

/**
 * 409 for a lost update: the order was modified between the client reading it and
 * submitting the change (two admins on one order — edge case E-11).
 *
 * The client's remedy is always the same: reload and decide again with the
 * current state in front of them. Retrying blindly is exactly what this prevents.
 */
export function staleOrderError(): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.STALE,
    message: 'This order changed since it was loaded — reload and retry',
  });
}
