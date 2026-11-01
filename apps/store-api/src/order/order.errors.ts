import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeliveryMethod } from '@prisma/client';
import type { OrderStatus } from '@prisma/client';
import type { PayoutRefusal, ReceiptRefusal } from './order-money';

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
   * «Live order + fully refunded money» (B-1 §1), refused from the ORDER
   * side: the order was asked to return to a live status while its payment
   * is recorded as fully REFUNDED (review of plan 180).
   *
   * A separate code because the repair is a different one. There the operator
   * closes the order and records the money; here there is nothing to record —
   * the money is already back with the customer, and the honest move is a new
   * order rather than reviving one the shop has settled.
   */
  REVIVE_REFUNDED_PAYMENT: 'ORDER_REVIVE_REFUNDED_PAYMENT',
  /**
   * A payout (or the reversal of a receipt) would leave more refunded than paid
   * (TASK-951, R2): the ceiling is `paid − refunded` across EVERY kind, read under
   * the order-row lock.
   */
  MONEY_REFUND_EXCEEDS_PAID: 'ORDER_MONEY_REFUND_EXCEEDS_PAID',
  /** The ledger entry cannot be reversed (сторно) — see `canReverse`. */
  MONEY_REVERSAL_REFUSED: 'ORDER_MONEY_REVERSAL_REFUSED',
  /** A malformed ledger write: non-integer/non-positive amount, missing reason. */
  MONEY_ENTRY_INVALID: 'ORDER_MONEY_ENTRY_INVALID',
  /**
   * A receipt of a kind this order's delivery does not admit (R2 A3, TASK-1807:
   * no «Гроші від НП» on a pickup) — or LIQPAY_PAYMENT, which only LiqPay writes.
   */
  MONEY_IN_KIND_NOT_ALLOWED: 'ORDER_MONEY_IN_KIND_NOT_ALLOWED',
  /** A receipt beyond what is owed, without a reason (R2 A3). */
  MONEY_OVERPAYMENT_REASON_REQUIRED: 'ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED',
  /** A payout on an order that holds no money (`paid − refunded = 0`) (R2 A3, TASK-2046). */
  MONEY_NOTHING_PAID: 'ORDER_MONEY_NOTHING_PAID',
  /** A payout without a return on a live order — cancel it first (R2 A3). */
  MONEY_ORDER_LIVE: 'ORDER_MONEY_ORDER_LIVE',
  /** A payout without a return on a shipped/delivered order — open a return (R2 A3). */
  MONEY_RETURN_REQUIRED: 'ORDER_MONEY_RETURN_REQUIRED',
  /** A payout for a return whose decision is not REFUND (R2 A3). */
  MONEY_RETURN_NOT_REFUND: 'ORDER_MONEY_RETURN_NOT_REFUND',
  /** A payout for a return whose goods are not back (not RECEIVED) (R2 A3). */
  MONEY_RETURN_NOT_RECEIVED: 'ORDER_MONEY_RETURN_NOT_RECEIVED',
  /** Only a live REQUESTED LiqPay refund can be voided (R2 A3, TASK-2337). */
  MONEY_VOID_REFUSED: 'ORDER_MONEY_VOID_REFUSED',
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
 * 409 for reviving an order whose money is already back with the customer
 * (review of plan 180).
 *
 * The money ledger guards the pair «live order + fully refunded money» from the
 * payment side (a live order is cancelled before a payout, R2 A3). It was
 * reachable from the other side anyway: CANCELLED + REFUNDED is an everyday, legal state, and
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

// ─── Delivery method at checkout (TASK-643) ─────────────────────────────────

/**
 * Stable codes for a checkout refused over its delivery method (TASK-643).
 *
 * Same envelope as the codes above (`{ error: code, message }`), but a different
 * audience: these reach the SHOPPER. The storefront shows the server's 400
 * message verbatim (`use-checkout.ts`), so every message below is one plain
 * Ukrainian sentence that says what to do next; the code is for the client to
 * key UI behaviour off (e.g. refetch `GET /api/delivery/methods`).
 */
