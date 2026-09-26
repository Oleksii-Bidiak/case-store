import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { returnStatusLabel } from "@/entities/return";
import { OrderReturnsSection } from "./order-returns-section";

const ORDER_ID = "order-uuid-12345678";
const BUYER_ID = "buyer-uuid-1";

function makeReturn(
  id: string,
  overrides: { status?: string; createdByUserId?: string | null } = {},
) {
  return {
    id,
    orderId: ORDER_ID,
    status: overrides.status ?? "REQUESTED",
    reason: null,
    operatorNotes: null,
    requestedAt: "2026-09-01T10:00:00.000Z",
    resolvedAt: null,
    restockedAt: null,
    refundedAmount: null,
    createdByUserId:
      overrides.createdByUserId === undefined
        ? BUYER_ID
        : overrides.createdByUserId,
    items: [],
  };
}

/** Serve the order's returns, counting the requests actually sent. */
function serveReturns(rows: unknown[]): { count: number } {
  const counter = { count: 0 };
  server.use(
    http.get("*/api/admin/orders/:orderId/returns", () => {
      counter.count += 1;
      return HttpResponse.json({ data: rows });
    }),
  );
  return counter;
}

const READER = { permissions: ["orders:read", "returns:read"] };

/**
 * TASK-724 — the order card finally shows its return requests. The endpoint
 * existed since TASK-469; the two strings for it (`orders.returnsForOrder`,
 * `returns.createdByOperator`) were written and never rendered anywhere.
 */
describe("OrderReturnsSection (TASK-724)", () => {
  it("lists each return with its status, linked to its own page", async () => {
    serveReturns([
      makeReturn("ret00001-aaaa", { status: "APPROVED" }),
      makeReturn("ret00002-bbbb", { status: "REFUNDED" }),
    ]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    expect(
      screen.getByRole("heading", { name: dict.orders.returnsForOrder }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: dict.returns.title("ret00001") }),
    ).toHaveAttribute("href", "/returns/ret00001-aaaa");
    expect(
      screen.getByRole("link", { name: dict.returns.title("ret00002") }),
    ).toHaveAttribute("href", "/returns/ret00002-bbbb");
    expect(screen.getByText(returnStatusLabel("APPROVED"))).toBeInTheDocument();
    expect(screen.getByText(returnStatusLabel("REFUNDED"))).toBeInTheDocument();
  });

  it("marks a return filed by an operator, and not one filed by the buyer", async () => {
    serveReturns([
      makeReturn("ret00001-aaaa", { createdByUserId: BUYER_ID }),
      makeReturn("ret00002-bbbb", { createdByUserId: "operator-uuid-1" }),
    ]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    const operatorRow = (
      await screen.findByRole("link", { name: dict.returns.title("ret00002") })
    ).closest("li");
    const buyerRow = screen
      .getByRole("link", { name: dict.returns.title("ret00001") })
      .closest("li");

    expect(operatorRow).toHaveTextContent(dict.returns.createdByOperator);
    expect(buyerRow).not.toHaveTextContent(dict.returns.createdByOperator);
  });

  it("treats any author of a guest order's return as an operator", async () => {
    serveReturns([
      makeReturn("ret00001-aaaa", { createdByUserId: "operator-uuid-1" }),
    ]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={null} />,
      { auth: READER },
    );

    expect(
      await screen.findByText(dict.returns.createdByOperator),
    ).toBeInTheDocument();
  });

  it("does not mark a legacy row whose author is unknown", async () => {
    serveReturns([makeReturn("ret00001-aaaa", { createdByUserId: null })]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={null} />,
      { auth: READER },
    );

    await screen.findByRole("link", { name: dict.returns.title("ret00001") });
    expect(
      screen.queryByText(dict.returns.createdByOperator),
    ).not.toBeInTheDocument();
  });

  it("says so when the order has no returns", async () => {
    serveReturns([]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    expect(
      await screen.findByText(dict.orders.returnsForOrderEmpty),
    ).toBeInTheDocument();
  });

  it("is not rendered, and asks nothing, without returns:read", () => {
    const lookups = serveReturns([makeReturn("ret00001-aaaa")]);

    const { container } = renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: { permissions: ["orders:read", "orders:write"] } },
    );

    expect(container).toBeEmptyDOMElement();
    expect(lookups.count).toBe(0);
  });
});
