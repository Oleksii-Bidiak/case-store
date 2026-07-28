import { ConflictException } from '@nestjs/common';
import type { OrderStatus } from '@prisma/client';

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
