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
import { AdminReturnTable } from "./admin-return-table";

const d = dict.returns;
const r = dict.common.registry;

// next/navigation is unavailable under jsdom — mock the router + URL state.
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/returns",
  useSearchParams: () => mockSearchParamsRef.current,
}));

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
  mockSearchParamsRef.current = new URLSearchParams("");
  localStorage.clear();
  setViewport(false);
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

/** How the registry names the default row — the shared «#XXXXXXXX» canon. */
const ROW_NUMBER = "#RETURN-U";
const ORDER_NUMBER = "#ORDER-UU";

function makeReturnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "return-uuid-12345678",
    orderId: "order-uuid-87654321",
    userId: "user-uuid-1",
    status: "REQUESTED",
    reason: "Не підійшов розмір",
    operatorNotes: null,
    refundedAmount: null,
    requestedAt: "2026-07-01T10:00:00.000Z",
    resolvedAt: null,
    restockedAt: null,
    items: [
      {
        id: "item-1",
        orderItemId: "oi-1",
        quantity: 1,
        productName: "Чохол",
        price: "499.00",
      },
    ],
    ...overrides,
  };
}

function listResponse(rows: unknown[], total = rows.length) {
  return HttpResponse.json({
    data: rows,
    meta: { total, page: 1, limit: 20, totalPages: 1 },
  });
}

function stubReturns(rows: unknown[] = [makeReturnRow()], total?: number) {
  const params: URLSearchParams[] = [];
  server.use(
    http.get("*/api/admin/returns", ({ request }) => {
      params.push(new URL(request.url).searchParams);
      return listResponse(rows, total);
    }),
  );
  return params;
}

async function openFilters() {
  await userEvent.click(
    screen.getByRole("button", { name: new RegExp(`^${r.filters}`) }),
  );
  return screen.findByRole("dialog");
}

describe("AdminReturnTable — sorting and refresh (TASK-354)", () => {
  it("sends the queue's own default sort, not the shared createdAt one", async () => {
    const params = stubReturns();

    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    // `createdAt` is not a column on this endpoint — sending it would come back
    // a 400 from the DTO's @IsIn guard, so the default has to be requestedAt.
    expect(params[0].get("sortBy")).toBe("requestedAt");
    expect(params[0].get("sortOrder")).toBe("desc");
  });

  it("writes the clicked column to the URL", async () => {
    stubReturns();

    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(d.colRefunded),
      }),
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("sortBy=refundedAmount"),
      ),
    );
  });

  it("keeps the status and «Подано» sorts on their headers", async () => {
    stubReturns();
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    expect(
      screen.getByRole("button", { name: dict.common.sortByAria(d.colStatus) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: dict.common.sortByAria(d.colRequested),
      }),
    ).toBeInTheDocument();
  });

  it("refetches the queue when Оновити is pressed", async () => {
    const params = stubReturns();

    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);
    expect(params).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(params).toHaveLength(2));
  });

  it("renders an unrefunded return as a dash, not as 0 ₴", async () => {
    stubReturns([
      makeReturnRow(),
      makeReturnRow({ id: "refunded-uuid-2", refundedAmount: "0" }),
    ]);

    const { container } = renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    const refunded = container.querySelectorAll(
      'td[data-column-id="refunded"]',
    );
    expect(refunded[0]).toHaveTextContent("—");
    expect(refunded[1]).not.toHaveTextContent("—");
  });
});

/**
 * Wave 198 (TASK-1056, ReturnsProposal Р1): the status select became quick
 * views by stage, over the SAME `?status=` param, so a deep link still lands.
 */
