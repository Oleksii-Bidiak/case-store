import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeliveryMethod } from '@prisma/client';
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
  /**
   * A REFUNDED mark the PROVIDER reported (or no REFUNDED mark on record at
   * all) was asked to be corrected (TASK-620, decision B-11 №7). Only an
   * operator's own mistaken mark may be lifted: a provider `reversed` is a fact
   * about where the money is, and correcting it would make the ledger lie.
   */
  PAYMENT_CORRECTION_PROVIDER_REFUND: 'ORDER_PAYMENT_CORRECTION_PROVIDER_REFUND',
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
 * 409 for correcting a REFUNDED mark that no operator set (TASK-620).
 *
 * The LiqPay `reversed` callback writes REFUNDED with `changedBy = null`; that
 * mark is the provider telling us the money went back, and nobody lifts it.
 */
export function paymentCorrectionProviderRefundError(): ConflictException {
  return new ConflictException({
    error: OrderErrorCode.PAYMENT_CORRECTION_PROVIDER_REFUND,
    message:
      'This REFUNDED mark was not set by an operator (the payment provider reported it), ' +
      'so it cannot be corrected',
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
  OTHER:
    'Доставка за адресою без вибору міста Нової Пошти зараз недоступна — ' +
    'оберіть місто зі списку або інший спосіб доставки',
};

/** 400 for a method the shop has switched off (explicit or derived). */
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
