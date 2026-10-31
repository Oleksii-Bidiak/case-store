import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import { formatOrderNumber } from "@/entities/order";
import { returnDecisionLabel, returnStatusLabel } from "@/entities/return";
import { OrderReturnsSection } from "./order-returns-section";

const ORDER_ID = "order-uuid-12345678";
const BUYER_ID = "buyer-uuid-1";
const DECIDED_AT = "2026-09-03T12:30:00.000Z";

interface ReturnOverrides {
  status?: string;
  createdByUserId?: string | null;
  decision?: string | null;
  decisionReason?: string | null;
  decidedAt?: string | null;
  decisionLegacy?: boolean;
  items?: { productName: string; quantity: number }[];
}

function makeReturn(id: string, overrides: ReturnOverrides = {}) {
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
    requestedOutcome: null,
    channel: "ACCOUNT",
    decision: overrides.decision ?? null,
    decisionReason: overrides.decisionReason ?? null,
    decidedAt: overrides.decidedAt ?? null,
    decisionLegacy: overrides.decisionLegacy ?? false,
    items: (overrides.items ?? []).map((line, index) => ({
      id: `${id}-line-${index}`,
      orderItemId: `order-item-${index}`,
      quantity: line.quantity,
      productName: line.productName,
      price: "500.00",
    })),
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

/** The return's name as the /returns/[id] header writes it. */
function returnName(id: string): string {
  return `${dict.returns.heading} ${formatOrderNumber(id)}`;
}

async function findRow(id: string): Promise<HTMLElement> {
  const link = await screen.findByRole("link", { name: returnName(id) });
  const row = link.closest("li");
  if (!row) throw new Error(`no row for ${id}`);
  return row;
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
      await screen.findByRole("link", { name: returnName("ret00001-aaaa") }),
    ).toHaveAttribute("href", "/returns/ret00001-aaaa");
    expect(
      screen.getByRole("link", { name: returnName("ret00002-bbbb") }),
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

    const operatorRow = await findRow("ret00002-bbbb");
    const buyerRow = await findRow("ret00001-aaaa");

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

    await findRow("ret00001-aaaa");
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

/**
 * TASK-1962 (B-12 §1) — the card answers "what was returned and what did we
 * decide" without opening each request: lines with quantities, the decision,
 * its date and the reason the customer reads.
 */
describe("OrderReturnsSection — what each return holds (TASK-1962)", () => {
  it("names the return the way its own page does, with the full id on hover", async () => {
    serveReturns([makeReturn("7c1e9a42-ffff-4000-8000-000000000001")]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    const link = await screen.findByRole("link", {
      name: `${dict.returns.heading} #7C1E9A42`,
    });
    expect(
      within(link).getByTitle("7c1e9a42-ffff-4000-8000-000000000001"),
    ).toHaveTextContent("#7C1E9A42");
  });

  it("lists the lines of each return with their quantities", async () => {
    serveReturns([
      makeReturn("ret00001-aaaa", {
        items: [
          { productName: "Чохол iPhone 15", quantity: 2 },
          { productName: "Скло захисне", quantity: 1 },
        ],
      }),
    ]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    const row = await findRow("ret00001-aaaa");
    const lines = within(row).getByRole("list", {
      name: dict.orders.returnsForOrderItemsAria(
        formatOrderNumber("ret00001-aaaa"),
      ),
    });
    expect(
      within(lines)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      dict.orders.returnsForOrderLine("Чохол iPhone 15", 2),
      dict.orders.returnsForOrderLine("Скло захисне", 1),
    ]);
  });

  it("shows the decision, when it was taken and the reason the customer sees", async () => {
    serveReturns([
      makeReturn("ret00001-aaaa", {
        status: "REJECTED",
        decision: "REJECT",
        decisionReason: "Сліди удару на корпусі",
        decidedAt: DECIDED_AT,
      }),
    ]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    const row = await findRow("ret00001-aaaa");
    expect(row).toHaveTextContent(returnDecisionLabel("REJECT"));
    expect(row).toHaveTextContent(formatDateTime(DECIDED_AT));
    expect(row).toHaveTextContent(dict.returns.decisionReasonHint);
    expect(within(row).getByText("Сліди удару на корпусі")).toBeInTheDocument();
    expect(row).not.toHaveTextContent(dict.returns.decisionNone);
  });

  it("marks a pre-B-12 decision that never had a reason", async () => {
    serveReturns([
      makeReturn("ret00001-aaaa", {
        status: "APPROVED",
        decision: "REFUND",
        decisionLegacy: true,
        decidedAt: DECIDED_AT,
      }),
    ]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    const row = await findRow("ret00001-aaaa");
    expect(row).toHaveTextContent(returnDecisionLabel("REFUND"));
    expect(
      within(row).getByText(dict.returns.decisionLegacyMarker),
    ).toHaveAttribute("title", dict.returns.decisionLegacyHint);
    expect(row).not.toHaveTextContent(dict.returns.decisionNoReason);
  });

  it("says a decision given without a reason has none", async () => {
    serveReturns([
      makeReturn("ret00001-aaaa", {
        status: "APPROVED",
        decision: "REPAIR",
        decidedAt: DECIDED_AT,
      }),
    ]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    const row = await findRow("ret00001-aaaa");
    expect(row).toHaveTextContent(returnDecisionLabel("REPAIR"));
    expect(row).toHaveTextContent(dict.returns.decisionNoReason);
    expect(row).not.toHaveTextContent(dict.returns.decisionLegacyMarker);
  });

  it("says when nobody has decided yet", async () => {
    serveReturns([makeReturn("ret00001-aaaa")]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    const row = await findRow("ret00001-aaaa");
    expect(row).toHaveTextContent(dict.returns.decisionNone);
  });

  it("gets all of it from the one order-returns request", async () => {
    const lookups = serveReturns([
      makeReturn("ret00001-aaaa", {
        decision: "REFUND",
        decidedAt: DECIDED_AT,
        items: [{ productName: "Чохол iPhone 15", quantity: 1 }],
      }),
      makeReturn("ret00002-bbbb", {
        items: [{ productName: "Скло захисне", quantity: 3 }],
      }),
    ]);

    renderWithProviders(
      <OrderReturnsSection orderId={ORDER_ID} orderUserId={BUYER_ID} />,
      { auth: READER },
    );

    await findRow("ret00002-bbbb");
    expect(lookups.count).toBe(1);
  });
});