describe("AdminReturnTable — quick views by stage (TASK-1056)", () => {
  it("offers «Нові · Чекаємо товар · Повернути гроші · Завершені · Відхилені · Усі»", async () => {
    stubReturns([]);
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(d.empty);

    const views = within(
      screen.getByRole("tablist", { name: r.quickViewsLabel }),
    ).getAllByRole("tab");
    expect(views.map((tab) => tab.textContent)).toEqual([
      "Нові",
      "Чекаємо товар",
      "Повернути гроші",
      "Завершені",
      "Відхилені",
      "Усі",
    ]);
    // No counters: the list API returns no per-status counts (an API tail).
    expect(screen.getByRole("tab", { name: "Усі" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it.each([
    ["Нові", "REQUESTED"],
    ["Чекаємо товар", "APPROVED"],
    ["Повернути гроші", "RECEIVED"],
    ["Завершені", "REFUNDED"],
    ["Відхилені", "REJECTED"],
  ])("«%s» writes ?status=%s and resets the page", async (label, status) => {
    mockSearchParamsRef.current = new URLSearchParams("page=3");
    stubReturns([]);
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(d.empty);

    await userEvent.click(screen.getByRole("tab", { name: label }));

    expect(mockReplace).toHaveBeenCalledWith(`/returns?status=${status}`);
  });

  it("deep-links: ?status=RECEIVED filters the API and lights «Повернути гроші»", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=RECEIVED");
    const params = stubReturns();
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    expect(params[0].get("status")).toBe("RECEIVED");
    expect(
      screen.getByRole("tab", { name: "Повернути гроші" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("«Усі» drops ?status= without leaking a sentinel", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=REJECTED");
    stubReturns([]);
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(d.emptyStatus(d.statusREJECTED));

    await userEvent.click(screen.getByRole("tab", { name: "Усі" }));

    expect(mockReplace).toHaveBeenCalledWith("/returns");
  });

  it("keeps the status filter working from «Фільтри» too", async () => {
    stubReturns();
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    const sheet = await openFilters();
    await userEvent.click(
      within(
        within(sheet).getByRole("group", { name: d.filterStatusAria }),
      ).getByRole("button", { name: d.statusREFUNDED }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filtersApply }),
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("status=REFUNDED"),
      ),
    );
  });
});

describe("AdminReturnTable — the row (TASK-1056, TASK-1038)", () => {
  it("names the return and its order in the shared «#XXXXXXXX» format, no «…»", async () => {
    stubReturns();
    renderWithProviders(<AdminReturnTable />);

    const number = await screen.findByText(ROW_NUMBER);
    expect(number).toHaveAttribute("title", "return-uuid-12345678");
    expect(number.closest("a")).toHaveAttribute(
      "href",
      "/returns/return-uuid-12345678",
    );
    expect(screen.getByText(ORDER_NUMBER).closest("a")).toHaveAttribute(
      "href",
      "/orders/order-uuid-87654321",
    );
    expect(screen.queryByText(/[a-z0-9]…$/)).not.toBeInTheDocument();
  });

  it("counts units, not lines, and sums the goods coming back", async () => {
    stubReturns([
      makeReturnRow({
        items: [
          {
            id: "a",
            orderItemId: "oa",
            quantity: 2,
            productName: "A",
            price: "349.00",
          },
          {
            id: "b",
            orderItemId: "ob",
            quantity: 1,
            productName: "B",
            price: "100.00",
          },
        ],
      }),
    ]);
    const { container } = renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    expect(
      container.querySelector('td[data-column-id="units"]'),
    ).toHaveTextContent("3");
    expect(
      container.querySelector('td[data-column-id="amount"]')?.textContent,
    ).toMatch(/798\s?₴/);
  });

  it("shows the reason in its own column", async () => {
    stubReturns();
    renderWithProviders(<AdminReturnTable />);
    expect(await screen.findByText("Не підійшов розмір")).toBeInTheDocument();
  });

  it("says how long an open request has been waiting, and nothing on a closed one", async () => {
    const day = 24 * 60 * 60 * 1000;
    stubReturns([
      makeReturnRow({
        requestedAt: new Date(Date.now() - 2 * day - 1000).toISOString(),
      }),
      makeReturnRow({
        id: "approved-uuid-1",
        status: "APPROVED",
        resolvedAt: new Date(Date.now() - 4 * day - 1000).toISOString(),
      }),
      makeReturnRow({ id: "received-uuid-1", status: "RECEIVED" }),
      makeReturnRow({ id: "refunded-uuid-1", status: "REFUNDED" }),
    ]);
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    expect(screen.getByText(d.ageWaiting(2))).toBeInTheDocument();
    expect(screen.getByText(d.ageAwaitingGoods(4))).toBeInTheDocument();
    expect(screen.getByText(d.ageRefundDue)).toBeInTheDocument();
  });

  it("says how many requests were found and in what order", async () => {
    stubReturns([makeReturnRow()], 6);
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    expect(screen.getByText(d.summaryFound, { exact: false }).textContent).toBe(
      `${d.summaryFound} 6 заявок`,
    );
    expect(
      screen.getByText(r.summarySort(d.sortRequestedDesc), { exact: false }),
    ).toBeInTheDocument();
  });

  it("opens the return on a click anywhere on the row (was «Переглянути»)", async () => {
    stubReturns();
    renderWithProviders(<AdminReturnTable />);

    await userEvent.click(await screen.findByText("Не підійшов розмір"));
    expect(mockPush).toHaveBeenCalledWith("/returns/return-uuid-12345678");
  });

  it("offers open, open in a new tab, copy the number and the order in «⋯»", async () => {
    const user = userEvent.setup();
    stubReturns();
    renderWithProviders(<AdminReturnTable />);
    const write = jest.spyOn(navigator.clipboard, "writeText");

    await user.click(
      await screen.findByRole("button", {
        name: r.rowActionsAria(d.rowAria(ROW_NUMBER)),
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: d.rowOpen }),
    ).toHaveAttribute("href", "/returns/return-uuid-12345678");
    expect(
      screen.getByRole("menuitem", { name: d.rowOpenNewTab }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("menuitem", { name: d.rowOpenOrder }),
    ).toHaveAttribute("href", "/orders/order-uuid-87654321");

    await user.click(screen.getByRole("menuitem", { name: d.rowCopyNumber }));
    expect(write).toHaveBeenLastCalledWith(ROW_NUMBER);
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.copiedNumber(ROW_NUMBER)),
    );
  });
});

describe("AdminReturnTable — cards below md (Р2)", () => {
  it("draws a card per return with number, status, reason, amount and «⋯»", async () => {
    setViewport(true);
    stubReturns();
    renderWithProviders(<AdminReturnTable />);

    const card = await screen.findByRole("listitem", {
      name: d.rowAria(ROW_NUMBER),
    });
    const inCard = within(card);
    expect(inCard.getByText(ROW_NUMBER)).toBeInTheDocument();
    expect(inCard.getByText(d.statusREQUESTED)).toBeInTheDocument();
    expect(inCard.getByText("Не підійшов розмір")).toBeInTheDocument();
    expect(inCard.getByText(/499\s?₴/)).toBeInTheDocument();
    expect(
      inCard.getByText(ORDER_NUMBER, { exact: false }),
    ).toBeInTheDocument();
    expect(
      inCard.getByRole("button", {
        name: r.rowActionsAria(d.rowAria(ROW_NUMBER)),
      }),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-423 — the queue had no search at all, so an operator with the customer on
 * the phone could only page through it. The search is the shared one: it types
 * into the URL, it has no submit button, and the term it sends is what the
 * repository matches against the return id, the order id prefix, the customer's
 * email/phone and the reason.
 */
describe("AdminReturnTable — search and page size (TASK-423)", () => {
  it("debounces the typed term into the URL — no submit button anywhere", async () => {
    stubReturns();
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    await userEvent.type(screen.getByLabelText(d.searchAria), "olena");

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/returns?search=olena"),
    );
    expect(
      // The old submit button's label; the debounce replaced it (TASK-816 dropped the key).
      screen.queryByRole("button", { name: "Пошук" }),
    ).not.toBeInTheDocument();
  });

  it("names only the fields the API searches — no name", async () => {
    stubReturns();
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    expect(
      screen.getByRole("searchbox", { name: d.searchAria }),
    ).toHaveAttribute("placeholder", d.searchPlaceholder);
    expect(d.searchPlaceholder).not.toMatch(/ім'я/);
    expect(screen.getByRole("button", { name: r.columns })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: r.view(d.viewDefault) }),
    ).toBeInTheDocument();
  });

  it("forwards the URL's term and the shared page size to the API", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=ABC12345");
    const params = stubReturns();

    renderWithProviders(<AdminReturnTable />);
    await screen.findByText(ROW_NUMBER);

    expect(params[0].get("search")).toBe("ABC12345");
    expect(params[0].get("limit")).toBe("20");
  });

  it("names the TERM in the empty state, not the status filter", async () => {
    // Both are active: the term is the thing the operator just typed, so it is
    // the one they will edit to get rows back.
    mockSearchParamsRef.current = new URLSearchParams(
      "search=ghost&status=REFUNDED",
    );
    stubReturns([]);

    renderWithProviders(<AdminReturnTable />);

    expect(await screen.findByText(r.noResults("ghost"))).toBeInTheDocument();
  });
});
