import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { OrderEntity } from "@/entities/order";
import { OrderAddressForm } from "./order-address-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

/** Only what the control reads: the id, the lock token, status and address. */
function makeOrder(status: string): OrderEntity {
  return {
    id: "order-uuid-1",
    status,
    updatedAt: "2026-06-01T10:00:00.000Z",
    shippingAddress: {
      firstName: "Olena",
      lastName: "Shevchenko",
      city: "Kyiv",
      address1: "Khreshchatyk 1",
      phone: "+380501234567",
    },
  } as unknown as OrderEntity;
}

/**
 * TASK-715 — «Змінити адресу» writes through `PATCH /admin/orders/:id`, which
 * needs `orders:write`. Without it the button is not rendered at all: the
 * address is already on the card, and the form could only end in a 403.
 */
describe("OrderAddressForm — orders:write gate (TASK-715)", () => {
  it("renders nothing for a session that may only read orders", () => {
    const { container } = renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      { auth: { permissions: ["orders:read"] } },
    );

    expect(
      screen.queryByRole("button", { name: dict.orders.addressEdit }),
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("does not explain a lock the reader could not have used either", () => {
    const { container } = renderWithProviders(
      <OrderAddressForm order={makeOrder("SHIPPED")} />,
      { auth: { permissions: ["orders:read"] } },
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("offers «Змінити адресу» to a session holding orders:write", () => {
    renderWithProviders(<OrderAddressForm order={makeOrder("PENDING")} />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    expect(
      screen.getByRole("button", { name: dict.orders.addressEdit }),
    ).toBeInTheDocument();
  });

  it("still explains the lock to a writer once the parcel has shipped", () => {
    renderWithProviders(<OrderAddressForm order={makeOrder("SHIPPED")} />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    expect(screen.getByText(dict.orders.addressLockedHint)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.orders.addressEdit }),
    ).not.toBeInTheDocument();
  });
});
