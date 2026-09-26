import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { OrderPaymentAttempts } from "./order-payment-attempts";

const ORDER_ID = "order-uuid-1";
const t = dict.orders;

const ATTEMPTS = [
  {
    id: "pay-2",
    orderId: ORDER_ID,
    provider: "liqpay",
    amount: "1299.00",
    currency: "UAH",
    status: "SUCCEEDED",
    providerPaymentId: "liqpay-9001",
    failureCode: null,
    failureMessage: null,
    settledAt: "2026-09-26T10:05:00.000Z",
    createdAt: "2026-09-26T10:00:00.000Z",
  },
  {
    id: "pay-1",
    orderId: ORDER_ID,
    provider: "liqpay",
    amount: "1299.00",
    currency: "UAH",
    status: "FAILED",
    providerPaymentId: null,
    failureCode: "4159",
    failureMessage: "Card declined",
    settledAt: "2026-09-26T09:58:00.000Z",
    createdAt: "2026-09-26T09:57:00.000Z",
  },
];

function stubAttempts(rows: unknown[] = ATTEMPTS) {
  const seen = { calls: 0 };
  server.use(
    http.get("*/api/admin/payments/orders/:orderId", () => {
      seen.calls += 1;
      return HttpResponse.json({ data: rows });
    }),
  );
  return seen;
}

const ONLINE = { id: ORDER_ID, paymentMethod: "ONLINE" as const };

describe("OrderPaymentAttempts (TASK-371)", () => {
  it("renders nothing and asks nothing without payments:read", async () => {
    const seen = stubAttempts();
    const { container } = renderWithProviders(
      <OrderPaymentAttempts order={ONLINE} />,
      { auth: { permissions: ["orders:read"] } },
    );

    expect(container).toBeEmptyDOMElement();
    // Give a stray request the chance to fire before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen.calls).toBe(0);
  });

  it("lists every attempt, newest first, with status, amount, provider id and failure", async () => {
    stubAttempts();
    renderWithProviders(<OrderPaymentAttempts order={ONLINE} />, {
      auth: { permissions: ["orders:read", "payments:read"] },
    });

    const rows = await screen.findAllByTestId("payment-attempt");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(t.paymentAttemptStatus.SUCCEEDED);
    expect(rows[0]).toHaveTextContent(/1\s299\s₴/);
    expect(rows[0]).toHaveTextContent("liqpay-9001");
    expect(rows[1]).toHaveTextContent(t.paymentAttemptStatus.FAILED);
    expect(rows[1]).toHaveTextContent("4159 — Card declined");
  });

  it("offers the refund only on the SUCCEEDED attempt, and only with payments:refund", async () => {
    stubAttempts();
    renderWithProviders(<OrderPaymentAttempts order={ONLINE} />, {
      auth: {
        permissions: ["orders:read", "payments:read", "payments:refund"],
      },
    });

    await screen.findAllByTestId("payment-attempt");
    expect(
      screen.getAllByRole("button", { name: t.refundAction }),
    ).toHaveLength(1);
  });

  it("shows the history but no refund button to a reader without payments:refund", async () => {
    stubAttempts();
    renderWithProviders(<OrderPaymentAttempts order={ONLINE} />, {
      auth: { permissions: ["orders:read", "payments:read"] },
    });

    await screen.findAllByTestId("payment-attempt");
    expect(
      screen.queryByRole("button", { name: t.refundAction }),
    ).not.toBeInTheDocument();
  });

  it("says an order paid on delivery has no online attempts, without asking the server", async () => {
    const seen = stubAttempts();
    renderWithProviders(
      <OrderPaymentAttempts
        order={{ id: ORDER_ID, paymentMethod: "ON_DELIVERY" }}
      />,
      { auth: { permissions: ["orders:read", "payments:read"] } },
    );

    expect(screen.getByText(t.paymentAttemptsOnDelivery)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen.calls).toBe(0);
  });

  it("has an empty state and an error state", async () => {
    stubAttempts([]);
    const { unmount } = renderWithProviders(
      <OrderPaymentAttempts order={ONLINE} />,
      { auth: { permissions: ["payments:read"] } },
    );
    expect(await screen.findByText(t.paymentAttemptsEmpty)).toBeInTheDocument();
    unmount();

    server.use(
      http.get("*/api/admin/payments/orders/:orderId", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<OrderPaymentAttempts order={ONLINE} />, {
      auth: { permissions: ["payments:read"] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        t.paymentAttemptsLoadError,
      ),
    );
  });
});
