import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { OrderEntityPaymentStatus, paymentStatusLabel } from "@/entities/order";
import { toKyivDateInput } from "@/shared/lib";
import { AdminOrderTable } from "./admin-order-table";

const d = dict.orders;
const r = dict.common.registry;

// next/navigation is unavailable under jsdom — mock the router + URL state.
// `mockSearchParams` is mutable so deep-link tests can seed the URL (TASK-250).
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/orders",
  useSearchParams: () => mockSearchParams,
}));

// TASK-425: no <Toaster> is mounted in tests, so the export's two outcomes —
// "done" and "truncated" — are told apart at the wrapper.
const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  mockSearchParams = new URLSearchParams("");
  localStorage.clear();
  setViewport(false);
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

/** «#ORDER-UU» — how the registry names the default row. */
const ROW_NUMBER = "#ORDER-UU";

/** One admin order row with a joined customer (TASK-125). */
function makeOrderRow(
  customer: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "order-uuid-12345678",
    userId: "user-uuid-87654321",
    status: "PENDING",
    paymentStatus: "PENDING",
    paymentMethod: "ONLINE",
    deliveryMethod: "NOVA_POSHTA",
    subtotal: "29.99",
    discount: "0",
    shippingCost: "0",
    tax: "0",
    total: "29.99",
    shippingAddress: null,
    billingAddress: null,
    notes: null,
    trackingNumber: null,
    items: [{ id: "item-1" }],
    customer,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function serveRows(rows: unknown[], total = rows.length) {
  const seen: URL[] = [];
  server.use(
    http.get("*/api/admin/orders", ({ request }) => {
      const url = new URL(request.url);
      seen.push(url);
      return HttpResponse.json({
        data: rows,
        meta: { total, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return seen;
}

/** The last request for the PAGE (the sheet's count probe asks with limit=1). */
const pageRequest = (seen: URL[]) =>
  [...seen].reverse().find((url) => url.searchParams.get("limit") !== "1");

async function openFilters() {
  await userEvent.click(
    screen.getByRole("button", { name: new RegExp(`^${r.filters}`) }),
  );
  return screen.findByRole("dialog");
}

async function applyFilters(sheet: HTMLElement) {
  await userEvent.click(
    within(sheet).getByRole("button", { name: /^Показати/ }),
  );
}

describe("AdminOrderTable — the client cell (TASK-125, TASK-1045)", () => {
  it("shows the customer's name and, with no phone on the order, the email", async () => {
    serveRows([
      makeOrderRow({
        id: "user-uuid-87654321",
        email: "buyer@example.com",
        firstName: "Ivan",
        lastName: "Petrenko",
      }),
    ]);

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("Ivan Petrenko")).toBeInTheDocument();
    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
    // The UUID fallback must not render when a customer is present.
    expect(screen.queryByText(/user-uui…|87654321…/)).not.toBeInTheDocument();
    // Status badges render Ukrainian labels, not raw enums (TASK-129).
    expect(screen.getByText("Очікує підтвердження")).toBeInTheDocument();
    expect(screen.getByText("Очікує оплати")).toBeInTheDocument();
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
  });

  it("prefers the phone from the delivery address over the email", async () => {
    serveRows([
      makeOrderRow(
        {
          id: "user-uuid-87654321",
          email: "buyer@example.com",
          firstName: "Ivan",
          lastName: "Petrenko",
        },
        {
          shippingAddress: {
            firstName: "Ivan",
            lastName: "Petrenko",
            phone: "380672145590",
            city: "Київ",
            address1: "Відділення №12",
          },
        },
      ),
    ]);

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("+380 67 214 5590")).toBeInTheDocument();
    expect(screen.queryByText("buyer@example.com")).not.toBeInTheDocument();
  });

  it("falls back to the truncated user id when no customer is joined", async () => {
    serveRows([makeOrderRow(null)]);

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("user-uui…")).toBeInTheDocument();
  });

  const guestRow = {
    ...makeOrderRow(null),
    userId: null,
    guest: {
      email: "olena@example.com",
      phone: "380501112233",
      name: "Олена Шевченко",
    },
  };

  it("marks a guest order with the «гість» badge in the client cell", async () => {
    serveRows([guestRow]);

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("Олена Шевченко")).toBeInTheDocument();
    expect(screen.getByText(d.guestBadge)).toBeInTheDocument();
    expect(screen.getByText("+380 50 111 2233")).toBeInTheDocument();
  });

  it("shows the phone of a guest order with no email (TASK-426)", async () => {
    serveRows([{ ...guestRow, guest: { ...guestRow.guest, email: null } }]);

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("+380 50 111 2233")).toBeInTheDocument();
  });

  it("keeps «Тип клієнта» as a column one can turn on in «Колонки» (TASK-425)", async () => {
    serveRows([guestRow]);
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText("Олена Шевченко");

    // Hidden by default: the «гість» badge in the client cell says it.
    expect(
      screen.queryByRole("columnheader", {
        name: new RegExp(d.colCustomerType),
      }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: r.columns }));
    await userEvent.click(
      await screen.findByRole("checkbox", { name: d.colCustomerType }),
    );

    expect(
      await screen.findByRole("columnheader", {
        name: new RegExp(d.colCustomerType),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(d.customerTypeGuest)).toBeInTheDocument();
  });
});

describe("AdminOrderTable — the number, delivery and payment cells", () => {
  it("names the order «#XXXXXXXX» with the full id on hover, as the row's link", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />);

    const number = await screen.findByText(ROW_NUMBER);
    expect(number).toHaveAttribute("title", "order-uuid-12345678");
    expect(number.closest("a")).toHaveAttribute(
      "href",
      "/orders/order-uuid-12345678",
    );
  });

  it("shows the created date and time on two lines", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />);

    // 10:00 UTC on 1 June is 13:00 in Kyiv.
    expect(await screen.findByText("01.06.2026")).toBeInTheDocument();
    expect(screen.getByText("13:00")).toBeInTheDocument();
  });

  it("shows the payment status with the method under it", async () => {
    serveRows([
      makeOrderRow(null, { paymentMethod: "ON_DELIVERY", status: "CONFIRMED" }),
    ]);
    renderWithProviders(<AdminOrderTable />);

    await screen.findByText(ROW_NUMBER);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(d.paymentMethodOnDelivery)).toBeInTheDocument();
  });

  it("shows the address and the waybill, and says when a confirmed order has none", async () => {
    serveRows([
      makeOrderRow(null, {
        id: "aaaaaaaa-0000-0000-0000-000000000001",
        status: "SHIPPED",
        trackingNumber: "20450912345676",
        shippingAddress: {
          city: "Київ",
          npWarehouseName: "Відділення №12",
          address1: "Відділення №12",
        },
      }),
      makeOrderRow(null, {
        id: "bbbbbbbb-0000-0000-0000-000000000002",
        status: "CONFIRMED",
        shippingAddress: { city: "Львів", address1: "Відділення №3" },
      }),
    ]);
    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("Київ, Відділення №12")).toBeInTheDocument();
    expect(screen.getByText(d.ttnValue("20450912345676"))).toBeInTheDocument();
    expect(screen.getByText("Львів, Відділення №3")).toBeInTheDocument();
    expect(screen.getByText(d.ttnMissing)).toBeInTheDocument();
  });
});

