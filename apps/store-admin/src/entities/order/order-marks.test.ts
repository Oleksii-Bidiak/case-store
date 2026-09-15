import {
  OrderEntityPaymentMethod,
  OrderEntityPaymentStatus,
  OrderEntityStatus,
} from "@/shared/api";
import {
  minutesUntil,
  orderDerivedMarks,
  type OrderMarkSource,
} from "./order-marks";

/**
 * The derived marks of owner decision B-1, as the ADMIN PANEL computes them
 * (TASK-470 / 471 / 472).
 *
 * These conditions exist twice by design — here, and in `buildAdminWhere` on the
 * server, which powers the matching list filters. That is not duplication to be
 * removed: one side has to decide which rows to fetch and the other which chip
 * to draw, and neither can do the other's job. What it does mean is that the
 * conditions have to be pinned on both sides, because the way they fail is
 * quiet: a filter returns a row that carries no chip, or a chip appears on a row
 * the filter would not have returned, and either way the operator learns that
 * the marks cannot be trusted.
 *
 * The clock is passed in rather than read, so «Очікує оплати · N хв» can be
 * stated as a fact instead of raced against.
 */

const NOW = Date.parse("2026-09-14T12:00:00.000Z");

function buildOrder(overrides: Partial<OrderMarkSource> = {}): OrderMarkSource {
  return {
    status: OrderEntityStatus.CONFIRMED,
    paymentStatus: OrderEntityPaymentStatus.PENDING,
    paymentMethod: OrderEntityPaymentMethod.ON_DELIVERY,
    total: "1200.00",
    reservationExpiresAt: null,
    ...overrides,
  };
}

const kinds = (order: OrderMarkSource) =>
  orderDerivedMarks(order, NOW).map((mark) => mark.kind);

describe("orderDerivedMarks — «Борг N ₴» (TASK-470)", () => {
  it("marks a delivered order that was never paid for", () => {
    const marks = orderDerivedMarks(
      buildOrder({
        status: OrderEntityStatus.DELIVERED,
        paymentStatus: OrderEntityPaymentStatus.PENDING,
      }),
      NOW,
    );

    expect(marks).toHaveLength(1);
    expect(marks[0].kind).toBe("debt");
    // The amount is in the label: an operator ringing a customer needs the
    // figure, not a flag that something is wrong.
    expect(marks[0].label).toContain("1");
    expect(marks[0].label).toContain("200");
  });

  it("marks a delivered order whose payment FAILED", () => {
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.DELIVERED,
          paymentStatus: OrderEntityPaymentStatus.FAILED,
        }),
      ),
    ).toContain("debt");
  });

  it("does not mark a delivered order that was paid", () => {
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.DELIVERED,
          paymentStatus: OrderEntityPaymentStatus.PAID,
        }),
      ),
    ).not.toContain("debt");
  });

  it("does not mark a delivered order that was fully refunded", () => {
    // Money went out, not in — there is no debt to chase, and a chip saying
    // there is would send an operator after a customer who owes nothing.
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.DELIVERED,
          paymentStatus: OrderEntityPaymentStatus.REFUNDED,
        }),
      ),
    ).not.toContain("debt");
  });

  it("does not mark an unpaid order that has not been delivered yet", () => {
    // An unpaid order that is still in the shop's hands is the NORMAL state of
    // cash-on-delivery. The debt only becomes one once the goods are gone.
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.PROCESSING,
          paymentStatus: OrderEntityPaymentStatus.PENDING,
        }),
      ),
    ).not.toContain("debt");
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

describe("orderDerivedMarks — «Частково повернуто X з Y» (TASK-472)", () => {
  it("names both halves of the fraction", () => {
    const marks = orderDerivedMarks(
      buildOrder({
        paymentStatus: OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
        refundedTotal: "499.00",
        total: "1200.00",
      }),
      NOW,
    );

    expect(marks).toHaveLength(1);
    expect(marks[0].kind).toBe("partiallyRefunded");
    expect(marks[0].label).toContain("499");
    expect(marks[0].label).toContain("200");
  });

  it("is silent when the response did not carry the refunded sum", () => {
    // `refundedTotal` is ABSENT, not zero, on a read that did not join the
    // returns. «Частково повернуто 0,00 ₴» would be a figure nobody measured.
    expect(
      kinds(
        buildOrder({
          paymentStatus: OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
        }),
      ),
    ).toEqual([]);
  });

  it("is silent on a fully refunded order", () => {
    expect(
      kinds(
        buildOrder({
          paymentStatus: OrderEntityPaymentStatus.REFUNDED,
          refundedTotal: "1200.00",
        }),
      ),
    ).not.toContain("partiallyRefunded");
  });
});

describe("orderDerivedMarks — the marks coexist", () => {
  it("reports a debt and a partial refund on the same order", () => {
    // PARTIALLY_REFUNDED is NOT one of the settled statuses, exactly as the
    // catalogue words it (∉ {PAID, REFUNDED}): a delivered order with part of the
    // money returned still has an open question, and the point of the marks is
    // that awkward states are visible rather than tidied away.
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.DELIVERED,
          paymentStatus: OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
          refundedTotal: "499.00",
        }),
      ),
    ).toEqual(["debt", "partiallyRefunded"]);
  });

  it("states the debt as what is left, not as the whole order", () => {
    // The chip FIRING on a partially refunded order is the catalogue's wording.
    // The AMOUNT was not: it was always `total`, so this card showed «Борг
    // 1 200 ₴» beside «Повернуто 499 ₴ з 1 200 ₴» — two figures, neither of them
    // a debt anyone had (review of plan 180). 1200 − 499 = 701.
    const marks = orderDerivedMarks(
      buildOrder({
        status: OrderEntityStatus.DELIVERED,
        paymentStatus: OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
        refundedTotal: "499.00",
        total: "1200.00",
      }),
      NOW,
    );

    const debt = marks.find((mark) => mark.kind === "debt");
    expect(debt?.label).toContain("701");
    expect(debt?.label).not.toContain("1 200");
  });

  it("falls back to the total when the read did not measure the refunds", () => {
    // `refundedTotal` absent means "not measured". Inventing a smaller debt from
    // a measurement we do not have is the same lie in the other direction.
    const marks = orderDerivedMarks(
      buildOrder({
        status: OrderEntityStatus.DELIVERED,
        paymentStatus: OrderEntityPaymentStatus.PENDING,
        total: "1200.00",
      }),
      NOW,
    );

    expect(marks.find((mark) => mark.kind === "debt")?.label).toContain("200");
  });

  it("never prints a negative debt when more went back than came in", () => {
    const marks = orderDerivedMarks(
      buildOrder({
        status: OrderEntityStatus.DELIVERED,
        paymentStatus: OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
        refundedTotal: "1500.00",
        total: "1200.00",
      }),
      NOW,
    );

    expect(marks.find((mark) => mark.kind === "debt")?.label).not.toContain(
      "-",
    );
  });

  it("reports nothing at all for an ordinary, healthy order", () => {
    expect(
      kinds(
        buildOrder({
          status: OrderEntityStatus.PROCESSING,
          paymentStatus: OrderEntityPaymentStatus.PAID,
        }),
      ),
    ).toEqual([]);
  });
});
