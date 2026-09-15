import {
  OrderEntityPaymentMethod,
  OrderEntityPaymentStatus,
  OrderEntityStatus,
  type OrderEntity,
} from "@/shared/api";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";

/**
 * The derived marks of owner decision B-1 (TASK-470 / 471 / 472).
 *
 * ## Why this file exists at all
 *
 * The same four marks have to render in two places that look nothing alike —
 * a row of the order list and the header of the order card — and the operator
 * has to be able to trust that a row without a chip really is an order without
 * that problem. Two implementations of «Борг» would eventually disagree, and the
 * disagreement would show up as an order that is flagged on one screen and clean
 * on the other, which is worse than neither screen flagging it.
 *
 * The fifth mark, «Позиція недоступна», is deliberately NOT here: it belongs to
 * a LINE, not to an order, and the server already says which lines
 * (`unavailableItemIds`). Its aggregate is the dashboard tile.
 *
 * ## Why they are computed and not read
 *
 * Because none of them is stored — that is the owner's decision, not an
 * omission (B-1, closing paragraph). Every one is a sentence about columns that
 * already exist, and a mark kept as its own record drifts away from the fact the
 * first time some path forgets to rewrite it. The list's server-side filters
 * (`hasDebt`, `awaitingPayment`, `reservationExpired`) restate the identical
 * conditions in `buildAdminWhere`, so a row returned by a filter always carries
 * the matching chip.
 *
 * ## The clock
 *
 * «Очікує оплати · N хв» counts down, so its text is only true at the instant it
 * was rendered. `now` is a parameter rather than a call to `Date.now()` inside,
 * both so the tests can state an instant and so a caller rendering a whole page
 * passes ONE instant to every row — otherwise two orders with the same deadline
 * can show different minute counts on the same screen.
 */

export type OrderMarkKind =
  "debt" | "awaitingPayment" | "reservationExpired" | "partiallyRefunded";

export interface OrderMark {
  kind: OrderMarkKind;
  label: string;
  /** Badge tone — see `shared/ui/badge`. */
  variant: "warning" | "destructive" | "secondary";
}

/**
 * The fields a mark is derived from. A structural subset of `OrderEntity`, so
 * the list row and the order card can both pass whatever they already hold.
 */
export type OrderMarkSource = Pick<
  OrderEntity,
  | "status"
  | "paymentStatus"
  | "paymentMethod"
  | "total"
  | "reservationExpiresAt"
  | "refundedTotal"
>;

/** Payment states in which a delivered order owes nothing. */
const SETTLED_PAYMENT_STATUSES: ReadonlyArray<OrderEntityPaymentStatus> = [
  OrderEntityPaymentStatus.PAID,
  OrderEntityPaymentStatus.REFUNDED,
];

/**
 * Payment methods whose reservation runs on a clock.
 *
 * Mirrors the server twin exactly — `resolveReservationDeadline` gives a
 * deadline to everything except ON_DELIVERY, and `findExpiredReservations`
 * cancels on `IN (ONLINE, INSTALLMENTS)`. Listed rather than written as
 * `!== ON_DELIVERY` so a sixth method has to be considered here deliberately
 * instead of silently inheriting a countdown.
 */
const TIMED_RESERVATION_METHODS: ReadonlyArray<OrderEntityPaymentMethod> = [
  OrderEntityPaymentMethod.ONLINE,
  OrderEntityPaymentMethod.INSTALLMENTS,
];

/** Whole minutes left on a reservation; never negative. */
export function minutesUntil(deadline: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(deadline) - now) / 60_000));
}

