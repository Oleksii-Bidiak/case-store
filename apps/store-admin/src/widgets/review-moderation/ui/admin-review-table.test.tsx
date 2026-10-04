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
import { countLabel } from "@/shared/lib";
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

const d = dict.reviews;
const r = dict.common.registry;

/**
 * The table hosts permission-gated row actions (TASK-446), so every case
 * renders under a session. A MANAGER rather than the owner by default, and the
 * grants come from `PERM` rather than hand-typed literals: `can()` takes a
 * plain `string`, so a literal that drifts from the constant would silently
 * stop matching what the row asks for and the gate tests would pass for free.
 *
 * `reviews:write` is deliberately NOT in the default grant — it has no
 * backfill, and the reply being absent is what a fresh deploy actually has.
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
    textStatus: "PENDING",
    ratingVisible: true,
    hiddenAt: null as string | null,
    hiddenReason: null as string | null,
    createdIp: null as string | null,
    reply: null as { body: string; createdAt: string } | null,
    createdAt: "2026-06-01T10:00:00.000Z",
    userEmail: "olena@example.com",
    productName: "iPhone 15 Pro Case",
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

/**
 * Stubs the list. The quick views ask for their counters as one-row pages
 * (`limit=1`); those are answered from `counts` (keyed `status|visibility`)
 * and kept out of the returned params, which are the TABLE's requests only.
 */
function stubReviews(
  rows: unknown[] = [makeReviewRow()],
  counts: Record<string, number> = {},
) {
  const params: URLSearchParams[] = [];
  server.use(
    http.get("*/api/admin/reviews", ({ request }) => {
      const query = new URL(request.url).searchParams;
      if (query.get("limit") === "1") {
        const key = `${query.get("status")}|${query.get("visibility") ?? ""}`;
        return HttpResponse.json({
          data: [],
          meta: { total: counts[key] ?? 0, page: 1, limit: 1, totalPages: 1 },
        });
      }
      params.push(query);
      return listResponse(rows);
    }),
  );
  return params;
}

const rowLabel = (product = "iPhone 15 Pro Case", author = "olena") =>
  d.rowAria(product, author);

async function openRowMenu(product?: string, author?: string) {
  await userEvent.click(
    await screen.findByRole("button", {
      name: r.rowActionsAria(rowLabel(product, author)),
    }),
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParamsRef.current = new URLSearchParams("");
});

