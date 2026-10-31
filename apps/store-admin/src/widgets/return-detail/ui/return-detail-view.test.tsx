import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatCurrency, formatDateTime } from "@/shared/lib";
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
    requestedOutcome: "REFUND",
    channel: "ACCOUNT",
    decision: "REFUND",
    decisionReason: null,
    decidedAt: "2026-09-22T14:02:00.000Z",
    decisionLegacy: false,
    decidedBy: { id: "u-1", name: "Ірина Коваль", email: "iryna@shop.ua" },
    createdBy: null,
    decisionHistory: [
      {
        decision: "REFUND",
        reason: null,
        legacy: false,
        createdAt: "2026-09-22T14:02:00.000Z",
        actor: { id: "u-1", name: "Ірина Коваль", email: "iryna@shop.ua" },
      },
    ],
    repairSteps: [],
    orderCreatedAt: "2026-09-20T10:00:00.000Z",
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

  it("keeps the refunded amount on the card", async () => {
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

/** The value printed next to a `<dt>` in a description list. */
function valueOf(scope: HTMLElement, term: string) {
  return within(scope).getByText(term).nextElementSibling?.textContent;
}

describe("ReturnDetailView — three dates (TASK-1961, AD-RET-05/06)", () => {
  it("prints «Подано», «Вирішено» and «На склад не повертали» apart", async () => {
    serve();
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const dates = await screen.findByRole("region", { name: d.datesAria });
    expect(valueOf(dates, d.dateRequested)).toBe(
      formatDateTime("2026-09-22T12:15:00.000Z"),
    );
    expect(valueOf(dates, d.dateDecided)).toBe(
      formatDateTime("2026-09-22T14:02:00.000Z"),
    );
    expect(valueOf(dates, d.restockedAt)).toBe(d.notRestocked);
  });

  it("prints the restock date once the goods are back on the shelf", async () => {
    serve({
      rma: makeReturn({
        status: "RECEIVED",
        restockedAt: "2026-09-25T09:00:00.000Z",
      }),
    });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const dates = await screen.findByRole("region", { name: d.datesAria });
    expect(valueOf(dates, d.restockedAt)).toBe(
      formatDateTime("2026-09-25T09:00:00.000Z"),
    );
  });

  it("says a fresh request is not decided yet", async () => {
    serve({
      rma: makeReturn({
        status: "REQUESTED",
        decision: null,
        decidedAt: null,
        decidedBy: null,
        resolvedAt: null,
        decisionHistory: [],
      }),
    });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const dates = await screen.findByRole("region", { name: d.datesAria });
    expect(valueOf(dates, d.dateDecided)).toBe(d.dateNotDecided);
    const card = screen.getByRole("region", { name: d.decisionHeading });
    expect(within(card).getByText(d.decisionNone)).toBeInTheDocument();
  });
});

describe("ReturnDetailView — the decision (TASK-1961, TASK-2044, AD-RET-07)", () => {
  const refused = () =>
    makeReturn({
      status: "REJECTED",
      decision: "REJECT",
      decisionReason: "Сліди удару на корпусі",
      decidedAt: "2026-09-23T09:30:00.000Z",
    });

  it("shows the decision, its reason marked «бачить покупець», the author and the date", async () => {
    serve({ rma: refused() });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const card = await screen.findByRole("region", {
      name: d.decisionHeading,
    });
    expect(within(card).getByText(d.decisionREJECT)).toBeInTheDocument();
    expect(
      within(card).getByText("Сліди удару на корпусі"),
    ).toBeInTheDocument();
    expect(within(card).getByText(d.decisionReasonHint)).toBeVisible();
    expect(valueOf(card, d.decisionAuthor)).toBe("Ірина Коваль");
    expect(valueOf(card, d.decisionDate)).toBe(
      formatDateTime("2026-09-23T09:30:00.000Z"),
    );
  });

  it("marks a legacy decision «до B-12» instead of an empty reason", async () => {
    serve({
      rma: makeReturn({
        decisionLegacy: true,
        decidedBy: null,
        decisionHistory: [
          {
            decision: "REFUND",
            reason: null,
            legacy: true,
            createdAt: "2026-09-22T14:02:00.000Z",
            actor: null,
          },
        ],
      }),
    });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const card = await screen.findByRole("region", {
      name: d.decisionHeading,
    });
    expect(within(card).getByText(d.decisionLegacyMarker)).toBeInTheDocument();
    expect(within(card).getByText(d.decisionLegacyHint)).toBeInTheDocument();
    expect(
      within(card).queryByText(d.decisionNoReason),
    ).not.toBeInTheDocument();
  });

  it("folds the history of changes, oldest first, and opens it on demand", async () => {
    serve({
      rma: makeReturn({
        status: "APPROVED",
        decision: "REFUND",
        decisionReason: "Ремонт неможливий",
        decidedAt: "2026-09-26T10:00:00.000Z",
        decisionHistory: [
          {
            decision: "REFUND",
            reason: null,
            legacy: true,
            createdAt: "2026-09-22T14:02:00.000Z",
            actor: null,
          },
          {
            decision: "REPAIR",
            reason: "Клієнт погодився на ремонт",
            legacy: false,
            createdAt: "2026-09-24T10:00:00.000Z",
            actor: { id: "u-2", name: "Петро Мельник", email: "p@shop.ua" },
          },
          {
            decision: "REFUND",
            reason: "Ремонт неможливий",
            legacy: false,
            createdAt: "2026-09-26T10:00:00.000Z",
            actor: { id: "u-1", name: "Ірина Коваль", email: "iryna@shop.ua" },
          },
        ],
      }),
    });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const card = await screen.findByRole("region", {
      name: d.decisionHeading,
    });
    const toggle = within(card).getByRole("button", {
      name: d.decisionHistoryToggle(3),
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      within(card).queryByText("Клієнт погодився на ремонт"),
    ).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const entries = within(
      within(card).getByRole("list", { name: d.decisionHistoryToggle(3) }),
    ).getAllByRole("listitem");
    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent(d.decisionLegacyMarker);
    expect(entries[1]).toHaveTextContent(d.decisionREPAIR);
    expect(entries[1]).toHaveTextContent("Клієнт погодився на ремонт");
    expect(entries[1]).toHaveTextContent("Петро Мельник");
  });

  it("puts the decide form in the card for a writer, not the old approve/reject", async () => {
    serve({
      rma: makeReturn({
        status: "REQUESTED",
        decision: null,
        decidedAt: null,
        decidedBy: null,
        decisionHistory: [],
      }),
    });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const card = await screen.findByRole("region", {
      name: d.decisionHeading,
    });
    expect(
      within(card).getByRole("radio", { name: d.decisionREJECT }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Схвалити|Відхилити/ }),
    ).not.toBeInTheDocument();
  });
});

describe("ReturnDetailView — what the customer asked for (TASK-2044, TASK-1961)", () => {
  it("prints the wish and labels the reason as the customer's own words", async () => {
    serve({ rma: makeReturn({ requestedOutcome: "REPAIR" }) });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const card = await screen.findByRole("region", { name: d.reason });
    expect(valueOf(card, d.requestedOutcome)).toBe(d.decisionREPAIR);
    expect(within(card).getByText("Не підійшов колір")).toBeInTheDocument();
  });

  it("says «не вказано» when the customer did not choose", async () => {
    serve({
      rma: makeReturn({ requestedOutcome: null, channel: "GUEST_LINK" }),
    });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    const card = await screen.findByRole("region", { name: d.reason });
    expect(valueOf(card, d.requestedOutcome)).toBe(d.outcomeNotGiven);
  });

  it("calls an operator-filed reason «Коментар оператора»", async () => {
    serve({ rma: makeReturn({ channel: "OPERATOR" }) });
    renderWithProviders(<ReturnDetailView returnId={RETURN_ID} />, {
      auth: READER_OF_ORDERS,
    });

    expect(
      await screen.findByRole("region", { name: d.reasonOperator }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: d.reason }),
    ).not.toBeInTheDocument();
  });
});
