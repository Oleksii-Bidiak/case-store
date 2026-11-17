import { dict } from "./dictionary";

/**
 * TASK-2052 (B-12 topic 6): no new order status — a SHIPPED pickup order is
 * worded «Готово до видачі», DELIVERED is «Отримано покупцем» for everyone.
 */
describe("dict.order.orderStatusLabelFor (TASK-2052)", () => {
  const { orderStatusLabelFor } = dict.order;

  it("words SHIPPED on a pickup order as «Готово до видачі»", () => {
    expect(orderStatusLabelFor("SHIPPED", "PICKUP")).toBe("Готово до видачі");
    expect(dict.order.pickupReadyLabel).toBe("Готово до видачі");
  });

  it.each([["NOVA_POSHTA"], ["COURIER"], ["OTHER"], [null], [undefined]])(
    "keeps «Відправлено» for delivery method %p",
    (method) => {
      expect(orderStatusLabelFor("SHIPPED", method)).toBe("Відправлено");
    },
  );

  it("calls DELIVERED «Отримано покупцем» whatever the delivery method", () => {
    expect(orderStatusLabelFor("DELIVERED", "PICKUP")).toBe(
      "Отримано покупцем",
    );
    expect(orderStatusLabelFor("DELIVERED", "NOVA_POSHTA")).toBe(
      "Отримано покупцем",
    );
    expect(dict.order.orderStatusLabels.DELIVERED).toBe("Отримано покупцем");
  });

  it("leaves the other statuses of a pickup order generic", () => {
    expect(orderStatusLabelFor("CONFIRMED", "PICKUP")).toBe("Підтверджено");
    expect(orderStatusLabelFor("CANCELLED", "PICKUP")).toBe("Скасовано");
  });

  it("falls back to the raw value for an unknown status", () => {
    expect(orderStatusLabelFor("UNKNOWN", "PICKUP")).toBe("UNKNOWN");
  });

  it("speaks the same words to a screen reader", () => {
    expect(dict.order.orderStatusAria("SHIPPED", "PICKUP")).toBe(
      "Статус замовлення: Готово до видачі",
    );
    expect(dict.order.orderStatusAria("SHIPPED")).toBe(
      "Статус замовлення: Відправлено",
    );
  });

  it("keeps the generic word for SHIPPED where no order is behind it", () => {
    expect(dict.order.orderStatusLabels.SHIPPED).toBe("Відправлено");
    expect(dict.orderHistory.tabs.delivered).toBe("Отримані");
  });
});

describe("dict.order.paymentLabel — money moved to a replacement (TASK-2048)", () => {
  it("does not promise a refund when all the money went to the new order", () => {
    expect(
      dict.order.paymentLabel("REFUNDED", {
        refundedKop: 50000,
        offsetOutKop: 50000,
      }),
    ).toBe("Оплата: перенесена в нове замовлення");
  });

  it("keeps «Кошти повернено» for a real refund", () => {
    expect(
      dict.order.paymentLabel("REFUNDED", {
        refundedKop: 50000,
        offsetOutKop: 0,
      }),
    ).toBe("Оплата: Кошти повернено");
    expect(dict.order.paymentLabel("REFUNDED")).toBe("Оплата: Кошти повернено");
  });
});
