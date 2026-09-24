import { BadRequestException } from '@nestjs/common';

/**
 * Stable, machine-readable error codes for return resolution (TASK-785).
 *
 * Same shape as `order.errors.ts`: the admin panel keys its localized (UA)
 * messages off these strings, so they stay stable when the English message is
 * reworded. They reach the wire through the envelope's `error` field.
 */
export const ReturnErrorCode = {
  /** `refundedAmount` is more than the returned lines are worth. */
  REFUND_EXCEEDS_RETURNED_VALUE: 'RETURN_REFUND_EXCEEDS_RETURNED_VALUE',
  /** `refundedAmount` is more than the order has left after earlier refunds. */
  REFUND_EXCEEDS_ORDER_BALANCE: 'RETURN_REFUND_EXCEEDS_ORDER_BALANCE',
} as const;

export type ReturnErrorCode = (typeof ReturnErrorCode)[keyof typeof ReturnErrorCode];

/**
 * 400 for a refund larger than the goods coming back (TASK-785) — "49900" typed
 * for "499.00". The ceiling is named in the message so the operator sees the
 * number they should have typed.
 */
export function refundExceedsReturnedValueError(
  requested: string,
  returnedValue: string,
): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.REFUND_EXCEEDS_RETURNED_VALUE,
    message: `Refund of ${requested} exceeds the value of the returned items (${returnedValue})`,
  });
}

/**
 * 400 for a refund larger than what the order still has to give back (TASK-785):
 * `order.total` less everything already refunded through its other returns.
 */
export function refundExceedsOrderBalanceError(
  requested: string,
  remaining: string,
): BadRequestException {
  return new BadRequestException({
    error: ReturnErrorCode.REFUND_EXCEEDS_ORDER_BALANCE,
    message: `Refund of ${requested} exceeds what is left to refund on this order (${remaining})`,
  });
}
