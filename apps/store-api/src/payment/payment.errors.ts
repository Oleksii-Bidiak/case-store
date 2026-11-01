import { BadRequestException, ConflictException } from '@nestjs/common';

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
  /** TASK-2340: the order is paid by bank transfer — no online attempt for it. */
  CHECKOUT_BANK_TRANSFER: 'PAYMENT_CHECKOUT_BANK_TRANSFER',
  /** TASK-2340: money already came in; an online attempt would charge the whole total again. */
  CHECKOUT_PARTLY_PAID: 'PAYMENT_CHECKOUT_PARTLY_PAID',
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

/**
 * 409 for an online attempt on an order paid by bank transfer (TASK-2340):
 * the operator records that money by hand; LiqPay would charge it a second way.
 */
export function checkoutBankTransferError(): ConflictException {
  return new ConflictException({
    error: PaymentErrorCode.CHECKOUT_BANK_TRANSFER,
    message: 'Це замовлення оплачується переказом на рахунок — онлайн-оплата для нього недоступна',
  });
}

/**
 * 409 for an online attempt on an order that already has money in (TASK-2340):
 * an attempt always charges the whole total, so a prepaid (PARTIALLY_PAID)
 * order would be paid twice.
 */
export function checkoutPartlyPaidError(): ConflictException {
  return new ConflictException({
    error: PaymentErrorCode.CHECKOUT_PARTLY_PAID,
    message:
      'За це замовлення вже внесено оплату — решту приймає магазин, онлайн-оплата недоступна',
  });
}
