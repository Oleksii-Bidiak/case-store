import { OrderHistoryNote, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import type { PaymentApplyPlan } from './order.types';

/**
 * WHEN the shop hears about a storefront order (TASK-678, plan 187; owner
 * decision B-7 №7 in plan 178).
 *
 * An order is created BEFORE it is paid, so a ping at creation tells the owner
 * to start packing an online order that may never be paid. The rule:
 *
 *   | payment method        | the shop's «нове замовлення» ping                     |
 *   | --------------------- | ----------------------------------------------------- |
 *   | ON_DELIVERY           | at creation — the order is real the moment it exists  |
 *   | ONLINE, INSTALLMENTS  | when the provider CONFIRMS the payment (callback or   |
 *   |                       | reconcile), in the same transaction that records it   |
 *
 * INSTALLMENTS goes with ONLINE for the same reason it gets a reservation
 * deadline: until the provider says yes, it is a promise, not a sale.
 *
 * Exactly one of the two moments applies to every method, so an order can never
 * be announced twice — which is also why an ON_DELIVERY order that the customer
 * later pays online (`PaymentService.createCheckout` allows it) does NOT ping on
 * payment: it was announced when it was placed.
 *
 * Kept here, beside the delivery × payment matrix and for the same reason: pure,
 * no NestJS, no Prisma client, one table every caller asks. It lives in the order
 * module rather than in `notification/` because the question is "when is this
 * order real for the shop", which is order business — the notifier only knows
 * how to queue a ping, never when one is due.
 */

/**
 * Whether the shop is pinged when the order is CREATED.
 *
 * `null`/`undefined` reads as ON_DELIVERY: that is the column's default
 * (`Order.paymentMethod @default(ON_DELIVERY)`) and what a client that sends no
 * method gets, so it is what the order will actually be.
 */
export function shopPingAtCreation(method: PaymentMethod | null | undefined): boolean {
  return (method ?? PaymentMethod.ON_DELIVERY) === PaymentMethod.ON_DELIVERY;
}

/**
 * Whether the shop is pinged when the provider CONFIRMS the payment — the exact
 * complement of {@link shopPingAtCreation}, so every method has one moment.
 */
export function shopPingOnPaymentConfirmed(method: PaymentMethod | null | undefined): boolean {
  return !shopPingAtCreation(method);
}

/**
 * Whether a provider payment plan makes a LIVE order paid — the moment an online
 * order becomes real for the shop.
 *
 * Read off the plan, never off a fresh query: the repository applies the plan
 * with a conditional write on `plan.expected`, so if the write lands, these are
 * the facts it landed on.
 *
 * - the payment moves to PAID (a repeat SUCCEEDED on a paid order has no plan at
 *   all, a refused move carries no `paymentStatusChange`);
 * - the order is not CANCELLED. A success on a cancelled order (TASK-619,
 *   `PAID_AFTER_CANCEL`) records the money but leaves the order cancelled —
 *   announcing it as a new order would send the owner to pack something the
 *   shop no longer holds stock for. Both the status and the note are checked;
 *   the planner sets them together, and either alone is enough to say no.
 */
export function confirmsPaymentOfLiveOrder(
  plan: Pick<PaymentApplyPlan, 'expected' | 'paymentStatusChange'>,
): boolean {
  const change = plan.paymentStatusChange;
  return (
    change?.to === PaymentStatus.PAID &&
    change.note !== OrderHistoryNote.PAID_AFTER_CANCEL &&
    plan.expected.status !== OrderStatus.CANCELLED
  );
}
