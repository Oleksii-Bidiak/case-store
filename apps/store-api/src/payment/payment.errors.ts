import { BadRequestException } from '@nestjs/common';

/**
 * Stable, machine-readable error codes for payment refunds (TASK-1302).
 *
 * Same shape as `return.errors.ts`: the admin panel keys its localized (UA)
 * message off the string, so it stays stable when the English message is
 * reworded. It reaches the wire through the envelope's `error` field.
 */
export const PaymentErrorCode = {
  /** The refund is more than the attempt has left after earlier refunds. */
  REFUND_EXCEEDS_BALANCE: 'PAYMENT_REFUND_EXCEEDS_BALANCE',
} as const;

export type PaymentErrorCode = (typeof PaymentErrorCode)[keyof typeof PaymentErrorCode];

/**
 * 400 for a refund larger than what the attempt still has to give back:
 * the amount charged less every refund already requested. The remainder is
 * named in the message so the operator sees the number they can still send.
 */
export function refundExceedsBalanceError(
  requested: string,
  remaining: string,
): BadRequestException {
  return new BadRequestException({
    error: PaymentErrorCode.REFUND_EXCEEDS_BALANCE,
    message: `Refund of ${requested} exceeds what is left to refund on this payment (${remaining})`,
  });
}
