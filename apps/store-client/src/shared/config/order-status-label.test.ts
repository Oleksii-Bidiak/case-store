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
