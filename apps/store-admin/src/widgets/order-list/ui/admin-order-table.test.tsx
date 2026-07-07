import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
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
