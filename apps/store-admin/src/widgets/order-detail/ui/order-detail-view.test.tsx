import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { OrderDetailView } from "./order-detail-view";

// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

function makeOrder(
  customer: unknown,
  overrides: {
    status?: string;
    restockedAt?: string | null;
    items?: Array<{ id: string; quantity: number }>;
  } = {},
) {
  return {
    id: "order-uuid-12345678",
    userId: "user-uuid-87654321",
    status: overrides.status ?? "PENDING",
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
    items: overrides.items
      ? overrides.items.map((item) => ({
          id: item.id,
          productId: "prod-uuid-1",
          productName: "iPhone 15 Pro Case",
          price: "29.99",
          quantity: item.quantity,
          lineTotal: "29.99",
        }))
      : [
          {
            id: "item-1",
            productId: "prod-uuid-1",
            productName: "iPhone 15 Pro Case",
            price: "29.99",
            quantity: 1,
            lineTotal: "29.99",
          },
        ],
    customer,
    restockedAt: overrides.restockedAt ?? null,
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
    // Status badges render Ukrainian labels, not raw enums (TASK-129).
    expect(screen.getByText("Очікує підтвердження")).toBeInTheDocument();
    expect(screen.getByText("Очікує оплати")).toBeInTheDocument();
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
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

  it("renders independent status and payment-status controls (TASK-151)", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: makeOrder(null) }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    await screen.findByText(dict.orders.summary);

    // Two separate comboboxes: order status + payment status.
    expect(
      screen.getByRole("combobox", { name: dict.orderStatus.updateAria }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: dict.orderStatus.paymentUpdateAria,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.orderStatus.updatePaymentStatus),
    ).toBeInTheDocument();
  });

  it("renders product name as a link to the product edit page (TASK-156)", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({ data: makeOrder(null) }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    const link = await screen.findByRole("link", {
      name: dict.orders.viewProductAria("iPhone 15 Pro Case"),
    });
    expect(link).toHaveAttribute("href", "/products/prod-uuid-1/edit");
    expect(link).toHaveTextContent("iPhone 15 Pro Case");
  });
});

describe("OrderDetailView — stock-hold badges (TASK-254)", () => {
  it("shows a holds-stock badge with the summed quantity for a pre-shipment order", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder(null, {
            status: "PENDING",
            restockedAt: null,
            items: [
              { id: "item-1", quantity: 2 },
              { id: "item-2", quantity: 3 },
            ],
          }),
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    // 2 + 3 = 5 units held.
    expect(
      await screen.findByText(dict.orders.holdsStock(5)),
    ).toBeInTheDocument();
    // The restocked badge prefix must be absent.
    expect(screen.queryByText(/Залишок повернуто/)).not.toBeInTheDocument();
  });

  it("shows a restocked-at badge (not holds-stock) once a cancelled order was restocked", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder(null, {
            status: "CANCELLED",
            restockedAt: "2026-06-01T14:30:00.000Z",
          }),
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    await screen.findByText(dict.orders.summary);
    expect(screen.getByText(/Залишок повернуто/)).toBeInTheDocument();
    expect(screen.queryByText(/Тримає залишок/)).not.toBeInTheDocument();
  });

  it("shows neither badge for a delivered order", async () => {
    server.use(
      http.get("*/api/admin/orders/:orderId", () =>
        HttpResponse.json({
          data: makeOrder(null, { status: "DELIVERED", restockedAt: null }),
        }),
      ),
    );

    renderWithProviders(<OrderDetailView orderId="order-uuid-12345678" />);

    await screen.findByText(dict.orders.summary);
    expect(screen.queryByText(/Тримає залишок/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Залишок повернуто/)).not.toBeInTheDocument();
  });
});
