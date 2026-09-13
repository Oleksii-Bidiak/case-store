import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminReviewTable } from "./admin-review-table";

// next/navigation is unavailable under jsdom — mock the router + URL state.
const mockReplace = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/reviews",
  useSearchParams: () => mockSearchParamsRef.current,
}));

function makeReviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "review-uuid-1",
    userId: "user-uuid-1",
    productId: "product-uuid-1",
    rating: 5,
    comment: "Чудовий чохол, дуже задоволений покупкою!",
    verifiedPurchase: true,
    isActive: false,
    createdAt: "2026-06-01T10:00:00.000Z",
    userEmail: "olena@example.com",
    productName: "iPhone 15 Pro Case",
    // TASK-430 — on the wire since the same task added it to AdminReviewEntity.
    productSku: "CASE-IP15P-BLK",
    ...overrides,
  };
}

function listResponse(rows: unknown[]) {
  return HttpResponse.json({
    data: rows,
    meta: { total: rows.length, page: 1, limit: 20, totalPages: 1 },
  });
}

describe("AdminReviewTable", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  it("renders product name, author, rating, and truncated comment", async () => {
    server.use(
      http.get("*/api/admin/reviews", () =>
        listResponse([
          makeReviewRow(),
          makeReviewRow({
            id: "review-uuid-2",
            userEmail: "ivan@example.com",
            productName: "Screen Protector",
          }),
        ]),
      ),
    );

    renderWithProviders(<AdminReviewTable />);

    expect(await screen.findByText("iPhone 15 Pro Case")).toBeInTheDocument();
    expect(screen.getByText("Screen Protector")).toBeInTheDocument();
    // Author is the email local-part, not the full email.
    expect(screen.getByText("olena")).toBeInTheDocument();
    expect(screen.getByText("ivan")).toBeInTheDocument();
    // Rating renders as an accessible star row.
    expect(
      screen.getAllByLabelText(dict.reviews.ratingAria(5)).length,
    ).toBeGreaterThanOrEqual(2);
  });

  /**
   * TASK-430 — the queue showed a product NAME and nothing else. This catalogue has
   * several positions per display name (the same case in four colours), so a
   * moderator could not tell which one a complaint was about, and the name is not a
   * key the catalogue can be searched by.
   */
  it("shows the SKU and links the product to its read-only card", async () => {
    server.use(
      http.get("*/api/admin/reviews", () => listResponse([makeReviewRow()])),
    );

    renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByText("CASE-IP15P-BLK")).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: dict.reviews.productLinkAria("iPhone 15 Pro Case"),
    });
    expect(link).toHaveAttribute("href", "/products/product-uuid-1");
    expect(link.getAttribute("href")).not.toContain("/edit");
  });

  it("says «без артикулу» rather than leaving the cell blank", async () => {
    // `Product.sku` is nullable: a position can exist before an article number is
    // assigned, and an empty cell reads as a rendering fault.
    server.use(
      http.get("*/api/admin/reviews", () =>
        listResponse([makeReviewRow({ productSku: null })]),
      ),
    );

    renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByText(dict.reviews.noSku)).toBeInTheDocument();
  });

  it("calls the approve mutation when Approve is clicked", async () => {
    const user = userEvent.setup();
    let approved: string | null = null;
    server.use(
      http.get("*/api/admin/reviews", () => listResponse([makeReviewRow()])),
      http.patch("*/api/admin/reviews/:id/approve", ({ params }) => {
        approved = params.id as string;
        return HttpResponse.json({ data: makeReviewRow({ isActive: true }) });
      }),
    );

    renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(
      screen.getByRole("button", { name: dict.reviews.approve }),
    );

    await waitFor(() => expect(approved).toBe("review-uuid-1"));
  });

  it("calls the reject (delete) mutation when Reject is clicked", async () => {
    const user = userEvent.setup();
    let rejected: string | null = null;
    server.use(
      http.get("*/api/admin/reviews", () => listResponse([makeReviewRow()])),
      http.delete("*/api/admin/reviews/:id", ({ params }) => {
        rejected = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(screen.getByRole("button", { name: dict.reviews.reject }));

    await waitFor(() => expect(rejected).toBe("review-uuid-1"));
  });

  it("updates the status URL param when the filter changes", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/admin/reviews", () => listResponse([makeReviewRow()])),
    );

    renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(
      screen.getByRole("combobox", { name: dict.reviews.filterStatusAria }),
    );
    await user.click(
      await screen.findByRole("option", { name: dict.reviews.filterApproved }),
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("status=approved"),
      ),
    );
  });

  it("renders in card mode with per-cell labels (TASK-258)", async () => {
    server.use(
      http.get("*/api/admin/reviews", () => listResponse([makeReviewRow()])),
    );

    const { container } = renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    expect(container.querySelector('[data-slot="table"]')).toHaveClass(
      "max-md:block",
    );
    expect(
      container.querySelector(`[data-label="${dict.reviews.colProduct}"]`),
    ).toBeInTheDocument();
    expect(
      container.querySelector(`[data-label="${dict.common.actions}"]`),
    ).toBeInTheDocument();
  });

  it("announces the selection into the live region (TASK-292)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/admin/reviews", () =>
        listResponse([
          makeReviewRow(),
          makeReviewRow({
            id: "review-uuid-2",
            userEmail: "ivan@example.com",
            productName: "Screen Protector",
          }),
        ]),
      ),
    );

    renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    // Regression guard. `useRowSelection` and `useReviewBulkModeration` both
    // call `useAnnouncer()`, so they have to run BELOW the `<LiveAnnouncer>`.
    // A hook called in the very component that renders the provider silently
    // gets the default no-op context, and every announcement disappears with
    // nothing on screen looking wrong.
    await user.click(
      screen.getByRole("checkbox", {
        name: dict.reviews.bulk.selectRow("iPhone 15 Pro Case", "olena"),
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.announceSelected(
          dict.reviews.rowAria("iPhone 15 Pro Case", "olena"),
          1,
        ),
      ),
    );
  });
});