describe("AdminOrderTable — quick views (TASK-250, TASK-405)", () => {
  it("offers «Нові · В обробці · Відправлені · Усі»", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(d.empty);

    const views = within(
      screen.getByRole("tablist", { name: r.quickViewsLabel }),
    ).getAllByRole("tab");
    expect(views.map((tab) => tab.textContent)).toEqual([
      d.tabNew,
      d.tabProcessing,
      d.tabShipped,
      d.tabAll,
    ]);
    expect(d.tabAll).toBe("Усі");
  });

  it.each([
    [dict.orders.tabNew, "/orders?status=PENDING"],
    [dict.orders.tabProcessing, "/orders?status=CONFIRMED,PROCESSING"],
    [dict.orders.tabShipped, "/orders?status=SHIPPED"],
  ])("clicking «%s» writes %s and resets page", async (label, expectedUrl) => {
    mockSearchParams = new URLSearchParams("page=3");
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(d.empty);

    await userEvent.click(screen.getByRole("tab", { name: label }));

    // URLSearchParams percent-encodes the comma in CONFIRMED,PROCESSING (%2C);
    // decode before comparing so the CSV contract reads literally.
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(mockReplace.mock.calls[0][0])).toBe(expectedUrl);
  });

  it("deep-links: ?status=CONFIRMED,PROCESSING renders В обробці active + filters the table", async () => {
    mockSearchParams = new URLSearchParams("status=CONFIRMED,PROCESSING");
    const seen = serveRows([makeOrderRow(null)]);

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);

    expect(pageRequest(seen)?.searchParams.get("status")).toBe(
      "CONFIRMED,PROCESSING",
    );
    expect(screen.getByRole("tab", { name: d.tabProcessing })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: d.tabNew })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: d.tabAll })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("deep-links: ?status=DELIVERED filters the table with no view active, but the views stay reachable by Tab", async () => {
    mockSearchParams = new URLSearchParams("status=DELIVERED");
    const seen = serveRows([makeOrderRow(null)]);

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);

    expect(pageRequest(seen)?.searchParams.get("status")).toBe("DELIVERED");
    const tabs = [d.tabNew, d.tabProcessing, d.tabShipped, d.tabAll].map(
      (label) => screen.getByRole("tab", { name: label }),
    );
    for (const tab of tabs) {
      expect(tab).toHaveAttribute("aria-selected", "false");
    }
    // With nothing active, roving focus must still let one tab into the order.
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });

  it("«Усі» clears a deep-linked ?status=PROCESSING without leaking a sentinel", async () => {
    mockSearchParams = new URLSearchParams("status=PROCESSING");
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(/Немає замовлень зі статусом/);

    await userEvent.click(screen.getByRole("tab", { name: d.tabAll }));

    expect(mockReplace).toHaveBeenCalledWith("/orders");
    for (const [url] of mockReplace.mock.calls) {
      expect(url).not.toContain("__all__");
    }
  });

  it("renders «Усі» active with no ?status=", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(d.empty);

    expect(screen.getByRole("tab", { name: d.tabAll })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("AdminOrderTable — toolbar", () => {
  it("has the search naming only the fields the API searches, and the four controls", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(d.empty);

    const search = screen.getByRole("searchbox", { name: d.searchAria });
    // The API searches the number, the email and the phone (TASK-336) — not the
    // name, not the waybill — so the placeholder does not promise them.
    expect(search).toHaveAttribute("placeholder", d.searchPlaceholder);
    expect(d.searchPlaceholder).not.toMatch(/ТТН|ім'я/);
    expect(screen.getByRole("button", { name: r.filters })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: r.columns })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: r.view(d.viewDefault) }),
    ).toBeInTheDocument();
  });

  it("refetches the queue when Оновити is pressed (TASK-354)", async () => {
    const seen = serveRows([makeOrderRow(null)]);

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);
    expect(seen).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(seen).toHaveLength(2));
  });

  it("says how many orders were found and in what order", async () => {
    serveRows([makeOrderRow(null)], 27);
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);

    expect(screen.getByText(d.summaryFound, { exact: false }).textContent).toBe(
      `${d.summaryFound} 27 замовлень`,
    );
    expect(
      screen.getByText(r.summarySort(d.sortCreatedDesc), { exact: false }),
    ).toBeInTheDocument();
  });
});