describe("AdminReviewTable — rows (ReviewsProposal В1)", () => {
  it("renders product, full author email, purchase mark, stars and comment", async () => {
    stubReviews([
      makeReviewRow(),
      makeReviewRow({
        id: "review-uuid-2",
        userEmail: "ivan@example.com",
        productName: "Screen Protector",
        verifiedPurchase: false,
      }),
    ]);

    renderTable();

    expect(await screen.findByText("iPhone 15 Pro Case")).toBeInTheDocument();
    expect(screen.getByText("Screen Protector")).toBeInTheDocument();
    expect(screen.getByText("olena@example.com")).toBeInTheDocument();
    expect(screen.getByText("ivan@example.com")).toBeInTheDocument();
    expect(screen.getByText(d.bought)).toBeInTheDocument();
    expect(screen.getByText(d.notBought)).toBeInTheDocument();
    expect(screen.getAllByLabelText(d.ratingAria(5))).toHaveLength(2);
  });

  /**
   * TASK-430 — several positions share one display name (the same case in four
   * colours), so the SKU rides with the name, and the name links to the card.
   */
  it("shows the SKU under the product and links it to its read-only card", async () => {
    stubReviews();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByText("CASE-IP15P-BLK")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: d.productLinkAria("iPhone 15 Pro Case"),
    });
    expect(link).toHaveAttribute("href", "/products/product-uuid-1");
  });

  it("says «без артикулу» rather than leaving the SKU blank", async () => {
    stubReviews([makeReviewRow({ productSku: null })]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByText(d.noSku)).toBeInTheDocument();
  });

  /** TASK-734's sibling here: a long comment must not push the row apart. */
  it("clamps the comment to two lines inside its column", async () => {
    const long = "Дуже довгий відгук. ".repeat(40).trim();
    stubReviews([makeReviewRow({ comment: long })]);
    renderTable();

    const comment = await screen.findByText(long);
    expect(comment).toHaveClass("line-clamp-2");
    expect(comment).toHaveAttribute("title", long);
  });

  it.each([
    ["PENDING", d.statusPending],
    ["APPROVED", d.statusApproved],
    ["REJECTED", d.statusRejected],
  ])("badges the text verdict in the row (%s)", async (status, label) => {
    mockSearchParamsRef.current = new URLSearchParams("status=all");
    stubReviews([makeReviewRow({ textStatus: status })]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      within(screen.getByRole("table")).getByText(label),
    ).toBeInTheDocument();
  });

  it("says «Лише оцінка, без тексту» for a rating with no text, and offers no verdict", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=all");
    stubReviews([makeReviewRow({ comment: null, textStatus: "APPROVED" })]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByText(d.noComment)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.approve }),
    ).not.toBeInTheDocument();
    await openRowMenu();
    expect(
      screen.queryByRole("menuitem", { name: d.reject }),
    ).not.toBeInTheDocument();
  });

  /** The old effect-only line stays for the one gate it is true for. */
  it("says when a rating is not counting toward the average", async () => {
    stubReviews([makeReviewRow({ ratingVisible: false })]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByText(d.ratingNotCounted)).toBeInTheDocument();
  });

  it.each([
    ["MODERATOR", d.hiddenByModerator],
    ["BAN", d.hiddenByBan],
    ["DELETED", d.hiddenByDeletion],
  ])(
    "badges a withdrawn row «Приховано» and names the reason (%s)",
    async (reason, label) => {
      stubReviews([
        makeReviewRow({
          ratingVisible: false,
          hiddenAt: "2026-09-20T10:00:00.000Z",
          hiddenReason: reason,
        }),
      ]);
      renderTable();
      await screen.findByText("iPhone 15 Pro Case");

      expect(screen.getByText(d.statusHidden)).toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByText(d.ratingNotCounted)).not.toBeInTheDocument();
    },
  );

  /**
   * The reply is an UPSERT — a second answer replaces the first. A row that
   * already carries one says so, or a colleague's answer is overwritten unseen.
   */
  it("marks the rows the shop has already answered", async () => {
    stubReviews([
      makeReviewRow({
        reply: { body: "Дякуємо!", createdAt: "2026-06-02T10:00:00.000Z" },
      }),
      makeReviewRow({ id: "review-uuid-2", productName: "Screen Protector" }),
    ]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getAllByText(d.replyBadge)).toHaveLength(1);
  });
});