export const DeliveryOrderErrorCode = {
  /** The method is switched off in the shop's delivery settings. */
  METHOD_UNAVAILABLE: 'DELIVERY_METHOD_UNAVAILABLE',
  /** The delivery × payment matrix forbids this pair (OTHER + ONLINE/INSTALLMENTS). */
  PAYMENT_NOT_ALLOWED: 'DELIVERY_PAYMENT_NOT_ALLOWED',
  /** NOVA_POSHTA was chosen explicitly but no NP city ref came with it. */
  NP_CITY_REQUIRED: 'DELIVERY_NP_CITY_REQUIRED',
  /** PICKUP was chosen without naming a point. */
  PICKUP_POINT_REQUIRED: 'DELIVERY_PICKUP_POINT_REQUIRED',
  /** The named pickup point does not exist or has been deactivated. */
  PICKUP_POINT_UNAVAILABLE: 'DELIVERY_PICKUP_POINT_UNAVAILABLE',
} as const;

export type DeliveryOrderErrorCode =
  (typeof DeliveryOrderErrorCode)[keyof typeof DeliveryOrderErrorCode];

/** What each method is called on the storefront, for the messages below. */
const UNAVAILABLE_MESSAGE: Record<DeliveryMethod, string> = {
  NOVA_POSHTA: 'Доставка Новою Поштою зараз недоступна — оберіть інший спосіб доставки',
  PICKUP: 'Самовивіз зараз недоступний — оберіть інший спосіб доставки',
  COURIER: 'Кур’єрська доставка зараз недоступна — оберіть інший спосіб доставки',
  // Only an EXPLICIT OTHER reaches this since TASK-1097: the inferred one (a
  // city typed by hand while NP is down) is let through whatever the switch.
  OTHER: '«Інша доставка» зараз недоступна — оберіть інший спосіб доставки',
};

/**
 * 400 for a method the shop has switched off — explicit, or a derived
 * NOVA_POSHTA. A derived OTHER never gets here (TASK-1097).
 */
export function deliveryMethodUnavailableError(method: DeliveryMethod): BadRequestException {
  return new BadRequestException({
    error: DeliveryOrderErrorCode.METHOD_UNAVAILABLE,
    message: UNAVAILABLE_MESSAGE[method],
  });
}

/**
 * 400 for a delivery × payment pair the matrix forbids. Today only OTHER
 * restricts anything, and the reason is always the same: its shipping is quoted
 * later, so there is no final amount to pay online.
 */
export function deliveryPaymentNotAllowedError(method: DeliveryMethod): BadRequestException {
  return new BadRequestException({
    error: DeliveryOrderErrorCode.PAYMENT_NOT_ALLOWED,
    message:
      method === DeliveryMethod.OTHER
        ? 'Вартість такої доставки уточнить оператор, тому оплатити замовлення можна лише при ' +
          'отриманні — оберіть оплату при отриманні'
        : 'Обраний спосіб оплати недоступний для цього способу доставки — оберіть інший',
  });
}

/**
 * The same refusal on the OPERATOR's door — a phone order (TASK-1021). Same
 * code, so the admin panel keys the same behaviour off it, but worded for the
 * person taking the call: a phone order's method is read off its address, so
 * the two repairs are "take the money on delivery" or "pick an NP city".
 */
export function manualOrderDeliveryPaymentNotAllowedError(
  method: DeliveryMethod,
): BadRequestException {
  return new BadRequestException({
    error: DeliveryOrderErrorCode.PAYMENT_NOT_ALLOWED,
    message:
      method === DeliveryMethod.OTHER
        ? 'Для адреси без міста зі списку Нової Пошти вартість доставки ще не відома, тому ' +
          'онлайн-оплата й оплата частинами недоступні — оберіть оплату при отриманні або ' +
          'вкажіть місто Нової Пошти'
        : 'Обраний спосіб оплати недоступний для цього способу доставки — оберіть інший',
  });
}

/** 400 for an explicit NOVA_POSHTA that carries no NP city to price it by. */
export function deliveryNpCityRequiredError(): BadRequestException {
  return new BadRequestException({
    error: DeliveryOrderErrorCode.NP_CITY_REQUIRED,
    message: 'Оберіть місто зі списку Нової Пошти, щоб ми могли розрахувати доставку',
  });
}

/** 400 for PICKUP without a point. */
export function deliveryPickupPointRequiredError(): BadRequestException {
  return new BadRequestException({
    error: DeliveryOrderErrorCode.PICKUP_POINT_REQUIRED,
    message: 'Оберіть пункт самовивозу',
  });
}

