import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import NewOrderPage from "./page";

// The form itself is never reached in these tests; stub the view so the page's
// own decision is the only thing under test.
jest.mock("@/widgets", () => ({
  OrderCreateView: () => <p>Форма нового замовлення</p>,
}));

/**
 * TASK-715 — `/orders/new` typed by hand. `POST /admin/orders` needs
 * `orders:write`, so a reader gets one refusal instead of a form that fails on
 * submit.
 */
describe("NewOrderPage — orders:write gate (TASK-715)", () => {
  it("refuses a manager holding only orders:read, and names the right", () => {
    renderWithProviders(<NewOrderPage />, {
      auth: { permissions: ["orders:read"] },
    });

    expect(
      screen.queryByText("Форма нового замовлення"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      dict.orders.createForbidden,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      dict.orders.createForbiddenHint,
    );
  });

  it("renders the form for a manager holding orders:write", () => {
    renderWithProviders(<NewOrderPage />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    expect(screen.getByText("Форма нового замовлення")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