describe("AdminReviewTable — row actions (В1/В2)", () => {
  it("approves from the row's primary button", async () => {
    let approved: string | null = null;
    stubReviews();
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

    await userEvent.click(screen.getByRole("button", { name: d.approve }));

    await waitFor(() => expect(approved).toBe("review-uuid-1"));
  });

  /**
   * TASK-446 — reject is `PATCH …/:id/reject`, never the old hard DELETE.
   * It moved into «⋯» (В2); the request is the same.
   */
  it("rejects the text from «⋯» with a PATCH to /reject, never a DELETE", async () => {
    let rejected: string | null = null;
    let deleted = false;
    stubReviews();
    server.use(
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

    await openRowMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.reject }),
    );

    await waitFor(() => expect(rejected).toBe("review-uuid-1"));
    expect(deleted).toBe(false);
  });

  it("offers only «Схвалити» on a rejected row — a moderator changing their mind", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=rejected");
    stubReviews([makeReviewRow({ textStatus: "REJECTED" })]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByRole("button", { name: d.approve })).toBeInTheDocument();
    await openRowMenu();
    expect(
      screen.queryByRole("menuitem", { name: d.reject }),
    ).not.toBeInTheDocument();
  });

  it("offers only «Відхилити текст» on an approved row", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=approved");
    stubReviews([makeReviewRow({ textStatus: "APPROVED" })]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      screen.queryByRole("button", { name: d.approve }),
    ).not.toBeInTheDocument();
    await openRowMenu();
    expect(
      await screen.findByRole("menuitem", { name: d.reject }),
    ).toBeInTheDocument();
  });

  /** `reviews:write` has no backfill — a manager seeing no reply is CORRECT. */
  it("offers no reply without reviews:write", async () => {
    stubReviews();
    renderTable({ permissions: [PERM.reviewsModerate] });
    await screen.findByText("iPhone 15 Pro Case");

    await openRowMenu();
    await screen.findByRole("menuitem", { name: d.reject });
    expect(
      screen.queryByRole("menuitem", { name: d.replyAction }),
    ).not.toBeInTheDocument();
  });

  it("opens the reply dialog from «⋯» with reviews:write, as an edit when answered", async () => {
    stubReviews([
      makeReviewRow({
        reply: { body: "Дякуємо!", createdAt: "2026-06-02T10:00:00.000Z" },
      }),
    ]);
    renderTable({ permissions: [PERM.reviewsModerate, PERM.reviewsWrite] });
    await screen.findByText("iPhone 15 Pro Case");

    await openRowMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.replyEditAction }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(d.replyTitle)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(d.replyLabel)).toHaveValue("Дякуємо!");
  });

  it("hides no author without reviews:moderate", async () => {
    stubReviews();
    renderTable({ permissions: [] });
    await screen.findByText("iPhone 15 Pro Case");

    await openRowMenu();
    await screen.findByRole("menuitem", { name: d.reject });
    expect(
      screen.queryByRole("menuitem", { name: d.hideAuthorMenu }),
    ).not.toBeInTheDocument();
  });

  /**
   * TASK-446 / В7 — the one action whose blast radius is not the row. A
   * destructive menu item now (not an outline button), and it still asks.
   */
  it("withdraws the author's whole contribution from a destructive menu item, after asking", async () => {
    let hiddenUserId: string | null = null;
    stubReviews();
    server.use(
      http.post("*/api/admin/reviews/authors/:userId/hide", ({ params }) => {
        hiddenUserId = params.userId as string;
        return HttpResponse.json({ data: { updatedCount: 3 } });
      }),
    );
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await openRowMenu();
    const item = await screen.findByRole("menuitem", {
      name: d.hideAuthorMenu,
    });
    expect(item).toHaveAttribute("data-variant", "destructive");
    await userEvent.click(item);

    expect(await screen.findByText(d.hideAuthorTitle)).toBeInTheDocument();
    expect(screen.getByText(d.hideAuthorDescription("olena"))).toBeVisible();
    expect(hiddenUserId).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: d.hideAuthorConfirm }),
    );
    await waitFor(() => expect(hiddenUserId).toBe("user-uuid-1"));
  });

  it("offers «повернути» for a moderator's hide (TASK-1004)", async () => {
    let restoredUserId: string | null = null;
    mockSearchParamsRef.current = new URLSearchParams(
      "status=all&visibility=hidden",
    );
    stubReviews([
      makeReviewRow({
        ratingVisible: false,
        hiddenAt: "2026-09-20T10:00:00.000Z",
        hiddenReason: "MODERATOR",
      }),
    ]);
    server.use(
      http.post("*/api/admin/reviews/authors/:userId/unhide", ({ params }) => {
        restoredUserId = params.userId as string;
        return HttpResponse.json({ data: { updatedCount: 3 } });
      }),
    );
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await openRowMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.unhideAuthorMenu }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: d.unhideAuthorConfirm }),
    );

    await waitFor(() => expect(restoredUserId).toBe("user-uuid-1"));
  });

  it.each(["BAN", "DELETED"])(
    "offers no author item while the account itself holds the rows (%s)",
    async (reason) => {
      stubReviews([
        makeReviewRow({
          ratingVisible: false,
          hiddenAt: "2026-09-20T10:00:00.000Z",
          hiddenReason: reason,
        }),
      ]);
      renderTable();
      await screen.findByText("iPhone 15 Pro Case");

      await openRowMenu();
      await screen.findByRole("menuitem", { name: d.reject });
      expect(
        screen.queryByRole("menuitem", { name: d.unhideAuthorMenu }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: d.hideAuthorMenu }),
      ).not.toBeInTheDocument();
    },
  );
});

