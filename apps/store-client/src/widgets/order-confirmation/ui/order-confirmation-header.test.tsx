import { render, screen } from "@testing-library/react";
import { OrderConfirmationHeader } from "./order-confirmation-header";

const base = {
  orderId: "550e8400-e29b-41d4-a716-446655440000",
  paymentStatus: "PAID",
  createdAt: "2026-10-01T10:00:00.000Z",
} as const;

/**
 * TASK-2052: the header badge of the confirmation and guest order pages says
 * how this order leaves the shop — a SHIPPED pickup order is «Готово до видачі».
 */
describe("OrderConfirmationHeader — status badge (TASK-2052)", () => {
  it("reads «Готово до видачі» on a shipped pickup order", () => {
    render(
      <OrderConfirmationHeader
        {...base}
        status="SHIPPED"
        deliveryMethod="PICKUP"
      />,
    );
    expect(screen.getByText("Готово до видачі")).toBeInTheDocument();
    expect(screen.queryByText("Відправлено")).not.toBeInTheDocument();
  });

  it("keeps «Відправлено» on a shipped Nova Poshta order", () => {
    render(
      <OrderConfirmationHeader
        {...base}
        status="SHIPPED"
        deliveryMethod="NOVA_POSHTA"
      />,
    );
    expect(screen.getByText("Відправлено")).toBeInTheDocument();
  });

  it("reads «Отримано покупцем» on a delivered order", () => {
    render(
      <OrderConfirmationHeader
        {...base}
        status="DELIVERED"
        deliveryMethod="PICKUP"
      />,
    );
    expect(screen.getByText("Отримано покупцем")).toBeInTheDocument();
  });
});