describe("AdminOrderTable — column sorting (TASK-147)", () => {
  it.each([
    [d.colCreated, "createdAt"],
    [d.colStatus, "status"],
    [d.colTotal, "total"],
  ])("sorts by «%s» from its header", async (label, field) => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.sortByAria(label) }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining(`sortBy=${field}`),
    );
  });
});

/**
 * TASK-425 / 470 / 471 / 352 — the three selects and the six toggles moved into
 * «Фільтри» with the same URL params. Nothing filters on the client.
 */
describe("AdminOrderTable — filters in the sheet", () => {
  it("offers every payment status, PARTIALLY_REFUNDED included, and every method", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(d.empty);

    const sheet = await openFilters();
    const payment = within(
      within(sheet).getByRole("group", { name: d.filterPaymentStatusAria }),
    );
    for (const status of Object.values(OrderEntityPaymentStatus)) {
      expect(
        payment.getByRole("button", { name: paymentStatusLabel(status) }),
      ).toBeInTheDocument();
    }
    const method = within(
      within(sheet).getByRole("group", { name: d.filterPaymentMethodAria }),
    );
    for (const label of [
      d.paymentMethodOnline,
      d.paymentMethodOnDelivery,
      d.paymentMethodInstallments,
    ]) {
      expect(method.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("applies payment status and method to the URL and resets the page", async () => {
    mockSearchParams = new URLSearchParams("page=3");
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(d.empty);

    const sheet = await openFilters();
    await userEvent.click(
      within(
        within(sheet).getByRole("group", { name: d.filterPaymentStatusAria }),
      ).getByRole("button", {
        name: dict.orderStatus.paymentLabels.PARTIALLY_REFUNDED,
      }),
    );
    await userEvent.click(
      within(
        within(sheet).getByRole("group", { name: d.filterPaymentMethodAria }),
      ).getByRole("button", { name: d.paymentMethodOnDelivery }),
    );
    await applyFilters(sheet);

    expect(mockReplace).toHaveBeenLastCalledWith(
      "/orders?paymentStatus=PARTIALLY_REFUNDED&paymentMethod=ON_DELIVERY",
    );
  });

  it("filters by several order statuses at once (the CSV the API accepts)", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(d.empty);

    const sheet = await openFilters();
    const statuses = within(
      within(sheet).getByRole("group", { name: d.filterStatusAria }),
    );
    await userEvent.click(
      statuses.getByRole("checkbox", { name: "Доставлено" }),
    );
    await userEvent.click(
      statuses.getByRole("checkbox", { name: "Скасовано" }),
    );
    await applyFilters(sheet);

    expect(decodeURIComponent(mockReplace.mock.lastCall?.[0])).toBe(
      "/orders?status=DELIVERED,CANCELLED",
    );
  });

  it("sends the URL's filters to the API", async () => {
    const seen = serveRows([]);
    mockSearchParams = new URLSearchParams(
      "paymentStatus=FAILED&paymentMethod=ONLINE&dateFrom=2026-09-01&dateTo=2026-09-24",
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.common.table.emptyFiltered);

    const params = pageRequest(seen)?.searchParams;
    expect(params?.get("paymentStatus")).toBe("FAILED");
    expect(params?.get("paymentMethod")).toBe("ONLINE");
    expect(params?.get("dateFrom")).toBe("2026-09-01");
    expect(params?.get("dateTo")).toBe("2026-09-24");
  });

  it("shows applied filters as chips named like the artboard, and a chip removes its filter", async () => {
    mockSearchParams = new URLSearchParams(
      "paymentMethod=ON_DELIVERY&dateFrom=2026-09-01&dateTo=2026-09-24",
    );
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.common.table.emptyFiltered);

    const methodChip = screen.getByRole("button", {
      name: r.removeChipAria(d.chipPaymentMethod(d.paymentMethodOnDelivery)),
    });
    expect(methodChip).toHaveTextContent("Спосіб оплати: Післяплата");
    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipPeriod("01.09 – 24.09.2026")),
      }),
    ).toBeInTheDocument();
    // «Фільтри» counts what is applied.
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${r.filters}\\s*${r.filtersApplied(2)}$`),
      }),
    ).toBeInTheDocument();

    await userEvent.click(methodChip);
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/orders?dateFrom=2026-09-01&dateTo=2026-09-24",
    );
  });

  it("picks a period preset into dateFrom/dateTo (Kyiv calendar days)", async () => {
    // The preset arithmetic is pinned in `order-filters.test.ts`; here only the
    // round trip from the pill to the URL, against today's Kyiv date.
    const today = toKyivDateInput(Date.now());
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(d.empty);

    const sheet = await openFilters();
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.periodMonth }),
    );
    await applyFilters(sheet);

    expect(mockReplace).toHaveBeenLastCalledWith(
      `/orders?dateFrom=${today.slice(0, 8)}01&dateTo=${today}`,
    );
  });

  const SIGNALS: ReadonlyArray<[string, string]> = [
    [dict.orders.overdueChip, "pendingOverdue"],
    [dict.orders.debtChip, "hasDebt"],
    [dict.orders.awaitingPaymentChip, "awaitingPayment"],
    [dict.orders.reservationExpiredChip, "reservationExpired"],
    [dict.orders.unavailableItemsChip, "hasUnavailableItems"],
    [dict.orders.paidAfterCancelChip, "paidAfterCancel"],
    [dict.orders.unpaidInTransitChip, "unpaidInTransit"],
  ];

  it.each(SIGNALS)(
    "the «%s» signal writes ?%s=true and never filters on the client",
    async (label, param) => {
      const seen = serveRows([]);
      renderWithProviders(<AdminOrderTable />);
      await screen.findByText(d.empty);

      const sheet = await openFilters();
      const box = within(
        within(sheet).getByRole("group", { name: d.filterSignals }),
      ).getByRole("checkbox", { name: label });
      expect(box).not.toBeChecked();
      await userEvent.click(box);
      await applyFilters(sheet);

      expect(mockReplace).toHaveBeenLastCalledWith(`/orders?${param}=true`);
      expect(pageRequest(seen)?.searchParams.has(param)).toBe(false);
    },
  );

  it.each(SIGNALS)(
    "renders «%s» ticked, as a chip, and asks the API for ?%s when deep-linked",
    async (label, param) => {
      const seen = serveRows([]);
      mockSearchParams = new URLSearchParams(`${param}=true`);

      renderWithProviders(<AdminOrderTable />);
      await screen.findByText(dict.common.table.emptyFiltered);

      expect(pageRequest(seen)?.searchParams.get(param)).toBe("true");
      expect(
        screen.getByRole("button", { name: r.removeChipAria(label) }),
      ).toBeInTheDocument();
      const sheet = await openFilters();
      expect(
        within(sheet).getByRole("checkbox", { name: label }),
      ).toBeChecked();
    },
  );

  it("unticking a signal clears it; two signals compose", async () => {
    const seen = serveRows([]);
    mockSearchParams = new URLSearchParams(
      "hasDebt=true&hasUnavailableItems=true",
    );
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.common.table.emptyFiltered);

    expect(pageRequest(seen)?.searchParams.get("hasDebt")).toBe("true");
    expect(pageRequest(seen)?.searchParams.get("hasUnavailableItems")).toBe(
      "true",
    );

    const sheet = await openFilters();
    await userEvent.click(
      within(sheet).getByRole("checkbox", { name: d.debtChip }),
    );
    await applyFilters(sheet);
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/orders?hasUnavailableItems=true",
    );
  });

  it("names the sheet's apply button with the API's count for the draft", async () => {
    server.use(
      http.get("*/api/admin/orders", ({ request }) => {
        const params = new URL(request.url).searchParams;
        const debt = params.get("hasDebt") === "true";
        return HttpResponse.json({
          data: [],
          meta: { total: debt ? 3 : 0, page: 1, limit: 20, totalPages: 1 },
        });
      }),
    );
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(d.empty);

    const sheet = await openFilters();
    await userEvent.click(
      within(sheet).getByRole("checkbox", { name: d.debtChip }),
    );

    expect(
      await within(sheet).findByRole("button", {
        name: d.filtersApplyCount("3 замовлення"),
      }),
    ).toBeInTheDocument();
  });
});

describe("AdminOrderTable — CSV export (TASK-425)", () => {
  const stubExport = (csv: string) => {
    const seen = { url: "" };
    server.use(
      http.get("*/api/admin/orders/export", ({ request }) => {
        seen.url = request.url;
        return new HttpResponse(csv, {
          headers: { "Content-Type": "text/csv" },
        });
      }),
    );
    return seen;
  };

  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => "blob:mock-url");
    URL.revokeObjectURL = jest.fn();
    clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  async function exportCsv() {
    await userEvent.click(screen.getByRole("button", { name: r.exportLabel }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: r.exportCsv }),
    );
  }

  it("offers CSV only — no XLSX until something writes it", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);

    await userEvent.click(screen.getByRole("button", { name: r.exportLabel }));
    expect(
      await screen.findByRole("menuitem", { name: r.exportCsv }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: r.exportXlsx }),
    ).not.toBeInTheDocument();
    // No selection on this screen — so no «Лише вибрані» to pick.
    expect(
      screen.queryByRole("menuitemradio", { name: r.exportSelectedOnly }),
    ).not.toBeInTheDocument();
    // The server builds the file: no promise about the visible columns.
    expect(screen.getByText(dict.orders.exportFootnote)).toBeInTheDocument();
    expect(screen.queryByText(r.exportFootnote)).not.toBeInTheDocument();
  });

  it("exports the CURRENT FILTERS, not the page on screen", async () => {
    serveRows([makeOrderRow(null)]);
    const seen = stubExport("orderNumber,total\r\nABC12345,1469.00");
    mockSearchParams = new URLSearchParams(
      "status=PENDING&search=ABC&paymentStatus=PENDING&pendingOverdue=true&hasUnavailableItems=true&dateFrom=2026-09-01&page=2",
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);
    await exportCsv();

    await waitFor(() => expect(seen.url).toContain("status=PENDING"));
    expect(seen.url).toContain("search=ABC");
    expect(seen.url).toContain("paymentStatus=PENDING");
    expect(seen.url).toContain("pendingOverdue=true");
    expect(seen.url).toContain("hasUnavailableItems=true");
    expect(seen.url).toContain("dateFrom=2026-09-01");
    expect(seen.url).not.toContain("page=");

    await waitFor(() =>
      expect(URL.createObjectURL as jest.Mock).toHaveBeenCalledTimes(1),
    );
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith(d.exportSuccess(1));
  });

  it("says so — and keeps saying so — when the server capped the file", async () => {
    serveRows([makeOrderRow(null)], 9000);
    stubExport("orderNumber,total\r\nABC12345,1469.00\r\nDEF67890,99.00");

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);
    await exportCsv();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.exportTruncated(2, 9000)),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("reports a failed export instead of downloading an empty file", async () => {
    serveRows([makeOrderRow(null)]);
    server.use(
      http.get("*/api/admin/orders/export", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);
    await exportCsv();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(d.exportError));
    expect(clickSpy).not.toHaveBeenCalled();
  });
});

describe("AdminOrderTable — the derived marks of B-1 (TASK-470/471/472)", () => {
  const stubRow = (row: Record<string, unknown>) =>
    serveRows([{ ...makeOrderRow(null), ...row }]);

  const table = async () => {
    // Wait for a cell of the real row first: the loading SKELETON is a <table>
    // too, so `findByRole("table")` resolves against it.
    await screen.findByText(ROW_NUMBER);
    return within(screen.getByRole("table"));
  };

  it("flags a delivered order nobody paid for", async () => {
    stubRow({
      status: "DELIVERED",
      paymentStatus: "PENDING",
      total: "1200.00",
    });
    renderWithProviders(<AdminOrderTable />);
    expect((await table()).getByText(/Борг\s/)).toHaveTextContent(/1\s?200/);
  });

  it("counts down the payment window on a card order", async () => {
    stubRow({
      paymentMethod: "ONLINE",
      paymentStatus: "PENDING",
      reservationExpiresAt: new Date(Date.now() + 23 * 60_000).toISOString(),
    });
    renderWithProviders(<AdminOrderTable />);
    expect(
      (await table()).getByText(/Очікує оплати · \d+ хв/),
    ).toBeInTheDocument();
  });

  it("says «Резерв сплив» once the window has closed", async () => {
    stubRow({
      paymentMethod: "ONLINE",
      paymentStatus: "PENDING",
      reservationExpiresAt: "2020-01-01T00:00:00.000Z",
    });
    renderWithProviders(<AdminOrderTable />);
    expect(
      (await table()).getByText(d.markReservationExpired),
    ).toBeInTheDocument();
  });

  it("shows the refunded fraction on a partially refunded order", async () => {
    stubRow({
      paymentStatus: "PARTIALLY_REFUNDED",
      refundedTotal: "499.00",
      total: "1200.00",
    });
    renderWithProviders(<AdminOrderTable />);
    const chip = (await table()).getByText(/Частково повернуто \d/);
    expect(chip).toHaveTextContent(/499/);
    expect(chip).toHaveTextContent(/1\s?200/);
  });

  it("draws no mark at all on an ordinary paid order", async () => {
    stubRow({ status: "PROCESSING", paymentStatus: "PAID" });
    renderWithProviders(<AdminOrderTable />);
    const row = await table();
    expect(row.getByText("Оплачено")).toBeInTheDocument();
    expect(row.queryByText(/Борг/)).not.toBeInTheDocument();
    expect(row.queryByText(/Очікує оплати ·/)).not.toBeInTheDocument();
  });
});

describe("AdminOrderTable — the row's «⋯» (was «Переглянути»)", () => {
  const rowWithTtn = makeOrderRow(null, {
    status: "SHIPPED",
    trackingNumber: "20450912345676",
  });

  async function openMenu() {
    await userEvent.click(
      await screen.findByRole("button", {
        name: r.rowActionsAria(d.rowAria(ROW_NUMBER)),
      }),
    );
  }

  it("opens the order, also in a new tab", async () => {
    serveRows([rowWithTtn]);
    renderWithProviders(<AdminOrderTable />);
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: d.rowOpen }),
    ).toHaveAttribute("href", "/orders/order-uuid-12345678");
    const newTab = screen.getByRole("menuitem", { name: d.rowOpenNewTab });
    expect(newTab).toHaveAttribute("href", "/orders/order-uuid-12345678");
    expect(newTab).toHaveAttribute("target", "_blank");
  });

  it("copies the number and the waybill", async () => {
    const user = userEvent.setup();
    serveRows([rowWithTtn]);
    renderWithProviders(<AdminOrderTable />);
    const write = jest.spyOn(navigator.clipboard, "writeText");

    await user.click(
      await screen.findByRole("button", {
        name: r.rowActionsAria(d.rowAria(ROW_NUMBER)),
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: d.rowCopyNumber }),
    );
    expect(write).toHaveBeenLastCalledWith(ROW_NUMBER);
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.copiedNumber(ROW_NUMBER)),
    );

    await user.click(
      screen.getByRole("button", {
        name: r.rowActionsAria(d.rowAria(ROW_NUMBER)),
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: d.rowCopyTtn }),
    );
    expect(write).toHaveBeenLastCalledWith("20450912345676");
  });

  it("offers «Скопіювати ТТН» only when there is one", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />);
    await openMenu();

    await screen.findByRole("menuitem", { name: d.rowOpen });
    expect(
      screen.queryByRole("menuitem", { name: d.rowCopyTtn }),
    ).not.toBeInTheDocument();
  });

  it("leads «Змінити статус…» to the card's status control — only with orders:write", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: d.rowChangeStatus }),
    ).toHaveAttribute("href", "/orders/order-uuid-12345678#order-status");
  });

  it("does not offer «Змінити статус…» to a reader", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />, {
      auth: { permissions: ["orders:read"] },
    });
    await openMenu();

    await screen.findByRole("menuitem", { name: d.rowOpen });
    expect(
      screen.queryByRole("menuitem", { name: d.rowChangeStatus }),
    ).not.toBeInTheDocument();
  });

  it("opens the order on a click anywhere on the row", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />);

    await userEvent.click(await screen.findByText("Очікує підтвердження"));
    expect(mockPush).toHaveBeenCalledWith("/orders/order-uuid-12345678");
  });
});

describe("AdminOrderTable — page totals and pagination", () => {
  it("totals the page: count, sum and positions", async () => {
    serveRows([
      makeOrderRow(null, {
        total: "1000.50",
        items: [{ id: "a" }, { id: "b" }],
      }),
      makeOrderRow(null, {
        id: "second-uuid-0000",
        total: "999.50",
        items: [{ id: "c" }],
      }),
    ]);
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);

    const footer = screen
      .getByText(r.totalsOnPage("2 замовлення"))
      .closest("tr") as HTMLElement;
    expect(footer).toHaveTextContent(/2\s?000 ₴/);
    expect(within(footer).getByText("3")).toBeInTheDocument();
  });

  it("keeps the pager with its page-size picker", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(ROW_NUMBER);

    expect(
      screen.getByRole("button", { name: dict.common.next }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: dict.common.table.pageSizeLabel }),
    ).toBeInTheDocument();
  });
});

describe("AdminOrderTable — empty and error states", () => {
  it("says there are no orders yet", async () => {
    renderWithProviders(<AdminOrderTable />);
    expect(await screen.findByText(d.empty)).toBeInTheDocument();
  });

  it("names the status a status filter found nothing in", async () => {
    mockSearchParams = new URLSearchParams("status=PENDING");
    renderWithProviders(<AdminOrderTable />);
    expect(
      await screen.findByText(d.emptyStatus("Очікує підтвердження")),
    ).toBeInTheDocument();
  });

  it("names the search term rather than the status filter", async () => {
    mockSearchParams = new URLSearchParams("search=0671&status=PENDING");
    renderWithProviders(<AdminOrderTable />);
    expect(await screen.findByText(r.noResults("0671"))).toBeInTheDocument();
  });

  it("shows the load error with a retry", async () => {
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<AdminOrderTable />);
    expect(await screen.findByText(d.loadError)).toBeInTheDocument();
  });
});

describe("AdminOrderTable — cards below md (П7)", () => {
  it("draws a card per order with number, status, client, total, payment and «⋯»", async () => {
    setViewport(true);
    serveRows([
      makeOrderRow(null, {
        userId: null,
        guest: { email: null, phone: "380501112233", name: "Олена Шевченко" },
        total: "35647",
        shippingAddress: { city: "Львів", address1: "Відділення №3" },
      }),
    ]);
    renderWithProviders(<AdminOrderTable />);

    const card = await screen.findByRole("listitem", {
      name: d.rowAria(ROW_NUMBER),
    });
    const inCard = within(card);
    expect(inCard.getByText(ROW_NUMBER)).toBeInTheDocument();
    expect(inCard.getByText("Очікує підтвердження")).toBeInTheDocument();
    expect(inCard.getByText("Олена Шевченко")).toBeInTheDocument();
    expect(inCard.getByText(d.guestBadge)).toBeInTheDocument();
    expect(inCard.getByText(/35\s?647 ₴/)).toBeInTheDocument();
    expect(inCard.getByText("Очікує оплати")).toBeInTheDocument();
    expect(inCard.getByText("Львів, Відділення №3")).toBeInTheDocument();
    expect(
      inCard.getByRole("button", {
        name: r.rowActionsAria(d.rowAria(ROW_NUMBER)),
      }),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-715 — «Створити замовлення» leads to a form whose submit is
 * `POST /admin/orders`, behind `orders:write`.
 */
describe("AdminOrderTable — header actions", () => {
  it("does not offer «Створити замовлення» to a reader, who still exports", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />, {
      auth: { permissions: ["orders:read"] },
    });

    await screen.findByText(ROW_NUMBER);
    expect(
      screen.queryByRole("link", { name: d.createCta }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: r.exportLabel }),
    ).toBeInTheDocument();
  });

  it("links to /orders/new for a session holding orders:write", async () => {
    serveRows([makeOrderRow(null)]);
    renderWithProviders(<AdminOrderTable />, {
      auth: { permissions: ["orders:read", "orders:write"] },
    });

    await screen.findByText(ROW_NUMBER);
    expect(screen.getByRole("link", { name: d.createCta })).toHaveAttribute(
      "href",
      "/orders/new",
    );
    expect(
      screen.getByRole("heading", { name: d.heading }),
    ).toBeInTheDocument();
  });
});
