import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { OrderDetailView } from "./order-detail-view";

// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

function makeOrder(customer: unknown) {
  return {
    id: "order-uuid-12345678",
    userId: "user-uuid-87654321",
    status: "PENDING",
    paymentStatus: "PENDING",
    subtotal: "29.99",
    discount: "0",
    shippingCost: "0",
    tax: "0",
    total: "29.99",
    shippingAddress: {
      firstName: "Olena",
      lastName: "Shevchenko",
      city: "Kyiv",
      phone: "+380501234567",
    },
    billingAddress: null,
    notes: null,
    items: [
      {
        id: "item-1",
        productName: "iPhone 15 Pro Case",
        price: "29.99",
        quantity: 1,
        lineTotal: "29.99",
      },
    ],
    customer,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

describe("OrderDetailView — customer section (TASK-125)", () => {
  it("renders a Customer card with the account email and name", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder({
            id: "user-uuid-87654321",
            email: "buyer@example.com",
            firstName: "Ivan",
            lastName: "Petrenko",
          }),
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    expect(await screen.findByText(dict.orders.customer)).toBeInTheDocument();
    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Ivan Petrenko")).toBeInTheDocument();
  });

  it("omits the Customer card when no customer is present", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: makeOrder(null) }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    // Wait for the order to load (Summary always renders), then assert no card.
    expect(await screen.findByText(dict.orders.summary)).toBeInTheDocument();
    expect(screen.queryByText(dict.orders.customer)).not.toBeInTheDocument();
  });
});
