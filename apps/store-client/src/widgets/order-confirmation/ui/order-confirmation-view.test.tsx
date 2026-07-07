import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeOrder } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { OrderConfirmationView } from "./order-confirmation-view";

// next/navigation is unavailable under jsdom — mock the router.
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/orders/order-1/confirmation",
}));

const authed = {
  auth: { isAuthenticated: true, accessToken: "token" },
} as const;

/**
 * TASK-119-D (absorbs TASK-111): the confirmation page must render the UA order
 * shape produced by checkout — `deliveryAddress` → `address1`, `country: "UA"` —
 * without crashing, and localize the country rather than show a raw ISO code.
 */
describe("OrderConfirmationView", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  it("renders the UA shipping address fields for a fetched order", async () => {
    server.use(
      http.get("*/api/orders/:id", () => HttpResponse.json(makeOrder())),
    );

    renderWithProviders(<OrderConfirmationView orderId="order-1" />, authed);

    expect(
      await screen.findByRole("heading", { name: dict.order.thankYou }),
    ).toBeInTheDocument();
    expect(screen.getByText("Олег Коваль")).toBeInTheDocument();
    expect(screen.getByText("Відділення №1")).toBeInTheDocument();
    expect(screen.getByText("Київ")).toBeInTheDocument();
    expect(screen.getByText("+380501234567")).toBeInTheDocument();
    // Status badges render Ukrainian labels, not raw enums (TASK-129).
    expect(screen.getByText("Очікує підтвердження")).toBeInTheDocument();
    expect(screen.getByText("Оплата: Очікує оплати")).toBeInTheDocument();
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
  });

  it("localizes the country code instead of rendering the raw ISO value", async () => {
    server.use(
      http.get("*/api/orders/:id", () => HttpResponse.json(makeOrder())),
    );

    renderWithProviders(<OrderConfirmationView orderId="order-1" />, authed);

    expect(await screen.findByText("Україна")).toBeInTheDocument();
    expect(screen.queryByText("UA")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated visitors to login with a return path", async () => {
    renderWithProviders(<OrderConfirmationView orderId="order-1" />, {
      auth: { isAuthenticated: false, isInitializing: false },
    });

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        "/login?redirect=/orders/order-1/confirmation",
      ),
    );
  });

  // ── TASK-261: purchase analytics ───────────────────────────────────────────
  describe("purchase analytics", () => {
    afterEach(() => {
      delete window.umami;
    });

    it("reports purchase once with the order id and amount after the order loads", async () => {
      const track = jest.fn();
      window.umami = { track };
      server.use(
        http.get("*/api/orders/:id", () => HttpResponse.json(makeOrder())),
      );

      renderWithProviders(<OrderConfirmationView orderId="order-1" />, authed);
      await screen.findByRole("heading", { name: dict.order.thankYou });

      await waitFor(() =>
        expect(track).toHaveBeenCalledWith("purchase", {
          orderId: "order-1",
          amount: "998.00",
        }),
      );
      expect(
        track.mock.calls.filter(([name]) => name === "purchase"),
      ).toHaveLength(1);
    });

    it("does not report purchase for an unauthenticated visitor (order never loads)", async () => {
      const track = jest.fn();
      window.umami = { track };

      renderWithProviders(<OrderConfirmationView orderId="order-1" />, {
        auth: { isAuthenticated: false, isInitializing: false },
      });

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      expect(track).not.toHaveBeenCalled();
    });
  });
});
