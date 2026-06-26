import { orderStatusLabel, paymentStatusLabel } from "./status-label";

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
    ["PAID", "Оплачено"],
    ["FAILED", "Помилка оплати"],
    ["REFUNDED", "Кошти повернено"],
  ])("maps %s → %s", (status, label) => {
    expect(paymentStatusLabel(status)).toBe(label);
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
