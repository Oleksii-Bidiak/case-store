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
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/reviews",
  useSearchParams: () => new URLSearchParams(""),
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
  beforeEach(() => mockReplace.mockClear());

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
});
