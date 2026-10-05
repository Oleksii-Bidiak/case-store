import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { ReturnDetailView } from "./return-detail-view";

const d = dict.returns;

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/returns/return-uuid-1",
  useSearchParams: () => new URLSearchParams(""),
}));

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const RETURN_ID = "a3f08d12-0000-4000-8000-000000000001";
const ORDER_ID = "72a8afec-0000-4000-8000-000000000002";

function makeReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: RETURN_ID,
    orderId: ORDER_ID,
    status: "APPROVED",
    reason: "Не підійшов колір",
    operatorNotes: "Клієнт відправляє Новою Поштою",
    requestedAt: "2026-09-22T12:15:00.000Z",
    resolvedAt: "2026-09-22T14:02:00.000Z",
    restockedAt: null,
    refundedAmount: null,
    items: [
      {
        id: "ri-1",
        orderItemId: "oi-1",
        quantity: 1,
        productName: "Силіконовий чохол",
        price: "1299.00",
      },
    ],
    ...overrides,
  };
}

function serve({
  rma = makeReturn(),
  siblings = [] as unknown[],
  orderTotal = "1299.00",
}: {
  rma?: Record<string, unknown>;
  siblings?: unknown[];
  orderTotal?: string;
} = {}) {
  server.use(
    http.get("*/api/admin/returns/:id", () => HttpResponse.json({ data: rma })),
    http.get("*/api/admin/orders/:orderId/returns", () =>
      HttpResponse.json({ data: [rma, ...siblings] }),
    ),
    http.get("*/api/admin/orders/:id", () =>
      HttpResponse.json({
        data: {
          id: ORDER_ID,
          userId: null,
          status: "DELIVERED",
          paymentStatus: "PAID",
          paymentMethod: "ONLINE",
          deliveryMethod: "NOVA_POSHTA",
          subtotal: orderTotal,
          discount: "0",
          shippingCost: "0",
          tax: "0",
          total: orderTotal,
          items: [],
          guest: {
            name: "Оксана Шевченко",
            phone: "+380503182247",
            email: null,
          },
          createdAt: "2026-09-20T10:00:00.000Z",
          updatedAt: "2026-09-20T10:00:00.000Z",
        },
      }),
    ),
  );
}

const READER_OF_ORDERS = {
  permissions: ["returns:read", "returns:write", "orders:read"],
};

describe("ReturnDetailView — header (TASK-1038, Р3)", () => {
  it("names the return and its order in the shared «#XXXXXXXX» format", async () => {
    serve();
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const heading = await screen.findByRole("heading", { level: 2 });
    expect(heading.textContent).toBe(`${d.heading} #A3F08D12`);
    expect(screen.getByRole("link", { name: /#72A8AFEC/ })).toHaveAttribute(
      "href",
      `/orders/${ORDER_ID}`,
    );
    // No «…» after a truncated id anywhere in the header.
    expect(heading.closest("header")?.textContent).not.toContain("…");
    expect(screen.getByRole("link", { name: d.back })).toHaveAttribute(
      "href",
      "/returns",
    );
  });

  it("names the customer from the order when the session may read orders", async () => {
    serve();
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    expect(await screen.findByText(/Оксана Шевченко/)).toBeInTheDocument();
  });
});

describe("ReturnDetailView — the path of the request (Р3)", () => {
  it("draws the four steps with the current one marked", async () => {
    serve();
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const steps = await screen.findByRole("list", { name: d.stepsAria });
    const items = within(steps).getAllByRole("listitem");
    expect(items.map((item) => item.dataset.state)).toEqual([
      "done",
      "done",
      "now",
      "todo",
    ]);
    expect(items[2]).toHaveAttribute("aria-current", "step");
  });

  it("ends the path at «Відхилено» on a refused request", async () => {
    serve({ rma: makeReturn({ status: "REJECTED" }) });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const steps = await screen.findByRole("list", { name: d.stepsAria });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent(d.statusREJECTED);
  });
});

describe("ReturnDetailView — what comes back and the ceiling (TASK-959)", () => {
  it("counts lines and units and prints the ceiling from the order", async () => {
    serve({
      rma: makeReturn({ status: "RECEIVED" }),
      siblings: [makeReturn({ id: "other-1", refundedAmount: "300.00" })],
      orderTotal: "1399.00",
    });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const card = await screen.findByRole("region", { name: d.itemsHeading });
    expect(within(card).getByText("1 позиція · 1 шт.")).toBeInTheDocument();
    // Order 1399 − 300 already refunded by another return = 1099 < 1299.
    const max = await within(card).findByText(d.maxRefund);
    expect(max.closest("[data-row]")?.textContent).toContain(
      formatCurrency("1099.00"),
    );
    expect(
      within(card).getByText(d.alreadyRefunded).closest("[data-row]")
        ?.textContent,
    ).toContain(formatCurrency("300.00"));
  });

  it("prints no ceiling it cannot compute — without orders:read", async () => {
    serve({ rma: makeReturn({ status: "RECEIVED" }) });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: { permissions: ["returns:read", "returns:write"] },
    });

    const card = await screen.findByRole("region", { name: d.itemsHeading });
    expect(within(card).getByText(d.itemsTotal)).toBeInTheDocument();
    expect(within(card).queryByText(d.maxRefund)).not.toBeInTheDocument();
  });

  it("keeps the refunded amount and the restock date on the card", async () => {
    serve({
      rma: makeReturn({
        status: "REFUNDED",
        refundedAmount: "1299.00",
        restockedAt: "2026-09-25T09:00:00.000Z",
      }),
    });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const card = await screen.findByRole("region", { name: d.itemsHeading });
    expect(
      within(card).getByText(d.refundedAmount).closest("[data-row]")
        ?.textContent,
    ).toContain(formatCurrency("1299.00"));
    expect(
      within(card).getByText(d.restockedAt, { exact: false }),
    ).toBeInTheDocument();
  });

  it("shows the next step and the notes beside the goods", async () => {
    serve();
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    expect(
      await screen.findByRole("region", { name: d.resolveHeading }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Клієнт відправляє Новою Поштою")).toHaveLength(
      1,
    );
  });
});
