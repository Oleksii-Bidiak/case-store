import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { AdminOrderTable } from "./admin-order-table";

// next/navigation is unavailable under jsdom — mock the router + URL state.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/orders",
  useSearchParams: () => new URLSearchParams(""),
}));

/** One admin order row with a joined customer (TASK-125). */
function makeOrderRow(customer: unknown) {
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
    shippingAddress: null,
    billingAddress: null,
    notes: null,
    items: [{ id: "item-1" }],
    customer,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

describe("AdminOrderTable — customer column (TASK-125)", () => {
  it("shows the customer email and name, not the user UUID", async () => {
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [
            makeOrderRow({
              id: "user-uuid-87654321",
              email: "buyer@example.com",
              firstName: "Ivan",
              lastName: "Petrenko",
            }),
          ],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Ivan Petrenko")).toBeInTheDocument();
    // The UUID fallback must not render when a customer is present.
    expect(screen.queryByText(/user-uui…|87654321…/)).not.toBeInTheDocument();
    // Status badges render Ukrainian labels, not raw enums (TASK-129).
    expect(screen.getByText("Очікує підтвердження")).toBeInTheDocument();
    expect(screen.getByText("Очікує оплати")).toBeInTheDocument();
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
  });

  it("falls back to the truncated user id when no customer is joined", async () => {
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [makeOrderRow(null)],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("user-uui…")).toBeInTheDocument();
  });
});
