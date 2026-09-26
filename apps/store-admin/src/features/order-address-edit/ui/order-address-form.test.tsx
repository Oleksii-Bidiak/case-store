import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
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

/**
 * TASK-622: the refusal is read by its STATUS. A 403 used to reach
 * `isOrderConflict` with `error: "Forbidden"` in the body and read as «замовлення
 * змінилося, оновіть сторінку»; a 400 read the same way through `Bad Request`.
 */
describe("OrderAddressForm — refusals (TASK-622)", () => {
  const WRITER = { auth: { permissions: ["orders:read", "orders:write"] } };

  function stubPatch(status: number, error: string) {
    server.use(
      http.patch("*/api/admin/orders/:orderId", () =>
        HttpResponse.json(
          { statusCode: status, error, message: "server prose" },
          { status },
        ),
      ),
    );
  }

  async function submitAddress() {
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressEdit }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.addressSave }),
    );
  }

  it("says «немає права» under the form on a 403, not «замовлення змінилося»", async () => {
    stubPatch(403, "Forbidden");
    renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await submitAddress();

    expect(
      await screen.findByText(dict.orderStatus.forbidden),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.orderStatus.conflictUnknown),
    ).not.toBeInTheDocument();
  });

  it("does not call a 500 a conflict", async () => {
    stubPatch(500, "Internal Server Error");
    renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await submitAddress();

    // The generic toast fires; nothing on screen claims the order moved.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: dict.orders.addressSave }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText(dict.orderStatus.conflictUnknown),
    ).not.toBeInTheDocument();
  });

  it("still words a 409 as the conflict it is", async () => {
    stubPatch(409, "ORDER_STALE");
    renderWithProviders(
      <OrderAddressForm order={makeOrder("PENDING")} />,
      WRITER,
    );

    await submitAddress();

    expect(
      await screen.findByText(dict.orderStatus.conflict.ORDER_STALE),
    ).toBeInTheDocument();
  });
});
