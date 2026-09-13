import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminReturnTable } from "./admin-return-table";

// next/navigation is unavailable under jsdom — mock the router + URL state.
const mockReplace = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/returns",
  useSearchParams: () => mockSearchParamsRef.current,
}));

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
    items: [{ id: "item-1" }],
    ...overrides,
  };
}

function listResponse(rows: unknown[]) {
  return HttpResponse.json({
    data: rows,
    meta: { total: rows.length, page: 1, limit: 20, totalPages: 1 },
  });
}

describe("AdminReturnTable — sorting and refresh (TASK-354)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  it("sends the queue's own default sort, not the shared createdAt one", async () => {
    let captured: URLSearchParams | null = null;
    server.use(
      http.get("*/api/admin/returns", ({ request }) => {
        captured = new URL(request.url).searchParams;
        return listResponse([makeReturnRow()]);
      }),
    );

    renderWithProviders(<AdminReturnTable />);
    await screen.findByText("return-u…");

    // `createdAt` is not a column on this endpoint — sending it would come back
    // a 400 from the DTO's @IsIn guard, so the default has to be requestedAt.
    expect(captured!.get("sortBy")).toBe("requestedAt");
    expect(captured!.get("sortOrder")).toBe("desc");
  });

  it("writes the clicked column to the URL", async () => {
    server.use(
      http.get("*/api/admin/returns", () => listResponse([makeReturnRow()])),
    );

    renderWithProviders(<AdminReturnTable />);
    await screen.findByText("return-u…");

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.returns.colRefunded),
      }),
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("sortBy=refundedAmount"),
      ),
    );
  });

  it("refetches the queue when Оновити is pressed", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/admin/returns", () => {
        calls += 1;
        return listResponse([makeReturnRow()]);
      }),
    );

    renderWithProviders(<AdminReturnTable />);
    await screen.findByText("return-u…");
    expect(calls).toBe(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(calls).toBe(2));
  });

  it("keeps the status filter working from inside the toolbar", async () => {
    server.use(
      http.get("*/api/admin/returns", () => listResponse([makeReturnRow()])),
    );

    renderWithProviders(<AdminReturnTable />);
    await screen.findByText("return-u…");

    await userEvent.click(
      screen.getByRole("combobox", { name: dict.returns.filterStatusAria }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: dict.returns.statusREFUNDED }),
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("status=REFUNDED"),
      ),
    );
  });

  it("renders an unrefunded return as a dash, not as 0 ₴", async () => {
    server.use(
      http.get("*/api/admin/returns", () =>
        listResponse([
          makeReturnRow(),
          // A distinct id prefix: both rows show `id.slice(0, 8)`, so reusing
          // the fixture's would make the row lookup ambiguous.
          makeReturnRow({ id: "refunded-uuid-2", refundedAmount: "0" }),
        ]),
      ),
    );

    const { container } = renderWithProviders(<AdminReturnTable />);
    await screen.findByText("return-u…");

    const refunded = container.querySelectorAll(
      `[data-label="${dict.returns.colRefunded}"]`,
    );
    expect(refunded[0]).toHaveTextContent("—");
    expect(refunded[1]).not.toHaveTextContent("—");
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
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  function stubReturns(rows = [makeReturnRow()]) {
    const params: URLSearchParams[] = [];
    server.use(
      http.get("*/api/admin/returns", ({ request }) => {
        params.push(new URL(request.url).searchParams);
        return listResponse(rows);
      }),
    );
    return params;
  }

  it("debounces the typed term into the URL — no submit button anywhere", async () => {
    stubReturns();
    renderWithProviders(<AdminReturnTable />);
    await screen.findByText("return-u…");

    await userEvent.type(
      screen.getByLabelText(dict.returns.searchAria),
      "olena",
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/returns?search=olena"),
    );
    expect(
      screen.queryByRole("button", { name: dict.common.search }),
    ).not.toBeInTheDocument();
  });

  it("forwards the URL's term and the shared page size to the API", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=ABC12345");
    const params = stubReturns();

    renderWithProviders(<AdminReturnTable />);
    await screen.findByText("return-u…");

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

    expect(
      await screen.findByText(dict.returns.emptyMatch("ghost")),
    ).toBeInTheDocument();
  });
});
