import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeOrder } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { GuestOrderView } from "./guest-order-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/orders/guest/token-1",
}));

/**
 * TASK-338. Without this page a guest goes blind the moment their cart cookie
 * expires or they open the confirmation email on another device — they would
 * have paid us and have no way to see what they bought (edge case E-17).
 */
describe("GuestOrderView", () => {
  const guestOrder = makeOrder({
    userId: null,
    guest: {
      email: "olena@example.com",
      phone: "+380501234567",
      name: "Олена Шевченко",
    },
  });

  it("renders the order for a valid token, with no session at all", async () => {
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json(guestOrder),
      ),
    );

    // Default render options mean an unauthenticated visitor — the point being
    // that nothing here demands a login.
    renderWithProviders(<GuestOrderView token="token-1" />);

    expect(
      await screen.findByRole("heading", { name: dict.order.thankYou }),
    ).toBeInTheDocument();
    expect(screen.getByText("Відділення №1")).toBeInTheDocument();
    expect(screen.getByText("Олена Шевченко")).toBeInTheDocument();
    expect(screen.getByText("olena@example.com")).toBeInTheDocument();
  });

  it("shows the real payment status rather than assuming anything", async () => {
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json(
          makeOrder({ userId: null, paymentStatus: "PENDING" }),
        ),
      ),
    );

    renderWithProviders(<GuestOrderView token="token-1" />);

    expect(
      await screen.findByText("Оплата: Очікує оплати"),
    ).toBeInTheDocument();
  });

  it("gives one indistinguishable message for a bad or expired link", async () => {
    // The API answers 404 for both cases on purpose, so a guesser learns nothing
    // from the response. This view must not undo that by explaining which it was.
    server.use(
      http.get("*/api/orders/guest/:token", () =>
        HttpResponse.json({ message: "Not found" }, { status: 404 }),
      ),
    );

    renderWithProviders(<GuestOrderView token="bad-token" />);

    expect(
      await screen.findByRole("heading", {
        name: dict.order.guest.linkInvalidHeading,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.order.guest.linkInvalidBody),
    ).toBeInTheDocument();
  });
});
