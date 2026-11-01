import { DeliveryMethod, PaymentMethod } from '@prisma/client';

/**
 * The delivery × payment matrix (TASK-643, plan 184; owner decision B-6 §5).
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * Which payment methods a delivery method admits is a money invariant, not a
 * storefront nicety: `OTHER` means "the operator will quote shipping later", so
 * there is no final amount yet, and LiqPay signs exactly one amount. An online
 * payment for an `OTHER` order would charge a total that is known to be wrong.
 *
 * The rule therefore lives HERE, in one pure table beside `order-state-machine.ts`
 * (same role: the table every writer asks), and is enforced by the order service
 * at creation and again by `PaymentService.createCheckout`, where money actually
 * moves (an OTHER order created as cash on delivery must not be paid online
 * afterwards). The storefront renders the same table — it reaches the client via
 * `GET /api/delivery/methods` (`paymentMatrix`), so the buttons it disables and
 * the requests the server refuses cannot drift apart (plan 184, risk «Два
 * джерела правди»). Pure on purpose: no NestJS, no Prisma client, no clock.
 *
 * ── The table ───────────────────────────────────────────────────────────────
 *
 *   | delivery                   | ON_DELIVERY | ONLINE | INSTALLMENTS |
 *   | -------------------------- | ----------- | ------ | ------------ |
 *   | NOVA_POSHTA/PICKUP/COURIER | ✔           | ✔      | ✔            |
 *   | OTHER                      | ✔           | ✖      | ✖            |
 *
 * `ON_DELIVERY` means "pays on receipt"; WHERE is said by the delivery method
 * (pickup → at the shop, NP → cash on delivery, courier → to the courier). That is
 * why `PaymentMethod` did not grow an `AT_STORE` value (B-6 §5).
 */
export const DELIVERY_PAYMENT_MATRIX: Readonly<Record<DeliveryMethod, readonly PaymentMethod[]>> =
  Object.freeze({
    [DeliveryMethod.NOVA_POSHTA]: Object.freeze([
      PaymentMethod.ON_DELIVERY,
      PaymentMethod.ONLINE,
      PaymentMethod.INSTALLMENTS,
    ]),
    [DeliveryMethod.PICKUP]: Object.freeze([
      PaymentMethod.ON_DELIVERY,
      PaymentMethod.ONLINE,
      PaymentMethod.INSTALLMENTS,
    ]),
    [DeliveryMethod.COURIER]: Object.freeze([
      PaymentMethod.ON_DELIVERY,
      PaymentMethod.ONLINE,
      PaymentMethod.INSTALLMENTS,
    ]),
    // Shipping is still to be quoted, so there is no final amount to sign.
    [DeliveryMethod.OTHER]: Object.freeze([PaymentMethod.ON_DELIVERY]),
  });

/** Whether an order delivered by `delivery` may be paid by `payment`. */
export function isPaymentAllowedForDelivery(
  delivery: DeliveryMethod,
  payment: PaymentMethod,
): boolean {
  return DELIVERY_PAYMENT_MATRIX[delivery].includes(payment);
}

/**
 * Every payment method `delivery` admits, as a fresh (caller-owned) array — the
 * table itself stays frozen whatever the caller does with the result.
 */
export function allowedPaymentMethods(delivery: DeliveryMethod): PaymentMethod[] {
  return [...DELIVERY_PAYMENT_MATRIX[delivery]];
}

/**
 * The OPERATOR's matrix (R2 A3, TASK-2047): the storefront's, plus
 * `BANK_TRANSFER` («Переказ на рахунок ФОП») with every delivery method — a
 * phone order the customer pays by transfer. Admin-only: the storefront
 * checkout refuses it (`CHECKOUT_PAYMENT_METHODS` in `create-order.dto.ts`) and
 * `GET /api/delivery/methods` serves the storefront table above, never this one.
 * It fits OTHER too: a transfer is made for an amount the operator quotes, so
 * there is no signed amount to get wrong.
 */
export const ADMIN_DELIVERY_PAYMENT_MATRIX: Readonly<
  Record<DeliveryMethod, readonly PaymentMethod[]>
> = Object.freeze(
  Object.fromEntries(
    Object.entries(DELIVERY_PAYMENT_MATRIX).map(([delivery, methods]) => [
      delivery,
      Object.freeze([...methods, PaymentMethod.BANK_TRANSFER]),
    ]),
  ) as Record<DeliveryMethod, readonly PaymentMethod[]>,
);

/** Whether an order the OPERATOR creates with `delivery` may be paid by `payment`. */
export function isPaymentAllowedForAdminDelivery(
  delivery: DeliveryMethod,
  payment: PaymentMethod,
): boolean {
  return ADMIN_DELIVERY_PAYMENT_MATRIX[delivery].includes(payment);
}
