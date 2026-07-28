import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
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

  // ── TASK-330-B: what this page is allowed to say about money ───────────────
  //
  // The shopper arrives via the provider's `result_url`. That redirect is
  // unauthenticated and anyone can type it; the money is settled by a signed
  // server-to-server callback that may land seconds later, or by the reconcile
  // cron if it never lands at all (docs/payments-liqpay.md §3–§4). Every
  // assertion below exists to stop the page getting ahead of the server.
  describe("payment status", () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    /** Pretend this browser was just handed off to the provider for order-1. */
    function withRecentAttempt() {
      sessionStorage.setItem(
        "checkout:payment-attempt:order-1",
        JSON.stringify({ paymentId: "payment-1", startedAt: Date.now() }),
      );
    }

    it("does NOT claim the order is paid while the server still says PENDING", async () => {
      withRecentAttempt();
      server.use(
        http.get("*/api/orders/:id", () =>
          HttpResponse.json(makeOrder({ paymentStatus: "PENDING" })),
        ),
      );

      renderWithProviders(<OrderConfirmationView orderId="order-1" />, authed);
      await screen.findByRole("heading", { name: dict.order.thankYou });

      // Coming back from the provider proves nothing. Until the callback lands
      // the page says it is checking — and the badge still reads "очікує оплати".
      expect(
        await screen.findByRole("heading", {
          name: dict.order.payment.pendingTitle,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(dict.order.payment.paidTitle),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Оплата: Очікує оплати")).toBeInTheDocument();
      expect(screen.queryByText(/Оплата: Оплачено/)).not.toBeInTheDocument();
    });

    it("stays quiet about payment for a cash-on-delivery order", async () => {
      // No attempt in this browser: the order is PENDING and correctly so, and
      // telling that shopper we are "confirming their payment" would be its own
      // small lie.
      server.use(
        http.get("*/api/orders/:id", () =>
          HttpResponse.json(makeOrder({ paymentStatus: "PENDING" })),
        ),
      );

      renderWithProviders(<OrderConfirmationView orderId="order-1" />, authed);
      await screen.findByRole("heading", { name: dict.order.thankYou });

      expect(
        screen.queryByText(dict.order.payment.pendingTitle),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(dict.order.payment.paidTitle),
      ).not.toBeInTheDocument();
    });

    it("reports payment only once the server itself reports PAID", async () => {
      withRecentAttempt();
      server.use(
        http.get("*/api/orders/:id", () =>
          HttpResponse.json(makeOrder({ paymentStatus: "PAID" })),
        ),
      );

      renderWithProviders(<OrderConfirmationView orderId="order-1" />, authed);

      expect(
        await screen.findByRole("heading", {
          name: dict.order.payment.paidTitle,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(dict.order.payment.pendingTitle),
      ).not.toBeInTheDocument();
    });

    it("offers a retry on a failed payment, and it opens a NEW attempt", async () => {
      // The provider refuses a second payment under an id it has already seen,
      // so "try again" cannot mean resubmitting the old handoff — it has to ask
      // the server for a fresh Payment with a fresh id.
      const submit = jest
        .spyOn(HTMLFormElement.prototype, "submit")
        .mockImplementation(() => {});
      const paymentIds: string[] = [];

      server.use(
        http.get("*/api/orders/:id", () =>
          HttpResponse.json(makeOrder({ paymentStatus: "FAILED" })),
        ),
        http.post("*/api/payments/orders/:orderId/checkout", () => {
          const paymentId = `payment-${paymentIds.length + 2}`;
          paymentIds.push(paymentId);
          return HttpResponse.json(
            {
              data: {
                paymentId,
                url: "https://provider.example/checkout",
                method: "POST",
                fields: { data: "NEW", signature: "NEWSIG" },
              },
            },
            { status: 201 },
          );
        }),
      );

      const user = userEvent.setup();
      renderWithProviders(<OrderConfirmationView orderId="order-1" />, authed);

      await user.click(
        await screen.findByRole("button", { name: dict.order.payment.retry }),
      );

      await waitFor(() => expect(paymentIds).toEqual(["payment-2"]));
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

      submit.mockRestore();
    });

    it("explains a retry that could not start, claiming nothing about the money", async () => {
      server.use(
        http.get("*/api/orders/:id", () =>
          HttpResponse.json(makeOrder({ paymentStatus: "FAILED" })),
        ),
        http.post("*/api/payments/orders/:orderId/checkout", () =>
          HttpResponse.json({ message: "unavailable" }, { status: 503 }),
        ),
      );

      const user = userEvent.setup();
      renderWithProviders(<OrderConfirmationView orderId="order-1" />, authed);

      await user.click(
        await screen.findByRole("button", { name: dict.order.payment.retry }),
      );

      expect(
        await screen.findByText(dict.order.payment.retryUnavailable),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(dict.order.payment.paidTitle),
      ).not.toBeInTheDocument();
    });

    it("says plainly when the callback never arrived", async () => {
      // An attempt older than the wait window: no more spinner, no pretending.
      sessionStorage.setItem(
        "checkout:payment-attempt:order-1",
        JSON.stringify({
          paymentId: "payment-1",
          startedAt: Date.now() - 5 * 60 * 1000,
        }),
      );
      server.use(
        http.get("*/api/orders/:id", () =>
          HttpResponse.json(makeOrder({ paymentStatus: "PENDING" })),
        ),
      );

      renderWithProviders(<OrderConfirmationView orderId="order-1" />, authed);

      expect(
        await screen.findByRole("heading", {
          name: dict.order.payment.slowTitle,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(dict.order.payment.paidTitle),
      ).not.toBeInTheDocument();
    });
  });
});
