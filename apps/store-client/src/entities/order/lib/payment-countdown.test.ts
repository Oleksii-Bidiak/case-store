import {
  awaitingPaymentMinutes,
  reservationMinutesLeft,
} from "./payment-countdown";

const NOW = Date.parse("2026-10-04T12:00:00.000Z");
const inMs = (ms: number) => new Date(NOW + ms).toISOString();

describe("reservationMinutesLeft (TASK-217)", () => {
  it("rounds a partial minute UP", () => {
    expect(reservationMinutesLeft(inMs(22 * 60_000 + 10_000), NOW)).toBe(23);
    expect(reservationMinutesLeft(inMs(23 * 60_000), NOW)).toBe(23);
    expect(reservationMinutesLeft(inMs(1), NOW)).toBe(1);
  });

  it("is 0 at and after the deadline", () => {
    expect(reservationMinutesLeft(inMs(0), NOW)).toBe(0);
    expect(reservationMinutesLeft(inMs(-60_000), NOW)).toBe(0);
  });

  it("is 0 without a timed reservation or with an unreadable one", () => {
    expect(reservationMinutesLeft(null, NOW)).toBe(0);
    expect(reservationMinutesLeft(undefined, NOW)).toBe(0);
    expect(reservationMinutesLeft("не дата", NOW)).toBe(0);
  });
});

describe("awaitingPaymentMinutes (TASK-217)", () => {
  const awaiting = {
    paymentMethod: "ONLINE",
    paymentStatus: "PENDING",
    status: "PENDING",
    reservationExpiresAt: inMs(10 * 60_000),
  } as const;

  it("counts down an unpaid online order that still holds its stock", () => {
    expect(awaitingPaymentMinutes(awaiting, NOW)).toBe(10);
  });

  it.each([
    ["cash on delivery", { paymentMethod: "ON_DELIVERY" }],
    ["installments", { paymentMethod: "INSTALLMENTS" }],
    ["a paid order", { paymentStatus: "PAID" }],
    ["a failed payment", { paymentStatus: "FAILED" }],
    ["an order already confirmed", { status: "CONFIRMED" }],
    ["a cancelled order", { status: "CANCELLED" }],
    ["no reservation", { reservationExpiresAt: null }],
    ["a lapsed reservation", { reservationExpiresAt: inMs(-1) }],
  ] as const)("is 0 for %s", (_label, override) => {
    expect(awaitingPaymentMinutes({ ...awaiting, ...override }, NOW)).toBe(0);
  });
});