/**
 * What «Борг» should actually say — the total minus whatever went back.
 *
 * The mark fires for every unsettled payment status, PARTIALLY_REFUNDED
 * included, and that is the catalogue's wording, not an oversight (B-1 §1: an
 * open money question is worth showing). The AMOUNT was the oversight: it was
 * always `total`, so a fully paid order with one line refunded rendered «Борг
 * 12 000 ₴» beside «Повернуто 1 200 ₴ з 12 000 ₴» — two numbers on one card,
 * neither of which anyone owed (review of plan 180).
 *
 * Subtracted in integer kopiykas so 1 200,10 does not become 1 200,099999.
 * `refundedTotal` absent means the read did not join the returns, and then the
 * honest answer is the total: inventing a smaller debt from a measurement we do
 * not have would be the same class of lie in the other direction. Clamped at
 * zero — an over-refund is a different problem and must not print a negative
 * debt.
 */
function outstandingAmount(
  total: string,
  refundedTotal?: string | null,
): number {
  const totalKop = Math.round(Number(total) * 100);
  if (refundedTotal == null) return totalKop / 100;

  const refundedKop = Math.round(Number(refundedTotal) * 100);
  if (!Number.isFinite(refundedKop)) return totalKop / 100;

  return Math.max(0, totalKop - refundedKop) / 100;
}

export function orderDerivedMarks(
  order: OrderMarkSource,
  now: number = Date.now(),
): OrderMark[] {
  const marks: OrderMark[] = [];

  // «Борг N ₴» — delivered goods nobody has paid for. PARTIALLY_REFUNDED counts
  // as unsettled here, exactly as the catalogue states it (∉ {PAID, REFUNDED}):
  // the operator still has an open money question on that order, and the whole
  // point of the mark is that it is visible rather than correct-by-omission.
  //
  // The amount, though, is the total MINUS what went back — see
  // `outstandingAmount`. Showing the full total on a partially refunded order
  // printed a debt nobody had, right next to the chip that said how much had
  // been returned (review of plan 180).
  if (
    order.status === OrderEntityStatus.DELIVERED &&
    !SETTLED_PAYMENT_STATUSES.includes(order.paymentStatus)
  ) {
    marks.push({
      kind: "debt",
      label: dict.orders.markDebt(
        formatCurrency(outstandingAmount(order.total, order.refundedTotal)),
      ),
      variant: "destructive",
    });
  }

  // «Очікує оплати · N хв» / «Резерв сплив» — the same triple on either side of
  // the deadline. A null deadline is neither: an order with no timed reservation
  // is not waiting for one to run out.
  //
  // The method test is a SET, not `=== ONLINE` (review of plan 180). BNPL orders
  // get a deadline too — `resolveReservationDeadline` excludes only ON_DELIVERY,
  // and `findExpiredReservations` cancels on `paymentMethod IN (ONLINE,
  // INSTALLMENTS)` — so an `=== ONLINE` chip meant the one class of order the
  // worker will silently cancel was the one class with no warning on screen.
  if (
    TIMED_RESERVATION_METHODS.includes(order.paymentMethod) &&
    order.paymentStatus === OrderEntityPaymentStatus.PENDING &&
    order.reservationExpiresAt
  ) {
    const minutes = minutesUntil(order.reservationExpiresAt, now);
    marks.push(
      minutes > 0
        ? {
            kind: "awaitingPayment",
            label: dict.orders.markAwaitingPayment(minutes),
            variant: "warning",
          }
        : {
            kind: "reservationExpired",
            label: dict.orders.markReservationExpired,
            variant: "secondary",
          },
    );
  }

  // «Частково повернуто X з Y» (TASK-472). Guarded on the sum being PRESENT, not
  // on it being non-zero: `refundedTotal` is absent whenever the read did not
  // join the returns, and «Повернуто 0,00 ₴» would be a number we never measured.
  if (
    order.paymentStatus === OrderEntityPaymentStatus.PARTIALLY_REFUNDED &&
    order.refundedTotal != null
  ) {
    marks.push({
      kind: "partiallyRefunded",
      label: dict.orders.markPartiallyRefunded(
        formatCurrency(order.refundedTotal),
        formatCurrency(order.total),
      ),
      variant: "secondary",
    });
  }

  return marks;
}