describe("AdminReviewTable — quick views (В1, В3, В4)", () => {
  const tab = (name: string) =>
    screen.getByRole("tab", { name: new RegExp(`^${name}`) });

  it("replaces the two selects with views, «На розгляді» active by default", async () => {
    const params = stubReviews();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    for (const label of [
      d.filterPending,
      d.filterApproved,
      d.filterRejected,
      d.viewHiddenAuthors,
      d.filterAll,
    ]) {
      expect(tab(label)).toBeInTheDocument();
    }
    expect(tab(d.filterPending)).toHaveAttribute("aria-selected", "true");
    expect(params[0].get("status")).toBe("pending");
    expect(params[0].get("visibility")).toBe("visible");
    expect(
      screen.queryByRole("combobox", { name: d.filterStatusAria }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: d.filterVisibilityAria }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [d.filterApproved, "/reviews?status=approved"],
    [d.filterRejected, "/reviews?status=rejected"],
    [d.viewHiddenAuthors, "/reviews?status=all&visibility=hidden"],
    [d.filterAll, "/reviews?status=all&visibility=all"],
  ])("«%s» writes the old URL params (%s)", async (label, url) => {
    stubReviews();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(tab(label));
    expect(mockReplace).toHaveBeenCalledWith(url);
  });

  it("«На розгляді» returns to the clean URL", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "status=rejected&page=3&search=olena",
    );
    stubReviews([makeReviewRow({ textStatus: "REJECTED" })]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(tab(d.filterPending));
    expect(mockReplace).toHaveBeenCalledWith("/reviews?search=olena");
  });

  it.each([
    ["status=approved", d.filterApproved],
    ["status=rejected", d.filterRejected],
    ["visibility=hidden&status=all", d.viewHiddenAuthors],
    ["status=all&visibility=all", d.filterAll],
    ["status=foo", d.filterPending],
  ])(
    "highlights the view a deep link stands for (%s)",
    async (query, label) => {
      mockSearchParamsRef.current = new URLSearchParams(query);
      stubReviews();
      renderTable();
      await screen.findByText("iPhone 15 Pro Case");

      expect(tab(label)).toHaveAttribute("aria-selected", "true");
    },
  );

  it("counts each view from the API's own totals", async () => {
    stubReviews([makeReviewRow()], {
      "pending|": 6,
      "approved|": 128,
      "rejected|": 9,
      "all|hidden": 2,
      "all|all": 145,
    });
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await waitFor(() => expect(tab(d.filterApproved)).toHaveTextContent("128"));
    expect(tab(d.filterPending)).toHaveTextContent("6");
    expect(tab(d.filterRejected)).toHaveTextContent("9");
    expect(tab(d.viewHiddenAuthors)).toHaveTextContent("2");
    expect(tab(d.filterAll)).toHaveTextContent("145");
  });

  it("forwards ?visibility=hidden so the restore item becomes reachable", async () => {
    mockSearchParamsRef.current = new URLSearchParams("visibility=hidden");
    const params = stubReviews([
      makeReviewRow({
        ratingVisible: false,
        hiddenAt: "2026-09-20T10:00:00.000Z",
        hiddenReason: "MODERATOR",
      }),
    ]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(params[0].get("visibility")).toBe("hidden");
    // No view is «pending of hidden authors» — the chip names it instead.
    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipAuthors(d.filterVisibilityHidden)),
      }),
    ).toBeInTheDocument();
  });

  it("shows the per-view empty text — «Усе розглянуто» on the pending queue", async () => {
    stubReviews([]);
    renderTable();

    expect(await screen.findByText(d.emptyPendingTitle)).toBeInTheDocument();
    expect(screen.getByText(d.emptyPending)).toBeInTheDocument();
  });

  it.each([
    ["status=approved", d.emptyApproved],
    ["status=rejected", d.emptyRejected],
    ["status=all&visibility=hidden", d.emptyHiddenAuthors],
    ["status=all&visibility=all", d.emptyAll],
  ])("shows the per-view empty text (%s)", async (query, text) => {
    mockSearchParamsRef.current = new URLSearchParams(query);
    stubReviews([]);
    renderTable();

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("names the search term when a search empties the list", async () => {
    mockSearchParamsRef.current = new URLSearchParams("search=ghost");
    stubReviews([]);
    renderTable();

    expect(await screen.findByText(r.noResults("ghost"))).toBeInTheDocument();
  });
});

