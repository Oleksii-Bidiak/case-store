import {
  OrderEntityPaymentMethod,
  OrderEntityPaymentStatus,
  OrderEntityStatus,
} from "@/shared/api";
import { formatKop } from "@/shared/lib";
import {
  minutesUntil,
  orderDerivedMarks,
  type OrderMarkSource,
} from "./order-marks";

/**
 * The derived marks of owner decision B-1, as the ADMIN PANEL computes them
 * (TASK-470 / 471 / 472; money marks from the ledger since R2, TASK-1968).
 *
 * These conditions exist twice by design — here, and in `buildAdminWhere` on the
 * server, which powers the matching list filters. They have to be pinned on both
 * sides, because the way they fail is quiet: a filter returns a row that carries
 * no chip, or a chip appears on a row the filter would not have returned.
 *
 * The clock is passed in rather than read, so «Очікує оплати · N хв» can be
 * stated as a fact instead of raced against.
 */

const NOW = Date.parse("2026-09-14T12:00:00.000Z");

/** Intl groups with NBSP / narrow NBSP depending on the ICU build. */
const plain = (value: string) => value.replace(/[  ]/g, " ");

function buildOrder(overrides: Partial<OrderMarkSource> = {}): OrderMarkSource {
  return {
    status: OrderEntityStatus.CONFIRMED,
    paymentStatus: OrderEntityPaymentStatus.PENDING,
    paymentMethod: OrderEntityPaymentMethod.ON_DELIVERY,
    reservationExpiresAt: null,
    refundedKop: 0,
    returnCreditKop: 0,
    balanceKop: 120000,
    ...overrides,
  };
}

const kinds = (order: OrderMarkSource) =>
  orderDerivedMarks(order, NOW).map((mark) => mark.kind);
const labels = (order: OrderMarkSource) =>
  orderDerivedMarks(order, NOW).map((mark) => plain(mark.label));

describe("orderDerivedMarks — «Борг» / «Винні покупцю» from the balance (TASK-1968)", () => {
  it.each([
    // [what, status, balanceKop, expected kinds]
    ["delivered, still owes", OrderEntityStatus.DELIVERED, 120000, ["debt"]],
    ["delivered, settled", OrderEntityStatus.DELIVERED, 0, []],
    [
      "delivered, overpaid",
      OrderEntityStatus.DELIVERED,
      -5000,
      ["owedToCustomer"],
    ],
    // Cash on delivery still in the shop's hands is the NORMAL state: the debt
    // only becomes one once the goods are gone (the server's `hasDebt`).
    ["processing, unpaid", OrderEntityStatus.PROCESSING, 120000, []],
    ["shipped, unpaid", OrderEntityStatus.SHIPPED, 120000, []],
    ["shipped, overpaid", OrderEntityStatus.SHIPPED, -100, ["owedToCustomer"]],
    [
      "refunded order, owed back",
      OrderEntityStatus.REFUNDED,
      -2500,
      ["owedToCustomer"],
    ],
    ["cancelled (nothing is due)", OrderEntityStatus.CANCELLED, 0, []],
  ])("%s", (_what, status, balanceKop, expected) => {
    expect(kinds(buildOrder({ status, balanceKop }))).toEqual(expected);
  });

  it("prints the balance itself in integer kopecks — «Борг 1 200 ₴»", () => {
    expect(
      labels(
        buildOrder({ status: OrderEntityStatus.DELIVERED, balanceKop: 120010 }),
      ),
    ).toEqual(["Борг 1 200,1 ₴"]);
  });

  it("names what the shop owes unsigned — «Винні покупцю 699 ₴»", () => {
    expect(labels(buildOrder({ balanceKop: -69900 }))).toEqual([
      "Винні покупцю 699 ₴",
    ]);
  });

  it("no longer reads the payment label: a PARTIALLY_REFUNDED delivered order with a zero balance owes nothing", () => {
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.DELIVERED,
          paymentStatus: OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
          balanceKop: 0,
          refundedKop: 79900,
          returnCreditKop: 79900,
        }),
      ),
    ).not.toContain("debt");
  });
});

