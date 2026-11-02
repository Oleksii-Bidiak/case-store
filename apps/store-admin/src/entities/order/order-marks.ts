import {
  OrderEntityPaymentMethod,
  OrderEntityPaymentStatus,
  OrderEntityStatus,
  type OrderEntity,
} from "@/shared/api";
import { dict } from "@/shared/config";
import { formatKop } from "@/shared/lib";

/**
 * The derived marks of owner decision B-1 (TASK-470 / 471 / 472), money marks
 * re-derived from the order money ledger in R2 (TASK-1968).
 *
 * ## Why this file exists at all
 *
 * The same marks have to render in two places that look nothing alike — a row
 * of the order list and the header of the order card — and the operator has to
 * be able to trust that a row without a chip really is an order without that
 * problem. Two implementations of «Борг» would eventually disagree, and the
 * disagreement would show up as an order that is flagged on one screen and clean
 * on the other, which is worse than neither screen flagging it.
 *
 * «Позиція недоступна» is deliberately NOT here: it belongs to a LINE, not to an
 * order, and the server already says which lines (`unavailableItemIds`). Its
 * aggregate is the dashboard tile.
 *
 * ## Why they are computed and not read
 *
 * Because none of them is stored — that is the owner's decision, not an
 * omission (B-1, closing paragraph). Every one is a sentence about fields that
 * already exist. The money ones read the server's ledger figures (`balanceKop`,
 * `refundedKop`, `returnCreditKop` — integer kopecks); nothing here parses a
 * hryvnia string into a float. The list's server-side filters (`hasDebt`,
 * `awaitingPayment`, `reservationExpired`) restate the identical conditions, so
 * a row returned by a filter always carries the matching chip.
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
  | "debt"
  | "owedToCustomer"
  | "awaitingPayment"
  | "reservationExpired"
  | "partiallyRefunded"
  | "refunded";

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
  | "reservationExpiresAt"
  | "refundedKop"
  | "returnCreditKop"
  | "balanceKop"
>;

/**
 * Payment methods whose reservation runs on a clock.
 *
 * Mirrors the server twin exactly — `resolveReservationDeadline` gives a
 * deadline to everything except ON_DELIVERY (and BANK_TRANSFER), and
 * `findExpiredReservations` cancels on `IN (ONLINE, INSTALLMENTS)`. Listed
 * rather than written as `!== ON_DELIVERY` so a new method has to be considered
 * here deliberately instead of silently inheriting a countdown.
 */
const TIMED_RESERVATION_METHODS: ReadonlyArray<OrderEntityPaymentMethod> = [
  OrderEntityPaymentMethod.ONLINE,
  OrderEntityPaymentMethod.INSTALLMENTS,
];

/** Whole minutes left on a reservation; never negative. */
export function minutesUntil(deadline: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(deadline) - now) / 60_000));
}

export function orderDerivedMarks(
  order: OrderMarkSource,
  now: number = Date.now(),
): OrderMark[] {
  const marks: OrderMark[] = [];

  // «Борг N ₴» / «Винні покупцю N ₴» — ONE balance, the server's
  // (`total − returnCredit − paid + refunded`, R2 TASK-1968). Before R2 «Борг»
  // fired on any unsettled payment label and printed `total − refunded`, so a
  // paid order with one line returned read «Борг 2 297 ₴» beside «Частково
  // повернуто 100 з 2 397» (AD-RET-17). Now:
  //  - «Борг» only on a DELIVERED order that still owes — the server's
  //    `hasDebt` filter is the same sentence. An order still on its way owes
  //    nothing YET (the «Оплата» block says «До сплати»).
  //  - «Винні покупцю» whenever the balance is negative, whatever the status:
  //    returned goods not yet paid out, or an overpayment.
  if (order.balanceKop > 0 && order.status === OrderEntityStatus.DELIVERED) {
    marks.push({
      kind: "debt",
      label: dict.orders.markDebt(formatKop(order.balanceKop)),
      variant: "destructive",
    });
  } else if (order.balanceKop < 0) {
    marks.push({
      kind: "owedToCustomer",
      // The sign is the server's way of saying "we owe"; the chip reads the
      // amount owed, unsigned — as the «Оплата» block does.
      label: dict.orders.markOwedToCustomer(formatKop(-order.balanceKop)),
      variant: "warning",
    });
  }

  // «Очікує оплати · N хв» / «Резерв сплив» — the same triple on either side of
  // the deadline. A null deadline is neither: an order with no timed reservation
  // is not waiting for one to run out.
  //
  // The method test is a SET, not `=== ONLINE` (review of plan 180). BNPL orders
  // get a deadline too, and an `=== ONLINE` chip meant the one class of order
  // the worker will silently cancel was the one class with no warning on screen.
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

  // What went back (TASK-472 → R2 TASK-1968). «з N» is the value of the goods
  // that came back (`returnCreditKop`), not the order total: 100 paid out on a
  // 799 return is «Частково повернуто 100 з 799», which is what is still to
  // settle. Money that went back without a return (a cancelled order, an
  // overpayment) — or once the returns are fully paid out — has no «з» to
  // measure against: «Повернуто X». A full refund needs no chip: the payment
  // badge already says «Кошти повернено».
  if (order.refundedKop > 0) {
    if (order.returnCreditKop > order.refundedKop) {
      marks.push({
        kind: "partiallyRefunded",
        label: dict.orders.markPartiallyRefunded(
          formatKop(order.refundedKop),
          formatKop(order.returnCreditKop),
        ),
        variant: "secondary",
      });
    } else if (order.paymentStatus !== OrderEntityPaymentStatus.REFUNDED) {
      marks.push({
        kind: "refunded",
        label: dict.orders.markRefunded(formatKop(order.refundedKop)),
        variant: "secondary",
      });
    }
  }

  return marks;
}
