import {
  orderHeadlineStatusLabel,
  orderPaymentStatusLabel,
  orderStatusLabel,
  orderStatusLabelFor,
  paymentStatusLabel,
} from "./status-label";

describe("orderStatusLabel (TASK-129)", () => {
  it.each([
    ["PENDING", "Очікує підтвердження"],
    ["CONFIRMED", "Підтверджено"],
    ["PROCESSING", "В обробці"],
    ["SHIPPED", "Відправлено"],
    ["DELIVERED", "Отримано покупцем"],
    ["CANCELLED", "Скасовано"],
    ["REFUNDED", "Повернення коштів"],
  ])("maps %s → %s", (status, label) => {
    expect(orderStatusLabel(status)).toBe(label);
  });

  it("falls back to the raw value for an unknown status", () => {
    expect(orderStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

/**
 * TASK-2052 (B-12 topic 6): no new enum value — a SHIPPED pickup order is worded
 * «Готово до видачі»; every other pair reads as the generic label.
 */
describe("orderStatusLabelFor (TASK-2052)", () => {
  it("words SHIPPED on a pickup order as «Готово до видачі»", () => {
    expect(orderStatusLabelFor("SHIPPED", "PICKUP")).toBe("Готово до видачі");
  });

  it.each([["NOVA_POSHTA"], ["COURIER"], ["OTHER"], [null], [undefined]])(
    "keeps «Відправлено» for delivery method %p",
    (method) => {
      expect(orderStatusLabelFor("SHIPPED", method)).toBe("Відправлено");
    },
  );

  it.each([
    ["PENDING", "Очікує підтвердження"],
    ["CONFIRMED", "Підтверджено"],
    ["PROCESSING", "В обробці"],
    ["DELIVERED", "Отримано покупцем"],
    ["CANCELLED", "Скасовано"],
  ])("leaves %s on a pickup order as the generic «%s»", (status, label) => {
    expect(orderStatusLabelFor(status, "PICKUP")).toBe(label);
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
      "Отримано покупцем",
    );
  });

  it("reads «Готово до видачі» on a shipped pickup order (TASK-2052)", () => {
    expect(
      orderHeadlineStatusLabel({
        ...base,
        status: "SHIPPED",
        deliveryMethod: "PICKUP",
      }),
    ).toBe("Готово до видачі");
    expect(
      orderHeadlineStatusLabel({
        ...base,
        status: "SHIPPED",
        deliveryMethod: "NOVA_POSHTA",
      }),
    ).toBe("Відправлено");
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

describe("a cancelled original whose money went to its copy (TASK-2048)", () => {
  it("reads «Оплату перенесено в копію», not «Кошти повернено»", () => {
    expect(
      orderPaymentStatusLabel({
        paymentStatus: "REFUNDED",
        refundedKop: 120000,
        offsetOutKop: 120000,
      }),
    ).toBe("Оплату перенесено в копію");
  });

  it("keeps «Кошти повернено» when money really went back", () => {
    expect(
      orderPaymentStatusLabel({
        paymentStatus: "REFUNDED",
        refundedKop: 120000,
      }),
    ).toBe("Кошти повернено");
    expect(
      orderPaymentStatusLabel({
        paymentStatus: "REFUNDED",
        refundedKop: 120000,
        offsetOutKop: 20000,
      }),
    ).toBe("Кошти повернено");
  });

  it("says «повернуто частково» when only part of what was not moved came back", () => {
    expect(
      orderHeadlineStatusLabel({
        status: "CANCELLED",
        paidKop: 120000,
        refundedKop: 100000,
        offsetOutKop: 60000,
        refundedAfterCancel: true,
      }),
    ).toBe("Скасовано · повернуто частково");
  });

  it("says «кошти повернено» when the rest, beyond the offset, all came back", () => {
    expect(
      orderHeadlineStatusLabel({
        status: "CANCELLED",
        paidKop: 120000,
        refundedKop: 120000,
        offsetOutKop: 60000,
        refundedAfterCancel: true,
      }),
    ).toBe("Скасовано · кошти повернено");
  });
});
