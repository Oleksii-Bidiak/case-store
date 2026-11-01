import { ConflictException, ServiceUnavailableException } from '@nestjs/common';

/**
 * Stable, machine-readable error codes for payment refunds (TASK-1302).
 *
 * Same shape as `return.errors.ts`: the admin panel keys its localized (UA)
 * message off the string, so it stays stable when the English message is
 * reworded. It reaches the wire through the envelope's `error` field.
 */
export const PaymentErrorCode = {
  /**
   * The refund is more than the attempt has left after earlier refunds. No
   * longer raised since the R2 review removed `PaymentService.refund` — the one
   * refund door answers `ORDER_MONEY_REFUND_EXCEEDS_PAID`. Kept so the admin
   * dictionary's key still resolves until the admin step drops it.
   */
  REFUND_EXCEEDS_BALANCE: 'PAYMENT_REFUND_EXCEEDS_BALANCE',
  /** TASK-2340: the order is paid by bank transfer — no online attempt for it. */
  CHECKOUT_BANK_TRANSFER: 'PAYMENT_CHECKOUT_BANK_TRANSFER',
  /** TASK-2340: money already came in; an online attempt would charge the whole total again. */
  CHECKOUT_PARTLY_PAID: 'PAYMENT_CHECKOUT_PARTLY_PAID',
  /**
   * R2 pre-merge review: the refund request got no readable answer (timeout,
   * non-2xx, unparsable body). LiqPay may or may not have sent the money, so the
   * REQUESTED ledger row stays live — the reconcile poll or the `reversed`
   * callback settles it; an operator voids it only once LiqPay shows nothing went.
   */
  REFUND_OUTCOME_UNKNOWN: 'PAYMENT_REFUND_OUTCOME_UNKNOWN',
} as const;

export type PaymentErrorCode = (typeof PaymentErrorCode)[keyof typeof PaymentErrorCode];

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

/**
 * 503 for a refund whose outcome is unknown (R2 pre-merge review). A separate
 * type on purpose: a refusal voids the REQUESTED entry, this must not — voiding
 * it would drop money LiqPay may already have sent back.
 */
export class RefundOutcomeUnknownException extends ServiceUnavailableException {
  constructor() {
    super({
      error: PaymentErrorCode.REFUND_OUTCOME_UNKNOWN,
      message:
        'LiqPay не відповів на запит повернення. Запис лишається «запитано» — система перевірить його статус сама',
    });
  }
}