/**
 * TASK-423 — the moderation queue had no search, so triaging a backlog meant
 * paging through it and "what did this customer write about that product?" could
 * not be answered from this screen at all.
 */
describe("AdminReviewTable — search and page size (TASK-423)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  function stubReviews(rows = [makeReviewRow()]) {
    const params: URLSearchParams[] = [];
    server.use(
      http.get("*/api/admin/reviews", ({ request }) => {
        params.push(new URL(request.url).searchParams);
        return listResponse(rows);
      }),
    );
    return params;
  }

  it("debounces the typed term into the URL", async () => {
    stubReviews();
    renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.type(
      screen.getByLabelText(dict.reviews.searchAria),
      "чохол",
    );

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("search=%D1%87%D0%BE%D1%85%D0%BE%D0%BB"),
      ),
    );
  });

  it("forwards the term and the shared page size to the API", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=case");
    const params = stubReviews();

    renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    expect(params[0].get("search")).toBe("case");
    expect(params[0].get("limit")).toBe("20");
  });

  it("names the term in the empty state instead of «черга порожня»", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=ghost");
    stubReviews([]);

    renderWithProviders(<AdminReviewTable />);

    expect(
      await screen.findByText(dict.reviews.emptyMatch("ghost")),
    ).toBeInTheDocument();
  });

  /**
   * The API treats an absent `status` as `pending`, so there is no "all" state to
   * offer. The shared filter's no-filter option therefore READS as «На розгляді»
   * — an «Усі» that silently returned the pending queue would be a lie the
   * operator could not see through.
   */
  it("labels the cleared status as «На розгляді», the queue an absent param really returns", async () => {
    stubReviews();
    renderWithProviders(<AdminReviewTable />);
    await screen.findByText("iPhone 15 Pro Case");

    const trigger = screen.getByRole("combobox", {
      name: dict.reviews.filterStatusAria,
    });
    expect(trigger).toHaveTextContent(dict.reviews.filterPending);

    await userEvent.click(trigger);
    expect(
      screen.queryByRole("option", { name: dict.common.table.clearAllFilters }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: dict.reviews.filterPending }),
    ).toBeInTheDocument();
  });
});