/** 400 for a pickup point that is gone or deactivated. */
export function deliveryPickupPointUnavailableError(): BadRequestException {
  return new BadRequestException({
    error: DeliveryOrderErrorCode.PICKUP_POINT_UNAVAILABLE,
    message: 'Обраний пункт самовивозу більше недоступний — оберіть інший',
  });
}

/**
 * 409 for a payout above what is still held (TASK-951, R2). `availableKop` is
 * `paid − refunded` read under the order-row lock, across every kind of entry.
 */
export function moneyRefundExceedsPaidError(
  requestedKop: number,
  availableKop: number,
): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID,
    message: `Cannot pay out ${requestedKop} kop: only ${availableKop} kop paid and not yet refunded`,
  });
}

/** 409 for a ledger entry that may not be reversed (R2, `canReverse`). */
export function moneyReversalRefusedError(reason: string): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.MONEY_REVERSAL_REFUSED,
    message: `This money entry cannot be reversed: ${reason}`,
  });
}

/** 400 for a malformed ledger write (R2). */
export function moneyEntryInvalidError(message: string): BadRequestException {
  return new BadRequestException({ error: OrderErrorCode.MONEY_ENTRY_INVALID, message });
}

/** 400 for a receipt the operator may not record as asked (R2 A3, `assessReceipt`). */
export function moneyReceiptRefusedError(refusal: ReceiptRefusal): BadRequestException {
  return refusal === 'IN_KIND_NOT_ALLOWED'
    ? new BadRequestException({
        error: OrderErrorCode.MONEY_IN_KIND_NOT_ALLOWED,
        message: "This kind of receipt does not fit the order's delivery method",
      })
    : new BadRequestException({
        error: OrderErrorCode.MONEY_OVERPAYMENT_REASON_REQUIRED,
        message: 'This receipt is more than the order still owes — say why',
      });
}

const PAYOUT_REFUSAL: Readonly<
  Record<Exclude<PayoutRefusal, 'EXCEEDS'>, [OrderErrorCode, string]>
> = {
  NOTHING_PAID: [
    OrderErrorCode.MONEY_NOTHING_PAID,
    'Nothing was paid on this order (or it was all paid back) — there is no money to return',
  ],
  ORDER_LIVE: [
    OrderErrorCode.MONEY_ORDER_LIVE,
    'The order is still live — cancel it first, then pay the money back',
  ],
  RETURN_REQUIRED: [
    OrderErrorCode.MONEY_RETURN_REQUIRED,
    'Money for shipped goods goes back through a return — open one for the returned lines',
  ],
  RETURN_NOT_REFUND: [
    OrderErrorCode.MONEY_RETURN_NOT_REFUND,
    'Money goes back only on a return decided as a refund',
  ],
  RETURN_NOT_RECEIVED: [
    OrderErrorCode.MONEY_RETURN_NOT_RECEIVED,
    'The returned goods are not received yet — mark them received first',
  ],
};

/**
 * 409 for a payout the money rules refuse (R2 A3, `assessPayout`). Over the
 * ceiling it is the TASK-951 code, with the ceiling in the message.
 */
export function moneyPayoutRefusedError(
  refusal: PayoutRefusal,
  requestedKop: number,
  availableKop: number,
): ConflictException {
  if (refusal === 'EXCEEDS') {
    return moneyRefundExceedsPaidError(requestedKop, availableKop);
  }
  const [error, message] = PAYOUT_REFUSAL[refusal];
  return new ConflictException({ error, message });
}

/** 409 for voiding anything but a live REQUESTED LiqPay refund (R2 A3, TASK-2337). */
export function moneyVoidRefusedError(): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.MONEY_VOID_REFUSED,
    message: 'Only a LiqPay refund still awaiting confirmation can be voided',
  });
}

/**
 * 409 for reversing a receipt the payouts already made depend on (R2): without
 * it more would stand refunded than paid. Same code as a payout over the ceiling
 * — the repair is the same (reverse the payout first).
 */
export function moneyReceiptReversalBelowRefundedError(
  receiptKop: number,
  refundedKop: number,
): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID,
    message:
      `Cannot reverse a ${receiptKop} kop receipt: ${refundedKop} kop already paid back ` +
      'would exceed what is left paid. Reverse the payout first.',
  });
}
