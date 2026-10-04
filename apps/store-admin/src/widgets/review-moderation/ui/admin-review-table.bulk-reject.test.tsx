import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import { dict } from "@/shared/config";
import { AdminReviewTable } from "./admin-review-table";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/reviews",
  useSearchParams: () => new URLSearchParams(""),
}));

/**
 * TASK-812 — the bulk-reject prompt is an AlertDialog now, not `window.confirm`.
 *
 * Kept in its own file (F2 owns the bulk engine, the table itself belongs to the
 * review-queue work) because this is the one call site where the prompt lives
 * in ANOTHER file than the hook: `useReviewBulkModeration` returns
 * `confirmDialog` and the table has to render it (`{bulk.confirmDialog}`). Drop
 * that line and `confirm()` opens nothing, its promise never settles, and the
 * shared engine's in-flight latch stays set — every later bulk approve/reject is
 * silently swallowed. These cases pin the line.
 */
function makeReviewRow() {
  return {
    id: "review-uuid-1",
    userId: "user-uuid-1",
    productId: "product-uuid-1",
    rating: 5,
    comment: "Чудовий чохол, дуже задоволений покупкою!",
    verifiedPurchase: true,
    textStatus: "PENDING",
    ratingVisible: true,
    hiddenAt: null,
    hiddenReason: null,
    createdIp: null,
    reply: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    userEmail: "olena@example.com",
    productName: "iPhone 15 Pro Case",
    productSku: "CASE-IP15P-BLK",
  };
}

function stubEndpoints() {
  const bodies: unknown[] = [];
  server.use(
    http.get("*/api/admin/reviews", () =>
      HttpResponse.json({
        data: [makeReviewRow()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
    http.patch("*/api/admin/reviews/moderate", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ data: { updatedCount: 1 } });
    }),
  );
  return bodies;
}

function renderTable() {
  return renderWithProviders(
    <WithAuth isOwner={false} permissions={[PERM.reviewsModerate]}>
      <AdminReviewTable />
    </WithAuth>,
  );
}

function rowCheckbox() {
  return screen.getByRole("checkbox", {
    // Wave 198: the registry's own checkbox, named after the row.
    name: dict.common.registry.selectRowAria(
      dict.reviews.rowAria("iPhone 15 Pro Case", "olena"),
    ),
  });
}

describe("AdminReviewTable — bulk reject prompt (TASK-812)", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    mockReplace.mockClear();
    confirmSpy = jest.spyOn(window, "confirm");
  });

  afterEach(() => confirmSpy.mockRestore());

  it("asks in an AlertDialog; cancel sends nothing and keeps the selection", async () => {
    const user = userEvent.setup();
    const bodies = stubEndpoints();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(rowCheckbox());
    await user.click(
      screen.getByRole("button", { name: dict.reviews.bulk.reject(1) }),
    );

    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent(dict.reviews.bulk.rejectConfirm(1));

    await user.click(
      within(prompt).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    expect(bodies).toHaveLength(0);
    expect(rowCheckbox()).toBeChecked();
    expect(
      screen.getByRole("button", { name: dict.reviews.bulk.reject(1) }),
    ).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("sends exactly one moderate request once confirmed", async () => {
    const user = userEvent.setup();
    const bodies = stubEndpoints();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(rowCheckbox());
    await user.click(
      screen.getByRole("button", { name: dict.reviews.bulk.reject(1) }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: dict.reviews.reject,
      }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["review-uuid-1"], action: "reject" });
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("a cancelled prompt does not latch the engine: the next approve still goes out", async () => {
    const user = userEvent.setup();
    const bodies = stubEndpoints();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(rowCheckbox());
    await user.click(
      screen.getByRole("button", { name: dict.reviews.bulk.reject(1) }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: dict.common.cancel,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: dict.reviews.bulk.approve(1) }),
    );
    // Wave 198 (В6): approving asks too — its own prompt opens, which is
    // itself the proof the engine is not latched.
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: dict.reviews.bulk.approveConfirmLabel(1),
      }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["review-uuid-1"], action: "approve" });
  });
});
