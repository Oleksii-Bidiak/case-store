import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
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

/**
 * The table now hosts permission-gated row actions (TASK-446), so every case has
 * to render under a session. A MANAGER rather than the owner by default, and the
 * grants come from `PERM` rather than hand-typed literals: `can()` takes a plain
 * `string`, so a literal that drifts from the constant would silently stop
 * matching what the row asks for and the gate tests would pass for free.
 *
 * `reviews:write` is deliberately NOT in the default grant — it is brand new,
 * has no backfill, and the button being absent is the behaviour a fresh deploy
 * actually has.
 */
function renderTable(
  options: { permissions?: string[]; isOwner?: boolean } = {},
) {
  return renderWithProviders(
    <WithAuth
      isOwner={options.isOwner ?? false}
      permissions={options.permissions ?? [PERM.reviewsModerate]}
    >
      <AdminReviewTable />
    </WithAuth>,
  );
}

function makeReviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "review-uuid-1",
    userId: "user-uuid-1",
    productId: "product-uuid-1",
    rating: 5,
    comment: "Чудовий чохол, дуже задоволений покупкою!",
    verifiedPurchase: true,
    // TASK-446: `isActive` is gone from the wire. The text carries a three-value
    // verdict, the rating carries its own independent visibility flag, and the
    // shop's answer (or its absence) rides along.
    textStatus: "PENDING",
    ratingVisible: true,
    reply: null as { body: string; createdAt: string } | null,
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

    renderTable();

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

    renderTable();
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

    renderTable();
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
        return HttpResponse.json({
          data: makeReviewRow({ textStatus: "APPROVED" }),
        });
      }),
    );

    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(
      screen.getByRole("button", { name: dict.reviews.approve }),
    );

    await waitFor(() => expect(approved).toBe("review-uuid-1"));
  });

  /**
   * TASK-446 — the panel was calling a route the backend had removed. Reject used
   * to be `DELETE /api/admin/reviews/:id`, which hard-deleted the row; it is now
   * `PATCH …/:id/reject`, which stamps `textStatus = REJECTED` and leaves the
   * rating counting. The hook kept its NAME across the regeneration, so the panel
   * went on compiling while the button 404'd at runtime.
   */
  it("rejects the text with a PATCH to /reject, never a DELETE", async () => {
    const user = userEvent.setup();
    let rejected: string | null = null;
    let deleted = false;
    server.use(
      http.get("*/api/admin/reviews", () => listResponse([makeReviewRow()])),
      http.patch("*/api/admin/reviews/:id/reject", ({ params }) => {
        rejected = params.id as string;
        return HttpResponse.json({
          data: makeReviewRow({ textStatus: "REJECTED" }),
        });
      }),
      http.delete("*/api/admin/reviews/:id", () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(screen.getByRole("button", { name: dict.reviews.reject }));

    await waitFor(() => expect(rejected).toBe("review-uuid-1"));
    expect(deleted).toBe(false);
  });

  it("updates the status URL param when the filter changes", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/admin/reviews", () => listResponse([makeReviewRow()])),
    );

    renderTable();
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

    const { container } = renderTable();
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

    renderTable();
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
 * TASK-446 — the third queue.
 *
 * Rejecting used to delete the row, so there were exactly two states a review
 * could be in and the screen hard-coded that: the per-row buttons rendered only
 * when `status` was `pending`, and the filter offered one alternative. Now
 * `REJECTED` is a state a row KEEPS, which makes three queues — and each of them
 * has a different useful action. Offering approve/reject everywhere would be as
 * wrong as offering neither: «Схвалити» on a row that is already approved does
 * nothing an operator can see, and there is no such thing as re-rejecting.
 */
describe("AdminReviewTable — the three moderation queues (TASK-446)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  function stubQueue(rows = [makeReviewRow()]) {
    const params: URLSearchParams[] = [];
    server.use(
      http.get("*/api/admin/reviews", ({ request }) => {
        params.push(new URL(request.url).searchParams);
        return listResponse(rows);
      }),
    );
    return params;
  }

  it("offers «Відхилені» as a third status option", async () => {
    stubQueue();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(
      screen.getByRole("combobox", { name: dict.reviews.filterStatusAria }),
    );

    expect(
      await screen.findByRole("option", { name: dict.reviews.filterRejected }),
    ).toBeInTheDocument();
  });

  it("asks the API for the rejected queue and offers only «Схвалити» on it", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=rejected");
    const params = stubQueue([makeReviewRow({ textStatus: "REJECTED" })]);

    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    // The enum has three values now — an unrecognised one must not silently fall
    // back to `pending`, which would show the operator a different queue than the
    // one the URL (and the chip) says they are looking at.
    expect(params[0].get("status")).toBe("rejected");

    expect(
      screen.getByRole("button", { name: dict.reviews.approve }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.reviews.reject }),
    ).not.toBeInTheDocument();
  });

  it("offers only «Відхилити текст» on the approved queue", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=approved");
    stubQueue([makeReviewRow({ textStatus: "APPROVED" })]);

    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      screen.getByRole("button", { name: dict.reviews.reject }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.reviews.approve }),
    ).not.toBeInTheDocument();
  });

  it("approves from the rejected queue — a moderator changing their mind", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=rejected");
    const user = userEvent.setup();
    let approved: string | null = null;
    stubQueue([makeReviewRow({ textStatus: "REJECTED" })]);
    server.use(
      http.patch("*/api/admin/reviews/:id/approve", ({ params }) => {
        approved = params.id as string;
        return HttpResponse.json({
          data: makeReviewRow({ textStatus: "APPROVED" }),
        });
      }),
    );

    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(
      screen.getByRole("button", { name: dict.reviews.approve }),
    );

    await waitFor(() => expect(approved).toBe("review-uuid-1"));
  });

  /**
   * `ratingVisible` folds two independent gates — a moderator's hide and an
   * unconfirmed email — so the row reports the EFFECT rather than guessing at
   * the cause. Without it a moderator reads a 1★ row and assumes it is dragging
   * the product's average down when it may not be counting at all.
   */
  it("says when a rating is not counting toward the average", async () => {
    stubQueue([makeReviewRow({ ratingVisible: false })]);

    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByText(dict.reviews.ratingNotCounted)).toBeInTheDocument();
  });
});