describe("AdminReviewTable — filter sheet keeps every old combination", () => {
  it("applies a text verdict and an author slice no view covers", async () => {
    stubReviews();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${r.filters}`) }),
    );
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filterApproved }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filterVisibilityHidden }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: d.filtersApply }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/reviews?status=approved&visibility=hidden",
    );
  });

  it("names a combination no view stands for as chips, and clears it", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "status=approved&visibility=hidden&search=olena&page=2",
    );
    stubReviews([makeReviewRow({ textStatus: "APPROVED" })]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      screen.getByRole("button", {
        name: r.removeChipAria(d.chipStatus(d.filterApproved)),
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: r.clearAll }));
    // Every chip goes, and the page with them; the search term is not a chip.
    expect(mockReplace).toHaveBeenCalledWith("/reviews?search=olena");
  });
});

/**
 * TASK-1004 / В3 — «Сигнали накрутки». The dashboard's rating-abuse card links
 * here with `productId` or `createdIp`; that narrowing IS the view, with an
 * explanation card and a removable chip.
 */
describe("AdminReviewTable — «Сигнали накрутки» (В3)", () => {
  function stubSignals(productIds: string[], createdIps: string[] = []) {
    server.use(
      http.get("*/api/admin/dashboard/needs-action", () =>
        HttpResponse.json({
          data: {
            newOrders: 0,
            pendingReviews: 0,
            unpaidInTransit: 0,
            failedMails: 0,
            pendingOver48h: 0,
            ratingAbuse: productIds.length + createdIps.length,
            ratingAbuseSignals: { productIds, createdIps },
            unavailableItems: 0,
            paidAfterCancel: 0,
          },
        }),
      ),
    );
  }

  const series = [
    makeReviewRow({
      id: "s1",
      rating: 1,
      comment: null,
      verifiedPurchase: false,
      textStatus: "APPROVED",
      createdAt: "2026-09-26T09:00:00.000Z",
      userEmail: "oleh@example.com",
    }),
    makeReviewRow({
      id: "s2",
      rating: 1,
      comment: null,
      verifiedPurchase: false,
      textStatus: "APPROVED",
      createdAt: "2026-09-26T10:00:00.000Z",
      userEmail: "max@example.com",
    }),
    makeReviewRow({
      id: "s3",
      rating: 1,
      comment: "Зламався через день.",
      verifiedPurchase: false,
      createdAt: "2026-09-26T11:00:00.000Z",
      userEmail: "ira@example.com",
    }),
    makeReviewRow({
      id: "s4",
      rating: 2,
      comment: null,
      verifiedPurchase: true,
      textStatus: "APPROVED",
      createdAt: "2026-09-25T10:00:00.000Z",
      userEmail: "andrii@example.com",
    }),
  ];

  it("narrows to the product from a dashboard link and explains the series", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "status=all&productId=product-uuid-1",
    );
    const params = stubReviews(series);
    renderTable();
    await screen.findAllByText("iPhone 15 Pro Case");

    expect(params[0].get("productId")).toBe("product-uuid-1");
    expect(
      screen.getByRole("tab", { name: new RegExp(`^${d.viewAbuse}`) }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText(
        d.abuseTitleProduct(
          countLabel(4, d.abuseLowRatingForms),
          countLabel(2, d.dayForms),
          "iPhone 15 Pro Case",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${d.abuseSuspects(2, 4)} ${d.abuseAdvice}`),
    ).toBeInTheDocument();
  });

  it("names and clears the product chip", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "status=all&productId=product-uuid-1",
    );
    stubReviews();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(
      screen.getByRole("button", {
        name: r.removeChipAria(d.productChip("iPhone 15 Pro Case")),
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/reviews?status=all");
  });

  it("narrows to an address and clears it, resetting the page", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "status=all&createdIp=203.0.113.7&page=2",
    );
    const params = stubReviews();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(params[0].get("createdIp")).toBe("203.0.113.7");
    await userEvent.click(
      screen.getByRole("button", {
        name: r.removeChipAria(d.ipChip("203.0.113.7")),
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/reviews?status=all");
  });

  it("names the product by its id while the series is empty", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "productId=product-uuid-9",
    );
    stubReviews([]);
    renderTable();

    expect(
      await screen.findByRole("button", {
        name: r.removeChipAria(d.productChip("product-uuid-9")),
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText(d.emptyAbuse)).toBeInTheDocument();
  });

  it("is offered with its count when the dashboard flags a series, and opens the first", async () => {
    stubSignals(["product-uuid-7"], ["198.51.100.4"]);
    stubReviews();
    renderTable({ permissions: [PERM.reviewsModerate, PERM.analyticsRead] });
    await screen.findByText("iPhone 15 Pro Case");

    const abuse = await screen.findByRole("tab", {
      name: new RegExp(`^${d.viewAbuse}`),
    });
    expect(abuse).toHaveTextContent("2");
    await userEvent.click(abuse);
    expect(mockReplace).toHaveBeenCalledWith(
      "/reviews?status=all&productId=product-uuid-7",
    );
  });

  it("steps to the next flagged series", async () => {
    mockSearchParamsRef.current = new URLSearchParams(
      "status=all&productId=product-uuid-7",
    );
    stubSignals(["product-uuid-7"], ["198.51.100.4"]);
    stubReviews(series);
    renderTable({ permissions: [PERM.reviewsModerate, PERM.analyticsRead] });

    await userEvent.click(
      await screen.findByRole("button", { name: d.abuseNext(2, 2) }),
    );
    expect(mockReplace).toHaveBeenCalledWith(
      "/reviews?status=all&createdIp=198.51.100.4",
    );
  });

  it("is not offered when nothing is flagged and nothing is narrowed", async () => {
    stubReviews();
    renderTable({ permissions: [PERM.reviewsModerate, PERM.analyticsRead] });
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      screen.queryByRole("tab", { name: new RegExp(`^${d.viewAbuse}`) }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Bulk moderation (TASK-356, В2/В6). The bar is ALWAYS on the pending queue —
 * a dashed hint while idle — and both verdicts ask first.
 */
describe("AdminReviewTable — bulk bar (В2, В6)", () => {
  it("keeps the idle hint on the pending queue and counts the selection", async () => {
    stubReviews();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByText(d.bulk.idleHint)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("checkbox", { name: r.selectRowAria(rowLabel()) }),
    );
    expect(
      screen.getByText(r.bulkSelected(countLabel(1, d.itemForms))),
    ).toBeInTheDocument();
  });

  it("asks before the bulk approve, then sends it", async () => {
    const bodies: unknown[] = [];
    stubReviews();
    server.use(
      http.patch("*/api/admin/reviews/moderate", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(
      screen.getByRole("checkbox", { name: r.selectRowAria(rowLabel()) }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: d.bulk.approve(1) }),
    );
    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent(
      d.bulk.approveConfirmTitle(countLabel(1, d.itemForms)),
    );
    expect(bodies).toHaveLength(0);

    await userEvent.click(
      within(prompt).getByRole("button", {
        name: d.bulk.approveConfirmLabel(1),
      }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["review-uuid-1"], action: "approve" });
  });

  it("offers no selection on the settled views", async () => {
    mockSearchParamsRef.current = new URLSearchParams("status=approved");
    stubReviews([makeReviewRow({ textStatus: "APPROVED" })]);
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(d.bulk.idleHint)).not.toBeInTheDocument();
  });
});

/** TASK-423 — search over text, author and product. */
describe("AdminReviewTable — search and page size (TASK-423)", () => {
  it("debounces the typed term into the URL", async () => {
    stubReviews();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.type(screen.getByLabelText(d.searchAria), "чохол");

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
});
