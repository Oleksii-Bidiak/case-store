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
import { AdminOrderTable } from "./admin-order-table";

// next/navigation is unavailable under jsdom — mock the router + URL state.
// `mockSearchParams` is mutable so deep-link tests can seed the URL (TASK-250).
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
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

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

/** One admin order row with a joined customer (TASK-125). */
function makeOrderRow(customer: unknown) {
  return {
    id: "order-uuid-12345678",
    userId: "user-uuid-87654321",
    status: "PENDING",
    paymentStatus: "PENDING",
    subtotal: "29.99",
    discount: "0",
    shippingCost: "0",
    tax: "0",
    total: "29.99",
    shippingAddress: null,
    billingAddress: null,
    notes: null,
    items: [{ id: "item-1" }],
    customer,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

describe("AdminOrderTable — customer column (TASK-125)", () => {
  it("shows the customer email and name, not the user UUID", async () => {
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [
            makeOrderRow({
              id: "user-uuid-87654321",
              email: "buyer@example.com",
              firstName: "Ivan",
              lastName: "Petrenko",
            }),
          ],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Ivan Petrenko")).toBeInTheDocument();
    // The UUID fallback must not render when a customer is present.
    expect(screen.queryByText(/user-uui…|87654321…/)).not.toBeInTheDocument();
    // Status badges render Ukrainian labels, not raw enums (TASK-129).
    expect(screen.getByText("Очікує підтвердження")).toBeInTheDocument();
    expect(screen.getByText("Очікує оплати")).toBeInTheDocument();
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
  });

  it("falls back to the truncated user id when no customer is joined", async () => {
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [makeOrderRow(null)],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("user-uui…")).toBeInTheDocument();
  });
});

describe("AdminOrderTable — lifecycle tabs (TASK-250)", () => {
  it.each([
    [dict.orders.tabNew, "/orders?status=PENDING"],
    [dict.orders.tabProcessing, "/orders?status=CONFIRMED,PROCESSING"],
    [dict.orders.tabShipped, "/orders?status=SHIPPED"],
  ])("clicking «%s» writes %s and resets page", async (label, expectedUrl) => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    await userEvent.click(screen.getByRole("tab", { name: label }));

    // Radix automatic activation may fire onValueChange on both focus and click;
    // every call carries the same (idempotent) URL, so assert on the value written.
    expect(mockReplace).toHaveBeenCalled();
    // URLSearchParams percent-encodes the comma in CONFIRMED,PROCESSING (%2C);
    // decode before comparing so the CSV contract reads literally.
    for (const [url] of mockReplace.mock.calls) {
      expect(decodeURIComponent(url)).toBe(expectedUrl);
    }
  });

  it("clicking «Всі» clears the status filter", async () => {
    mockSearchParams = new URLSearchParams("status=PENDING");
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(/Немає замовлень зі статусом/);

    await userEvent.click(
      screen.getByRole("tab", { name: dict.orders.tabAll }),
    );

    expect(mockReplace).toHaveBeenCalledWith("/orders");
  });

  it("resets ?page= to 1 (drops it) when switching tabs", async () => {
    mockSearchParams = new URLSearchParams("page=3");
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    await userEvent.click(
      screen.getByRole("tab", { name: dict.orders.tabShipped }),
    );

    const url = mockReplace.mock.calls[0][0];
    expect(url).toContain("status=SHIPPED");
    expect(url).not.toContain("page=");
  });

  it("deep-links: ?status=CONFIRMED,PROCESSING renders В обробці active + filters the table", async () => {
    mockSearchParams = new URLSearchParams("status=CONFIRMED,PROCESSING");
    let capturedStatus: string | null = null;
    server.use(
      http.get("*/api/admin/orders", ({ request }) => {
        capturedStatus = new URL(request.url).searchParams.get("status");
        return HttpResponse.json({
          data: [makeOrderRow(null)],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      }),
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText("user-uui…");

    // The table is filtered server-side with the CSV status.
    expect(capturedStatus).toBe("CONFIRMED,PROCESSING");
    // Only the В обробці tab is active.
    expect(
      screen.getByRole("tab", { name: dict.orders.tabProcessing }),
    ).toHaveAttribute("data-state", "active");
    expect(
      screen.getByRole("tab", { name: dict.orders.tabNew }),
    ).toHaveAttribute("data-state", "inactive");
    expect(
      screen.getByRole("tab", { name: dict.orders.tabAll }),
    ).toHaveAttribute("data-state", "inactive");
  });

  it("deep-links: ?status=DELIVERED filters the table with no preset tab active", async () => {
    mockSearchParams = new URLSearchParams("status=DELIVERED");
    let capturedStatus: string | null = null;
    server.use(
      http.get("*/api/admin/orders", ({ request }) => {
        capturedStatus = new URL(request.url).searchParams.get("status");
        return HttpResponse.json({
          data: [makeOrderRow(null)],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      }),
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText("user-uui…");

    expect(capturedStatus).toBe("DELIVERED");
    // No preset tab matches DELIVERED — every tab renders inactive.
    for (const label of [
      dict.orders.tabNew,
      dict.orders.tabProcessing,
      dict.orders.tabShipped,
      dict.orders.tabAll,
    ]) {
      expect(screen.getByRole("tab", { name: label })).toHaveAttribute(
        "data-state",
        "inactive",
      );
    }
  });
});

/**
 * TASK-405 — the demo run hit `/orders?status=…` opened in a fresh tab and found
 * the filter controls dead. Two independent causes; these cover the second one.
 *
 * The first was the route: `page.tsx` was statically prerendered, so a hard load
 * with a query string served a prerender that a later query-only
 * `router.replace` never re-rendered. That is fixed by `export const dynamic`
 * on the route and is not observable from a widget test — jsdom has no Next
 * router; the assertions below are exactly the part that is.
 *
 * The second was in this widget: the "Всі" tab carried `value: ""`, which is not
 * a legal Radix `Tabs` value. `?status=PROCESSING` (a single status — the Select
 * writes it, no preset tab matches it) is the state the run was actually in.
 */
describe("AdminOrderTable — «Всі» tab sentinel (TASK-405)", () => {
  it("switches away from a deep-linked ?status=PROCESSING", async () => {
    mockSearchParams = new URLSearchParams("status=PROCESSING");
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(/Немає замовлень зі статусом/);

    // A single PROCESSING matches no preset, so nothing renders active on arrival.
    for (const label of [
      dict.orders.tabNew,
      dict.orders.tabProcessing,
      dict.orders.tabShipped,
      dict.orders.tabAll,
    ]) {
      expect(screen.getByRole("tab", { name: label })).toHaveAttribute(
        "data-state",
        "inactive",
      );
    }

    await userEvent.click(
      screen.getByRole("tab", { name: dict.orders.tabShipped }),
    );

    expect(mockReplace).toHaveBeenCalled();
    for (const [url] of mockReplace.mock.calls) {
      expect(url).toBe("/orders?status=SHIPPED");
    }
  });

  it("clears ?status=PROCESSING without leaking the sentinel into the URL", async () => {
    mockSearchParams = new URLSearchParams("status=PROCESSING");
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(/Немає замовлень зі статусом/);

    await userEvent.click(
      screen.getByRole("tab", { name: dict.orders.tabAll }),
    );

    expect(mockReplace).toHaveBeenCalled();
    for (const [url] of mockReplace.mock.calls) {
      // `__all__` is a UI-only value: the URL just loses `?status=`.
      expect(url).toBe("/orders");
    }
  });

  it("gives «Всі» a real Radix value and renders it active with no ?status=", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    const allTab = screen.getByRole("tab", { name: dict.orders.tabAll });
    expect(allTab).toHaveAttribute("data-state", "active");
    // Radix derives the trigger id from its `value`; with `""` the id stopped at
    // the separator, which is the shape this test exists to keep out.
    expect(allTab.id).toContain("__all__");
    expect(allTab.id).not.toMatch(/-trigger-$/);
  });
});

describe("AdminOrderTable — column sorting (TASK-147)", () => {
  beforeEach(() => mockReplace.mockClear());

  it("renders sortable headers and updates the URL on click", async () => {
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [makeOrderRow(null)],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText("user-uui…");

    const createdHeader = screen.getByRole("button", {
      name: dict.common.sortByAria(dict.orders.colCreated),
    });
    expect(createdHeader).toBeInTheDocument();

    await userEvent.click(createdHeader);

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("sortBy=createdAt"),
    );
  });
});

describe("AdminOrderTable — toolbar refresh (TASK-354)", () => {
  it("refetches the queue when Оновити is pressed", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/admin/orders", () => {
        calls += 1;
        return HttpResponse.json({
          data: [makeOrderRow(null)],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      }),
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText("user-uui…");
    expect(calls).toBe(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(calls).toBe(2));
  });

  it("keeps the lifecycle tabs working from inside the toolbar", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    // The tabs moved into the toolbar's `filters` slot; the deep-link contract
    // (TASK-250) is unchanged, so the same click writes the same URL.
    await userEvent.click(
      screen.getByRole("tab", { name: dict.orders.tabShipped }),
    );

    expect(mockReplace).toHaveBeenCalledWith("/orders?status=SHIPPED");
  });
});

describe("AdminOrderTable — mobile card layout (TASK-258)", () => {
  it("renders in card mode with per-cell labels", async () => {
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [makeOrderRow(null)],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

    const { container } = renderWithProviders(<AdminOrderTable />);
    await screen.findByText("user-uui…");

    expect(container.querySelector('[data-slot="table"]')).toHaveClass(
      "max-md:block",
    );
    expect(
      container.querySelector(`[data-label="${dict.orders.colStatus}"]`),
    ).toBeInTheDocument();
    expect(
      container.querySelector(`[data-label="${dict.common.actions}"]`),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-425 — the list as a queue: filter by what the money did, by how it was
 * meant to arrive, and by "this has been sitting too long".
 */
describe("AdminOrderTable — queue filters (TASK-425)", () => {
  /** Capture the query string the table actually asks the API for. */
  const captureListUrl = (): { current: string } => {
    const seen = { current: "" };
    server.use(
      http.get("*/api/admin/orders", ({ request }) => {
        seen.current = request.url;
        return HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
        });
      }),
    );
    return seen;
  };

  it("offers a payment-status and a payment-method filter", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    expect(
      screen.getByRole("combobox", {
        name: dict.orders.filterPaymentStatusAria,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: dict.orders.filterPaymentMethodAria,
      }),
    ).toBeInTheDocument();
  });

  it("sends the payment filters from the URL to the API", async () => {
    const seen = captureListUrl();
    mockSearchParams = new URLSearchParams(
      "paymentStatus=FAILED&paymentMethod=ONLINE",
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    await waitFor(() => expect(seen.current).toContain("paymentStatus=FAILED"));
    expect(seen.current).toContain("paymentMethod=ONLINE");
  });

  it("selecting a payment status writes it to the URL and resets the page", async () => {
    mockSearchParams = new URLSearchParams("page=3");
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    await userEvent.click(
      screen.getByRole("combobox", {
        name: dict.orders.filterPaymentStatusAria,
      }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Оплачено" }));

    expect(mockReplace).toHaveBeenCalledWith("/orders?paymentStatus=PAID");
  });

  // TASK-472. The option list claimed "every value of the enum" and no test held
  // it to that, which is how PARTIALLY_REFUNDED could be added to the enum and
  // missed here. Asserted against `OrderEntityPaymentStatus` itself, so the next
  // value added to the enum fails this test instead of silently going missing.
  it("offers every payment status, PARTIALLY_REFUNDED included", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    await userEvent.click(
      screen.getByRole("combobox", {
        name: dict.orders.filterPaymentStatusAria,
      }),
    );

    for (const status of Object.values(OrderEntityPaymentStatus)) {
      expect(
        screen.getByRole("option", { name: paymentStatusLabel(status) }),
      ).toBeInTheDocument();
    }
  });

  it("filters by PARTIALLY_REFUNDED from the picker", async () => {
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    await userEvent.click(
      screen.getByRole("combobox", {
        name: dict.orders.filterPaymentStatusAria,
      }),
    );
    await userEvent.click(
      screen.getByRole("option", {
        name: dict.orderStatus.paymentLabels.PARTIALLY_REFUNDED,
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/orders?paymentStatus=PARTIALLY_REFUNDED",
    );
  });

  it("toggles the «waiting too long» chip into a SERVER filter", async () => {
    const seen = captureListUrl();
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    const chip = screen.getByRole("button", {
      name: dict.orders.overdueChipAria,
    });
    // Off by default, and it says so to a screen reader rather than only by colour.
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(chip);

    expect(mockReplace).toHaveBeenCalledWith("/orders?pendingOverdue=true");
    // Never filtered client-side: the 48-hour threshold is the dashboard's
    // constant and lives on the server, so the chip and the tile agree by
    // construction.
    expect(seen.current).not.toContain("pendingOverdue");
  });

  it("renders the chip pressed and asks the API for it when deep-linked", async () => {
    const seen = captureListUrl();
    mockSearchParams = new URLSearchParams("pendingOverdue=true");

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    expect(
      screen.getByRole("button", { name: dict.orders.overdueChipAria }),
    ).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(seen.current).toContain("pendingOverdue=true"));
  });

  it("clicking the pressed chip clears the filter", async () => {
    mockSearchParams = new URLSearchParams("pendingOverdue=true");
    renderWithProviders(<AdminOrderTable />);
    await screen.findByText(dict.orders.empty);

    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.overdueChipAria }),
    );

    expect(mockReplace).toHaveBeenCalledWith("/orders");
  });
});

describe("AdminOrderTable — account or guest (TASK-425)", () => {
  const guestRow = {
    ...makeOrderRow(null),
    userId: null,
    guest: {
      email: "olena@example.com",
      phone: "+380501112233",
      name: "Олена Шевченко",
    },
  };

  it("labels each row as an account or a guest in its own column", async () => {
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [
            makeOrderRow({
              id: "user-uuid-87654321",
              email: "buyer@example.com",
              firstName: "Ivan",
              lastName: "Petrenko",
            }),
            { ...guestRow, id: "order-uuid-87654321" },
          ],
          meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

    renderWithProviders(<AdminOrderTable />);

    expect(
      await screen.findByText(dict.orders.customerTypeAccount),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.orders.customerTypeGuest)).toBeInTheDocument();
    expect(screen.getByText(dict.orders.colCustomerType)).toBeInTheDocument();
  });

  it("falls back to the phone when a guest order has no email (TASK-426)", async () => {
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          // The order an operator takes by phone: `ManualOrderContactDto` makes
          // the email optional, so the API answers `email: null`. Reading the
          // email alone left this row's customer cell blank — the one contact
          // the operator had just typed, invisible on the queue they live in.
          data: [{ ...guestRow, guest: { ...guestRow.guest, email: null } }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

    renderWithProviders(<AdminOrderTable />);

    expect(await screen.findByText("+380501112233")).toBeInTheDocument();
    expect(screen.getByText(dict.orders.customerTypeGuest)).toBeInTheDocument();
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

  const stubList = (total: number) =>
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [makeOrderRow(null)],
          meta: { total, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    URL.createObjectURL = jest.fn(() => "blob:mock-url");
    URL.revokeObjectURL = jest.fn();
    clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it("exports the CURRENT SELECTION, not the page on screen", async () => {
    stubList(1);
    const seen = stubExport("orderNumber,total\r\nABC12345,1469.00");
    // Filters as applied — including the ones a Select cannot express.
    mockSearchParams = new URLSearchParams(
      "status=PENDING&search=ABC&paymentStatus=PENDING&pendingOverdue=true&page=2",
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText("user-uui…");

    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.exportCsv }),
    );

    await waitFor(() => expect(seen.url).toContain("status=PENDING"));
    expect(seen.url).toContain("search=ABC");
    expect(seen.url).toContain("paymentStatus=PENDING");
    expect(seen.url).toContain("pendingOverdue=true");
    // The page is NOT sent: the export is the selection, and the server refuses
    // a paged export outright rather than returning an ambiguous file.
    expect(seen.url).not.toContain("page=");

    await waitFor(() =>
      expect(URL.createObjectURL as jest.Mock).toHaveBeenCalledTimes(1),
    );
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith(dict.orders.exportSuccess(1));
  });

  it("says so — and keeps saying so — when the server capped the file", async () => {
    // The list knows 9 000 orders match; the file came back with two.
    stubList(9000);
    stubExport("orderNumber,total\r\nABC12345,1469.00\r\nDEF67890,99.00");

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText("user-uui…");

    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.exportCsv }),
    );

    // Through toast.ERROR, which is sticky: a spreadsheet quietly missing most
    // of the orders is the one outcome the operator must not scroll past.
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        dict.orders.exportTruncated(2, 9000),
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    // The file is still handed over — a partial export beats none.
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("reports a failed export instead of downloading an empty file", async () => {
    stubList(1);
    server.use(
      http.get("*/api/admin/orders/export", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(<AdminOrderTable />);
    await screen.findByText("user-uui…");

    await userEvent.click(
      screen.getByRole("button", { name: dict.orders.exportCsv }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(dict.orders.exportError),
    );
    expect(clickSpy).not.toHaveBeenCalled();
  });
});

/**
 * The derived marks and their filters (TASK-470 / 471 / 472).
 *
 * Two halves, and they fail differently. The CHIPS are pure rendering over the
 * row the API returned — worth testing because each is a compound condition and
 * a wrong one is invisible: the order quietly carries no chip, and an operator
 * concludes it is fine. The FILTERS are worth testing because they must reach
 * the SERVER: the marks are conditions over three or four columns and the list
 * is paginated, so anything filtered on the client would answer "how many on
 * this page" while looking exactly like the right answer.
 */
describe("AdminOrderTable — the derived marks of B-1 (TASK-470/471/472)", () => {
  const captureUrl = (): { current: string } => {
    const seen = { current: "" };
    server.use(
      http.get("*/api/admin/orders", ({ request }) => {
        seen.current = request.url;
        return HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
        });
      }),
    );
    return seen;
  };

  const stubRow = (row: Record<string, unknown>) =>
    server.use(
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [{ ...makeOrderRow(null), ...row }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );

  /**
   * Queries are scoped to the TABLE on purpose. Every mark has a filter toggle
   * in the toolbar carrying the same words, which is the point — the operator
   * clicks the toggle that matches the chip they just read — but it means an
   * unscoped `getByText` would find the control as readily as the row.
   */
  const table = async () => {
    // Wait for a cell of the real row first: the loading SKELETON is a <table>
    // too, so `findByRole("table")` resolves against it and every query inside
    // then misses.
    await screen.findByText("user-uui…");
    return within(screen.getByRole("table"));
  };

  describe("the chips on a row", () => {
    it("flags a delivered order nobody paid for", async () => {
      stubRow({
        status: "DELIVERED",
        paymentStatus: "PENDING",
        total: "1200.00",
      });

      renderWithProviders(<AdminOrderTable />);

      // The amount is IN the chip: an operator about to ring the customer needs
      // the figure, not a flag that something is wrong.
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
        (await table()).getByText(dict.orders.markReservationExpired),
      ).toBeInTheDocument();
    });

    it("shows the refunded fraction on a partially refunded order", async () => {
      stubRow({
        paymentStatus: "PARTIALLY_REFUNDED",
        refundedTotal: "499.00",
        total: "1200.00",
      });

      renderWithProviders(<AdminOrderTable />);

      // `\d` after the words, because the payment BADGE beside it reads exactly
      // «Частково повернуто» — the mark is the one that carries the fraction.
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
      expect(
        row.queryByText(dict.orders.markReservationExpired),
      ).not.toBeInTheDocument();
    });
  });

  describe("the toggles that filter by them", () => {
    const TOGGLES: ReadonlyArray<[string, string]> = [
      [dict.orders.debtChipAria, "hasDebt"],
      [dict.orders.awaitingPaymentChipAria, "awaitingPayment"],
      [dict.orders.reservationExpiredChipAria, "reservationExpired"],
      [dict.orders.unavailableItemsChipAria, "hasUnavailableItems"],
    ];

    it.each(TOGGLES)(
      "«%s» writes ?%s=true and never filters client-side",
      async (aria, param) => {
        const seen = captureUrl();
        renderWithProviders(<AdminOrderTable />);
        await screen.findByText(dict.orders.empty);

        const chip = screen.getByRole("button", { name: aria });
        // Off by default, and it says so to a screen reader rather than by colour.
        expect(chip).toHaveAttribute("aria-pressed", "false");

        await userEvent.click(chip);

        expect(mockReplace).toHaveBeenCalledWith(`/orders?${param}=true`);
        expect(seen.current).not.toContain(param);
      },
    );

    it.each(TOGGLES)(
      "renders «%s» pressed and asks the API for ?%s when deep-linked",
      async (aria, param) => {
        const seen = captureUrl();
        mockSearchParams = new URLSearchParams(`${param}=true`);

        renderWithProviders(<AdminOrderTable />);
        await screen.findByText(dict.orders.empty);

        expect(screen.getByRole("button", { name: aria })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await waitFor(() => expect(seen.current).toContain(`${param}=true`));
      },
    );

    it("clicking a pressed toggle clears it", async () => {
      mockSearchParams = new URLSearchParams("hasDebt=true");
      renderWithProviders(<AdminOrderTable />);
      await screen.findByText(dict.orders.empty);

      await userEvent.click(
        screen.getByRole("button", { name: dict.orders.debtChipAria }),
      );

      expect(mockReplace).toHaveBeenCalledWith("/orders");
    });

    it("composes two marks at once", async () => {
      // Independent booleans rather than one `?mark=` choice, precisely so this
      // question — "delivered, unpaid AND missing a position" — is expressible.
      const seen = captureUrl();
      mockSearchParams = new URLSearchParams(
        "hasDebt=true&hasUnavailableItems=true",
      );

      renderWithProviders(<AdminOrderTable />);
      await screen.findByText(dict.orders.empty);

      await waitFor(() => expect(seen.current).toContain("hasDebt=true"));
      expect(seen.current).toContain("hasUnavailableItems=true");
    });

    it("carries the mark filters into the CSV export", async () => {
      // The export's promise is "the rows you are looking at"; a file that
      // silently disagrees with the screen it came from gives no hint that it is
      // the one lying.
      mockSearchParams = new URLSearchParams("hasUnavailableItems=true");
      const exportSeen = { current: "" };
      server.use(
        http.get("*/api/admin/orders", () =>
          HttpResponse.json({
            data: [makeOrderRow(null)],
            meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
          }),
        ),
        http.get("*/api/admin/orders/export", ({ request }) => {
          exportSeen.current = request.url;
          return HttpResponse.text("id\r\norder-uuid-12345678");
        }),
      );

      renderWithProviders(<AdminOrderTable />);
      await screen.findByText("user-uui…");

      await userEvent.click(
        screen.getByRole("button", { name: dict.orders.exportCsv }),
      );

      await waitFor(() =>
        expect(exportSeen.current).toContain("hasUnavailableItems=true"),
      );
    });
  });
});