/**
 * TASK-446 — the shop's public reply, gated on the BRAND-NEW `reviews:write`.
 */
describe("AdminReviewTable — replying to a review (TASK-446)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  function stubQueue(rows = [makeReviewRow()]) {
    server.use(http.get("*/api/admin/reviews", () => listResponse(rows)));
  }

  /**
   * `reviews:write` has no backfill, so on a fresh deploy nobody but the owner
   * holds it. A manager seeing no reply button is CORRECT — the alternative is a
   * button whose only possible outcome is a 403 from the route guard.
   */
  it("hides the reply action from a moderator without reviews:write", async () => {
    stubQueue();
    renderTable({ permissions: [PERM.reviewsModerate] });
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      screen.queryByRole("button", { name: dict.reviews.replyAction }),
    ).not.toBeInTheDocument();
  });

  it("offers the reply action once reviews:write is granted", async () => {
    stubQueue();
    renderTable({ permissions: [PERM.reviewsModerate, PERM.reviewsWrite] });
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      screen.getByRole("button", { name: dict.reviews.replyAction }),
    ).toBeInTheDocument();
  });

  /**
   * The reply is an UPSERT: posting again replaces what is there. A row that
   * already carries one has to say so in the queue, or the operator answers a
   * review that was answered last week and silently overwrites a colleague.
   */
  it("marks the rows the shop has already answered", async () => {
    stubQueue([
      makeReviewRow({
        reply: { body: "Дякуємо!", createdAt: "2026-06-02T10:00:00.000Z" },
      }),
      makeReviewRow({
        id: "review-uuid-2",
        productName: "Screen Protector",
        reply: null,
      }),
    ]);

    renderTable({ permissions: [PERM.reviewsModerate, PERM.reviewsWrite] });
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getAllByText(dict.reviews.replyBadge)).toHaveLength(1);
    // And the action reads as an EDIT rather than inviting a fresh answer.
    expect(
      screen.getByRole("button", { name: dict.reviews.replyEditAction }),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-446 — withdrawing one account's whole contribution.
 *
 * The only action on this screen whose blast radius is not the row it sits in:
 * every rating and every text that account ever left, on every product, in one
 * click. So it asks first, and asks in those words.
 */
describe("AdminReviewTable — hiding an author (TASK-446)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  function stubQueue(rows = [makeReviewRow()]) {
    server.use(http.get("*/api/admin/reviews", () => listResponse(rows)));
  }

  it("hides the action from a manager without reviews:moderate", async () => {
    stubQueue();
    renderTable({ permissions: [] });
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      screen.queryByRole("button", { name: dict.reviews.hideAuthorAction }),
    ).not.toBeInTheDocument();
  });

  it("confirms before withdrawing the author's whole contribution", async () => {
    const user = userEvent.setup();
    let hiddenUserId: string | null = null;
    stubQueue();
    server.use(
      http.post("*/api/admin/reviews/authors/:userId/hide", ({ params }) => {
        hiddenUserId = params.userId as string;
        return HttpResponse.json({ data: { updatedCount: 3 } });
      }),
    );

    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(
      screen.getByRole("button", { name: dict.reviews.hideAuthorAction }),
    );

    // The dialog is open and nothing has been sent yet — a single mis-click must
    // not take an account's entire history off the site.
    expect(
      await screen.findByText(dict.reviews.hideAuthorTitle),
    ).toBeInTheDocument();
    expect(hiddenUserId).toBeNull();

    await user.click(
      screen.getByRole("button", { name: dict.reviews.hideAuthorConfirm }),
    );

    await waitFor(() => expect(hiddenUserId).toBe("user-uuid-1"));
  });

  it("offers the inverse once the author's ratings are not counting", async () => {
    const user = userEvent.setup();
    let restoredUserId: string | null = null;
    stubQueue([makeReviewRow({ ratingVisible: false })]);
    server.use(
      http.post("*/api/admin/reviews/authors/:userId/unhide", ({ params }) => {
        restoredUserId = params.userId as string;
        return HttpResponse.json({ data: { updatedCount: 3 } });
      }),
    );

    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await user.click(
      screen.getByRole("button", { name: dict.reviews.unhideAuthorAction }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: dict.reviews.unhideAuthorConfirm,
      }),
    );

    await waitFor(() => expect(restoredUserId).toBe("user-uuid-1"));
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
    renderTable();
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

    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(params[0].get("search")).toBe("case");
    expect(params[0].get("limit")).toBe("20");
  });

  it("names the term in the empty state instead of «черга порожня»", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=ghost");
    stubReviews([]);

    renderTable();

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
    renderTable();
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