describe("orderDerivedMarks — what went back (TASK-472 → TASK-1968)", () => {
  it("AD-RET-17: paid 2 397, a 799 return, 100 paid out → «Частково повернуто 100 з 799», «Винні покупцю 699», no «Борг»", () => {
    // balance = total − returnCredit − paid + refunded = 2397 − 799 − 2397 + 100
    const order = buildOrder({
      status: OrderEntityStatus.DELIVERED,
      paymentStatus: OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
      refundedKop: 10000,
      returnCreditKop: 79900,
      balanceKop: 239700 - 79900 - 239700 + 10000,
    });

    expect(kinds(order)).toEqual(["owedToCustomer", "partiallyRefunded"]);
    expect(labels(order)).toEqual([
      "Винні покупцю 699 ₴",
      "Частково повернуто 100 ₴ з 799 ₴",
    ]);
  });

  it("measures against the returned goods, never the order total", () => {
    const [mark] = orderDerivedMarks(
      buildOrder({ refundedKop: 49900, returnCreditKop: 99800, balanceKop: 0 }),
      NOW,
    );
    expect(mark.label).toBe(
      `Частково повернуто ${formatKop(49900)} з ${formatKop(99800)}`,
    );
  });

  it("says «Повернуто X» without «з» for money back with no return (cancelled order)", () => {
    expect(
      labels(
        buildOrder({
          status: OrderEntityStatus.CANCELLED,
          paymentStatus: OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
          refundedKop: 50000,
          returnCreditKop: 0,
          balanceKop: 0,
        }),
      ),
    ).toEqual(["Повернуто 500 ₴"]);
  });

  it("says «Повернуто X» once the returns are fully paid out but the order still holds money", () => {
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.DELIVERED,
          paymentStatus: OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
          refundedKop: 79900,
          returnCreditKop: 79900,
          balanceKop: 0,
        }),
      ),
    ).toEqual(["refunded"]);
  });

  it("adds no chip on a full refund — the payment badge already says it", () => {
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.REFUNDED,
          paymentStatus: OrderEntityPaymentStatus.REFUNDED,
          refundedKop: 120000,
          returnCreditKop: 120000,
          balanceKop: 0,
        }),
      ),
    ).toEqual([]);
  });

  it("draws nothing while nothing went back", () => {
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.DELIVERED,
          paymentStatus: OrderEntityPaymentStatus.PAID,
          balanceKop: 0,
        }),
      ),
    ).toEqual([]);
  });
});

describe("orderDerivedMarks — the reservation window (TASK-471)", () => {
  const onlinePending = {
    paymentMethod: OrderEntityPaymentMethod.ONLINE,
    paymentStatus: OrderEntityPaymentStatus.PENDING,
  };

  it("counts the minutes left while the deadline is ahead", () => {
    const marks = orderDerivedMarks(
      buildOrder({
        ...onlinePending,
        reservationExpiresAt: "2026-09-14T12:23:00.000Z",
      }),
      NOW,
    );

    expect(marks[0].kind).toBe("awaitingPayment");
    expect(marks[0].label).toContain("23");
  });

  it("rounds a part-minute UP, so the last seconds do not read as zero", () => {
    // `Math.ceil`: «Очікує оплати · 0 хв» on an order that is still payable is a
    // sentence an operator would act on wrongly.
    expect(minutesUntil("2026-09-14T12:00:30.000Z", NOW)).toBe(1);
  });

  it("switches to «Резерв сплив» once the deadline has passed", () => {
    expect(
      kinds(
        buildOrder({
          ...onlinePending,
          reservationExpiresAt: "2026-09-14T11:59:00.000Z",
        }),
      ),
    ).toEqual(["reservationExpired"]);
  });

  it("treats the exact instant of the deadline as expired", () => {
    // The server splits the same set with `gt` / `lte`; this is the client half
    // of that split, and the two have to agree on the boundary or a row returned
    // by `?reservationExpired=true` would render the opposite chip.
    expect(
      kinds(
        buildOrder({
          ...onlinePending,
          reservationExpiresAt: "2026-09-14T12:00:00.000Z",
        }),
      ),
    ).toEqual(["reservationExpired"]);
  });

  it("marks neither state when the order holds no timed reservation", () => {
    expect(
      kinds(buildOrder({ ...onlinePending, reservationExpiresAt: null })),
    ).toEqual([]);
  });

  it("counts down a BNPL order too — the worker cancels those on the same clock", () => {
    // `resolveReservationDeadline` excludes only ON_DELIVERY, and
    // `findExpiredReservations` cancels on IN (ONLINE, INSTALLMENTS). An
    // `=== ONLINE` chip meant the one class of order that gets auto-cancelled was
    // the one class with no warning anywhere on screen (review of plan 180).
    expect(
      kinds(
        buildOrder({
          paymentMethod: OrderEntityPaymentMethod.INSTALLMENTS,
          paymentStatus: OrderEntityPaymentStatus.PENDING,
          reservationExpiresAt: "2026-09-14T12:23:00.000Z",
        }),
      ),
    ).toEqual(["awaitingPayment"]);
  });

  it("marks a BNPL reservation as expired once its deadline passes", () => {
    expect(
      kinds(
        buildOrder({
          paymentMethod: OrderEntityPaymentMethod.INSTALLMENTS,
          paymentStatus: OrderEntityPaymentStatus.PENDING,
          reservationExpiresAt: "2026-09-14T11:59:00.000Z",
        }),
      ),
    ).toEqual(["reservationExpired"]);
  });

  it("marks neither state for a cash-on-delivery order", () => {
    // A courier-paid order is unpaid until the parcel is handed over; it is not
    // waiting for a payment window to close.
    expect(
      kinds(
        buildOrder({
          paymentMethod: OrderEntityPaymentMethod.ON_DELIVERY,
          paymentStatus: OrderEntityPaymentStatus.PENDING,
          reservationExpiresAt: "2026-09-14T12:23:00.000Z",
        }),
      ),
    ).toEqual([]);
  });

  it("marks neither state once the card payment has arrived", () => {
    expect(
      kinds(
        buildOrder({
          paymentMethod: OrderEntityPaymentMethod.ONLINE,
          paymentStatus: OrderEntityPaymentStatus.PAID,
          reservationExpiresAt: "2026-09-14T12:23:00.000Z",
        }),
      ),
    ).toEqual([]);
  });
});
