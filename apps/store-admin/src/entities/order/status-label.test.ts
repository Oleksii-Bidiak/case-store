import {
  orderHeadlineStatusLabel,
  orderStatusLabel,
  paymentStatusLabel,
} from "./status-label";

describe("orderStatusLabel (TASK-129)", () => {
  it.each([
    ["PENDING", "Очікує підтвердження"],
    ["CONFIRMED", "Підтверджено"],
    ["PROCESSING", "В обробці"],
    ["SHIPPED", "Відправлено"],
    ["DELIVERED", "Доставлено"],
    ["CANCELLED", "Скасовано"],
    ["REFUNDED", "Повернення коштів"],
  ])("maps %s → %s", (status, label) => {
    expect(orderStatusLabel(status)).toBe(label);
  });

  it("falls back to the raw value for an unknown status", () => {
    expect(orderStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("paymentStatusLabel (TASK-129)", () => {
  it.each([
    ["PENDING", "Очікує оплати"],
    // R2 (TASK-2047): derived from the money journal.
    ["PARTIALLY_PAID", "Частково оплачено"],
    ["PAID", "Оплачено"],
    ["FAILED", "Помилка оплати"],
    // TASK-431 — and worded so the two refund states cannot be confused at a
    // glance in a column of badges.
    ["PARTIALLY_REFUNDED", "Частково повернуто"],
    ["REFUNDED", "Кошти повернено"],
  ])("maps %s → %s", (status, label) => {
    expect(paymentStatusLabel(status)).toBe(label);
  });

  it("gives the partial and the full refund different labels", () => {
    expect(paymentStatusLabel("PARTIALLY_REFUNDED")).not.toBe(
      paymentStatusLabel("REFUNDED"),
    );
  });

  it("falls back to the raw value for an unknown status", () => {
    expect(paymentStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("uses a different label from orderStatusLabel for shared enum keys", () => {
    // PENDING and REFUNDED exist in both enums but must read differently.
    expect(paymentStatusLabel("PENDING")).not.toBe(orderStatusLabel("PENDING"));
    expect(paymentStatusLabel("REFUNDED")).not.toBe(
      orderStatusLabel("REFUNDED"),
    );
  });
});

describe("orderHeadlineStatusLabel (TASK-1970)", () => {
  const base = { paidKop: 120000, refundedKop: 0, refundedAfterCancel: false };

  it("reads as the plain status label when no money went back after a cancel", () => {
    expect(orderHeadlineStatusLabel({ ...base, status: "CANCELLED" })).toBe(
      "Скасовано",
    );
    expect(orderHeadlineStatusLabel({ ...base, status: "DELIVERED" })).toBe(
      "Доставлено",
    );
  });

  it("says «Скасовано · кошти повернено» when everything paid came back", () => {
    expect(
      orderHeadlineStatusLabel({
        status: "CANCELLED",
        paidKop: 120000,
        refundedKop: 120000,
        refundedAfterCancel: true,
      }),
    ).toBe("Скасовано · кошти повернено");
  });

  it("says «Скасовано · повернуто частково» while part of it is still held", () => {
    expect(
      orderHeadlineStatusLabel({
        status: "CANCELLED",
        paidKop: 120000,
        refundedKop: 50000,
        refundedAfterCancel: true,
      }),
    ).toBe("Скасовано · повернуто частково");
  });
});
