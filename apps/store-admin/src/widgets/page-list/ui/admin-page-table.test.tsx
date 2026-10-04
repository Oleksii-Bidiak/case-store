/**
 * `AdminPageTable` — the sortable static-page registry (TASK-153; reordering in
 * TASK-428; the registry chrome of wave 198, PagesProposal СР1–СР7).
 *
 * KEYBOARD-ONLY moves, by design: jsdom has no layout, so dnd-kit's collision detection
 * cannot run. Pointer correctness rests on the pointer path sharing ONE `applyMove()`
 * reducer with the keyboard path (pinned in `shared/lib/sortable-tree`).
 */

import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import { AdminPageTable } from "./admin-page-table";
import {
  PAGE_COLUMNS_WIDTH_BUDGET,
  buildPageColumns,
} from "./page-registry-columns";

// jsdom mounts no app router; the registry reads `?kind=` / `?status=` and
// writes them back, and a row click navigates.
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/pages",
  useSearchParams: () => mockSearchParams,
}));

const d = dict.pages;
const r = dict.common.registry;

/* ─────────────────────────────── fixtures ──────────────────────────────── */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // Privacy Policy (published)
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // FAQ (draft)
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // Delivery (published)

const TITLES: Record<string, string> = {
  [A]: "Privacy Policy",
  [B]: "FAQ",
  [C]: "Delivery",
};
const SLUGS: Record<string, string> = {
  [A]: "privacy-policy",
  [B]: "faq",
  [C]: "delivery",
};
/** TASK-435 kinds. HUB is deliberately unused — an empty view is a case. */
const KINDS: Record<string, "LEGAL" | "INFO" | "HUB"> = {
  [A]: "LEGAL",
  [B]: "LEGAL",
  [C]: "INFO",
};

const DEFAULT_ORDER = [A, B, C];

function listResponse(order: string[] = DEFAULT_ORDER) {
  return {
    data: order.map((id, i) => ({
      id,
      slug: SLUGS[id],
      kind: KINDS[id] as "LEGAL" | "INFO" | "HUB",
      title: TITLES[id],
      content: "<p>Body</p>",
      excerpt: null,
      metaTitle: null,
      metaDescription: null,
      status: (id === B ? "DRAFT" : "PUBLISHED") as string,
      publishedAt: id === B ? null : "2026-06-01T10:00:00.000Z",
      // Widened: the TASK-430 scheduled-badge tests override this with a date.
      scheduledAt: null as string | null,
      isActive: id !== B,
      sortOrder: i,
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-01T10:00:00.000Z",
    })),
    meta: { total: order.length, page: 1, limit: order.length, totalPages: 1 },
  };
}

/** Every PATCH body the widget sent, in order. */
let bodies: unknown[] = [];
/** GET count — the "resyncs from the response alone" assertion reads it. */
let listCalls = 0;

/** The endpoint returns the FULL refreshed list, exactly as the real one does. */
function mockReorder(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json(listResponse([B, A, C])),
) {
  server.use(
    http.get("*/api/admin/pages", () => {
      listCalls += 1;
      return HttpResponse.json(listResponse());
    }),
    http.patch("*/api/admin/pages/reorder", async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
}

beforeEach(() => {
  resetReorderLock();
  bodies = [];
  listCalls = 0;
  mockReplace.mockClear();
  mockPush.mockClear();
  mockSearchParams = new URLSearchParams("");
});

/* ─────────────────────────────── DOM helpers ───────────────────────────── */

const rowEl = (id: string): HTMLTableRowElement => {
  const el = document.getElementById(`page-row-${id}`);
  if (!el) throw new Error(`row ${TITLES[id] ?? id} is not rendered`);
  return el as HTMLTableRowElement;
};

const rowIds = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLTableRowElement>("tr[id^='page-row-']"),
  ).map((row) => row.id.replace("page-row-", ""));

const polite = () => screen.getByTestId("tree-live-polite").textContent ?? "";
const assertive = () =>
  screen.getByTestId("tree-live-assertive").textContent ?? "";

/** Owner by default; pass permissions for a manager. */
function renderTable(options: { permissions?: string[] } = {}) {
  return renderWithProviders(
    options.permissions ? (
      <WithAuth permissions={options.permissions}>
        <AdminPageTable />
      </WithAuth>
    ) : (
      <WithAuth isOwner>
        <AdminPageTable />
      </WithAuth>
    ),
  );
}

async function renderGrid(options: { permissions?: string[] } = {}) {
  const result = renderTable(options);
  await screen.findByRole("grid", { name: d.gridLabel });
  await waitFor(() => expect(rowIds()).toHaveLength(3));
  return result;
}

/** Keyboard: pick up, move up one slot, drop. */
function keyboardMoveUp(id: string) {
  rowEl(id).focus();
  fireEvent.keyDown(rowEl(id), { key: " " });
  fireEvent.keyDown(rowEl(id), { key: "ArrowUp" });
  fireEvent.keyDown(rowEl(id), { key: " " });
}

const searchBox = () => screen.getByRole("searchbox", { name: d.searchLabel });

async function openRowMenu(id: string) {
  await userEvent.click(
    within(rowEl(id)).getByRole("button", {
      name: d.rowActionsAria(TITLES[id]),
    }),
  );
  return screen.findByRole("menu");
}

const view = (label: string) =>
  screen.getByRole("tab", { name: new RegExp(`^${label}`) });

/* ──────────────────────────────── the suite ────────────────────────────── */

describe("AdminPageTable — header (СР1)", () => {
  it("shows the heading and «Додати сторінку» for pages:write", async () => {
    mockReorder();
    await renderGrid();

    expect(
      screen.getByRole("heading", { level: 2, name: d.heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: d.add })).toHaveAttribute(
      "href",
      "/pages/new",
    );
  });
});

describe("AdminPageTable — rows (СР1)", () => {
  it("renders the title, the storefront address, the kind and the status badge", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(
      within(rowEl(A)).getByText("/legal/privacy-policy"),
    ).toBeInTheDocument();
    expect(within(rowEl(C)).getByText("/info/delivery")).toBeInTheDocument();
    expect(screen.getAllByText(d.statusPublished)).toHaveLength(2);
    expect(screen.getByText(d.statusDraft)).toBeInTheDocument();
    expect(within(rowEl(A)).getByText(d.kindLegal)).toBeInTheDocument();
    expect(within(rowEl(C)).getByText(d.kindInfo)).toBeInTheDocument();
  });

  it("links the address to the storefront in a new tab — only for a published page", async () => {
    mockReorder();
    await renderGrid();

    const live = within(rowEl(A)).getByRole("link", {
      name: d.openPathAria("/legal/privacy-policy"),
    });
    expect(live).toHaveAttribute(
      "href",
      `${STOREFRONT_URL}/legal/privacy-policy`,
    );
    expect(live).toHaveAttribute("target", "_blank");
    // The draft has no address yet — plain text and a caption saying so.
    expect(
      within(rowEl(B)).queryByRole("link", {
        name: d.openPathAria("/legal/faq"),
      }),
    ).not.toBeInTheDocument();
    expect(within(rowEl(B)).getByText(d.siteDraft)).toBeInTheDocument();
  });

  it("says in plain sight that an inlined INFO row lives on /info (TASK-565)", async () => {
    server.use(
      http.get("*/api/admin/pages", () => {
        const body = listResponse();
        // C becomes the «Про нас» row; A stays a legal document.
        body.data[2] = { ...body.data[2], slug: "about" };
        return HttpResponse.json(body);
      }),
    );
    await renderGrid();

    expect(within(rowEl(C)).getByText("/info")).toBeInTheDocument();
    expect(within(rowEl(C)).getByText(d.siteInlined)).toBeInTheDocument();
    expect(within(rowEl(A)).queryByText(d.siteInlined)).not.toBeInTheDocument();
    expect(screen.getAllByText(d.siteInlined)).toHaveLength(1);
  });

  it("explains a hub row instead of pretending it is a page", async () => {
    server.use(
      http.get("*/api/admin/pages", () => {
        const body = listResponse();
        body.data[2] = { ...body.data[2], kind: "HUB", slug: "promo" };
        return HttpResponse.json(body);
      }),
    );
    await renderGrid();

    expect(within(rowEl(C)).getByText("/promo")).toBeInTheDocument();
    expect(within(rowEl(C)).getByText(d.siteHub)).toBeInTheDocument();
    expect(within(rowEl(C)).getByText(d.kindHub)).toBeInTheDocument();
  });

  it("has NO sort-order column any more — the row order IS the order", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryByText("Порядок")).not.toBeInTheDocument();
  });

  it("links the title to the edit route, and a click on the row opens it", async () => {
    mockReorder();
    await renderGrid();

    expect(
      within(rowEl(A)).getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", `/pages/${A}/edit`);

    await userEvent.click(within(rowEl(A)).getByText(d.kindLegal));
    expect(mockPush).toHaveBeenCalledWith(`/pages/${A}/edit`);
  });

  it("shows the error state when the request fails, keeping refresh reachable", async () => {
    server.use(
      http.get(
        "*/api/admin/pages",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderTable();

    expect(await screen.findByText(d.loadError)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    ).toBeInTheDocument();
  });
});

/**
 * TASK-430 — a page scheduled for Friday was badged «Чернетка». The badge reads
 * `status`, never the `isActive` mirror; since wave 198 it carries the time too.
 */
describe("AdminPageTable — scheduled badge (TASK-430)", () => {
  const AT = "2026-09-19T08:00:00.000Z";

  function stubScheduled(scheduledAt: string | null = AT) {
    server.use(
      http.get("*/api/admin/pages", () => {
        const body = listResponse();
        body.data = body.data.map((page) =>
          page.id === B
            ? { ...page, status: "SCHEDULED", scheduledAt, isActive: false }
            : page,
        );
        return HttpResponse.json(body);
      }),
    );
  }

  it("shows the date and time instead of «Чернетка»", async () => {
    stubScheduled();
    await renderGrid();

    expect(
      screen.getByText(d.statusScheduledOn(formatDateTime(AT))),
    ).toBeInTheDocument();
    expect(
      within(rowEl(B)).getByText(/з’явиться на сайті/),
    ).toBeInTheDocument();
    // The draft label must be GONE — B is the only non-published row.
    expect(screen.queryByText(d.statusDraft)).not.toBeInTheDocument();
  });

  it("falls back to «Заплановано» when the instant is missing", async () => {
    stubScheduled(null);
    await renderGrid();

    expect(screen.getByText(d.statusScheduled)).toBeInTheDocument();
  });

  it("offers «Опублікувати зараз» for a scheduled page", async () => {
    stubScheduled();
    await renderGrid();

    const menu = await openRowMenu(B);
    expect(
      within(menu).getByRole("menuitem", { name: d.publishNow }),
    ).toBeInTheDocument();
  });
});

describe("AdminPageTable — row «⋯» (СР1, СР6)", () => {
  it("keeps edit, open-on-site, unpublish and delete for pages:write", async () => {
    mockReorder();
    await renderGrid();

    const menu = await openRowMenu(A);
    expect(
      within(menu).getByRole("menuitem", { name: dict.common.edit }),
    ).toHaveAttribute("href", `/pages/${A}/edit`);
    expect(
      within(menu).getByRole("menuitem", { name: d.openOnSite }),
    ).toHaveAttribute("href", `${STOREFRONT_URL}/legal/privacy-policy`);
    expect(
      within(menu).getByRole("menuitem", { name: d.unpublish }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: d.deleteItem }),
    ).toBeInTheDocument();
  });

  it("offers «Опублікувати» and no site link on a draft", async () => {
    mockReorder();
    await renderGrid();

    const menu = await openRowMenu(B);
    expect(
      within(menu).getByRole("menuitem", { name: d.publish }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: d.openOnSite }),
    ).not.toBeInTheDocument();
  });

  it("publishes through PATCH /publish", async () => {
    mockReorder();
    let published = "";
    server.use(
      http.patch("*/api/admin/pages/:id/publish", ({ params }) => {
        published = String(params.id);
        return HttpResponse.json({ data: listResponse().data[1] });
      }),
    );
    await renderGrid();

    const menu = await openRowMenu(B);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.publish }),
    );
    await waitFor(() => expect(published).toBe(B));
  });

  it("without pages:write: no «Додати», no handles, «Переглянути» + site link only", async () => {
    mockReorder();
    // A manager holding another content key, not pages:write.
    await renderGrid({ permissions: [PERM.blogWrite] });

    expect(screen.queryByRole("link", { name: d.add })).not.toBeInTheDocument();
    expect(screen.getByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(
      within(rowEl(A)).queryByRole("button", {
        name: dict.reorderList.handleLabel("Privacy Policy"),
      }),
    ).not.toBeInTheDocument();

    const menu = await openRowMenu(A);
    expect(
      within(menu).getByRole("menuitem", { name: dict.common.view }),
    ).toHaveAttribute("href", `/pages/${A}/edit`);
    expect(
      within(menu).getByRole("menuitem", { name: d.openOnSite }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: d.deleteItem }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: d.unpublish }),
    ).not.toBeInTheDocument();
  });
});

// TASK-285 + TASK-812: the delete prompt is an AlertDialog, and it warns about
// the Google index only for a currently-published row.
describe("AdminPageTable — delete (СР5)", () => {
  it("asks in an AlertDialog with the indexed warning for a published page, then deletes", async () => {
    mockReorder();
    let deleted = "";
    server.use(
      http.delete("*/api/admin/pages/:id", ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderGrid();

    const menu = await openRowMenu(A);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.deleteItem }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(d.deleteTitle("Privacy Policy")),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/пошуковому індексі/)).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: d.deleteAction }),
    );
    await waitFor(() => expect(deleted).toBe(A));
  });

  it("omits the indexed warning for a draft, and «Скасувати» deletes nothing", async () => {
    mockReorder();
    let deleted = "";
    server.use(
      http.delete("*/api/admin/pages/:id", ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderGrid();

    const menu = await openRowMenu(B);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: d.deleteItem }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).queryByText(/пошуковому індексі/),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(deleted).toBe("");
  });
});

describe("AdminPageTable — ARIA model", () => {
  it("is a `grid` (never a treegrid) whose rows carry aria-rowindex and a roving tabindex", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryAllByRole("treegrid")).toHaveLength(0);
    expect(rowEl(A)).toHaveAttribute("aria-rowindex", "2");
    expect(rowEl(C)).toHaveAttribute("aria-rowindex", "4");
    expect(screen.getByRole("grid", { name: d.gridLabel })).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(rowIds().filter((id) => rowEl(id).tabIndex === 0)).toHaveLength(1);
  });
});

describe("AdminPageTable — keyboard reorder", () => {
  it("Space ↑ Space sends exactly ONE PATCH with the COMPLETE orderedIds", async () => {
    mockReorder();
    await renderGrid();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.grabbed("FAQ", 2, 3));

    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(polite()).toBe(dict.reorderList.announce.moved("FAQ", 1, 3));
    expect(rowIds()).toEqual([B, A, C]);
    expect(bodies).toHaveLength(0); // nothing committed yet

    fireEvent.keyDown(rowEl(B), { key: " " });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ orderedIds: [B, A, C] });
  });

  it("resyncs the list from the PATCH RESPONSE alone — no refetch", async () => {
    mockReorder();
    await renderGrid();
    const before = listCalls;

    keyboardMoveUp(B);

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(rowIds()).toEqual([B, A, C]));
    expect(listCalls).toBe(before);
  });

  it("the persistent Undo control sends the INVERSE order", async () => {
    mockReorder();
    await renderGrid();

    keyboardMoveUp(B);
    await waitFor(() => expect(bodies).toHaveLength(1));

    const undo = screen.getByRole("button", { name: dict.reorderList.undo });
    await waitFor(() => expect(undo).toHaveAttribute("aria-disabled", "false"));
    fireEvent.click(undo);

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ orderedIds: DEFAULT_ORDER });
    await waitFor(() =>
      expect(polite()).toBe(dict.reorderList.announce.undone),
    );
  });
});

describe("AdminPageTable — server rejections", () => {
  it("409 REORDER_STALE → the «list changed» alert, a reload, and the server order back", async () => {
    mockReorder(() =>
      HttpResponse.json(
        { statusCode: 409, error: "REORDER_STALE", message: "stale" },
        { status: 409 },
      ),
    );
    await renderGrid();
    const before = listCalls;

    keyboardMoveUp(B);

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderList.rejected.REORDER_STALE),
    );
    await waitFor(() => expect(listCalls).toBeGreaterThan(before));
    expect(rowIds()).toEqual(DEFAULT_ORDER);
  });
});

/**
 * The two rules that keep the payload complete: the list is unpaginated, and
 * anything that hides rows (search, view, status) LOCKS reordering.
 */
describe("AdminPageTable — the payload can never be partial", () => {
  it("a search that hides rows LOCKS reordering", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(searchBox(), "FAQ");

    await waitFor(() => expect(rowIds()).toEqual([B]));
    expect(
      screen.getByText(dict.reorderList.searchLockedHint),
    ).toBeInTheDocument();
    expect(
      within(rowEl(B)).getByRole("button", {
        name: dict.reorderList.handleLabel("FAQ"),
      }),
    ).toHaveAttribute("aria-disabled", "true");

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.searchLocked);
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "false");
    expect(bodies).toHaveLength(0);
  });

  it("names what it searches, and matches the address as well as the title", async () => {
    mockReorder();
    await renderGrid();

    expect(searchBox()).toHaveAttribute("placeholder", d.searchPlaceholder);
    await userEvent.type(searchBox(), "privacy-pol");

    await waitFor(() => expect(rowIds()).toEqual([A]));
  });

  it("never asks for a page or a limit, and offers no page controls", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/pages", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderTable();
    await waitFor(() => expect(rowIds()).toHaveLength(3));
    expect(urls).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(urls).toHaveLength(2));
    for (const url of urls) {
      expect(url.searchParams.get("page")).toBeNull();
      expect(url.searchParams.get("limit")).toBeNull();
    }
    expect(
      screen.queryByRole("button", { name: dict.common.next }),
    ).not.toBeInTheDocument();
  });

  it("keeps the search local — it never becomes a query parameter", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/pages", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderTable();
    await waitFor(() => expect(rowIds()).toHaveLength(3));

    await userEvent.type(searchBox(), "FAQ");
    await waitFor(() => expect(rowIds()).toEqual([B]));

    expect(urls).toHaveLength(1);
    expect(urls[0].searchParams.get("search")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("distinguishes an empty search result from an empty table", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(searchBox(), "невідоме");

    expect(
      await screen.findByText(dict.reorderList.emptyMatch("невідоме")),
    ).toBeInTheDocument();
    expect(screen.queryByText(d.empty)).not.toBeInTheDocument();
  });
});

/* ─────────────────── kind views (TASK-435 × TASK-428 × wave 198) ──────── */

describe("AdminPageTable — kind views", () => {
  it("counts every kind from the complete list", async () => {
    mockReorder();
    await renderGrid();

    expect(view(d.tabAll)).toHaveTextContent("3");
    expect(view(d.tabLegal)).toHaveTextContent("2");
    expect(view(d.tabInfo)).toHaveTextContent("1");
    expect(view(d.tabHub)).toHaveTextContent("0");
    // SF-CNT-26 — where each kind lives on the storefront.
    expect(screen.getByText(d.kindNoteAll)).toBeInTheDocument();
  });

  it("writes ?kind= to the URL when a view is picked", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.click(view(d.tabInfo));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockReplace.mock.calls.at(-1)?.[0]).toContain("kind=INFO");
  });

  it("clears ?kind= again on «Усі»", async () => {
    mockSearchParams = new URLSearchParams("kind=INFO");
    mockReorder();
    renderTable();
    await waitFor(() => expect(rowIds()).toEqual([C]));

    await userEvent.click(view(d.tabAll));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockReplace.mock.calls.at(-1)?.[0]).not.toContain("kind=");
  });

  it("filters the rows it already has instead of re-asking the server", async () => {
    mockSearchParams = new URLSearchParams("kind=INFO");
    mockReorder();
    renderTable();

    await waitFor(() => expect(rowIds()).toEqual([C]));
    expect(listCalls).toBe(1);
  });

  it("locks reordering while a kind view is active, and says why", async () => {
    mockSearchParams = new URLSearchParams("kind=LEGAL");
    mockReorder();
    renderTable();
    await waitFor(() => expect(rowIds()).toEqual([A, B]));

    expect(screen.getByText(d.kindLockedHint)).toBeInTheDocument();

    keyboardMoveUp(B);
    expect(rowIds()).toEqual([A, B]);
    expect(bodies).toHaveLength(0);
  });

  it("explains what a hub is on the «Хаби» view, and says it is empty", async () => {
    mockSearchParams = new URLSearchParams("kind=HUB");
    mockReorder();
    renderTable();

    expect(await screen.findByText(d.emptyKind)).toBeInTheDocument();
    expect(screen.getByText(d.kindNoteHub)).toBeInTheDocument();
  });

  it("selects no view for a bogus ?kind= and lists everything", async () => {
    mockSearchParams = new URLSearchParams("kind=NOT_A_KIND");
    mockReorder();
    renderTable();
    await waitFor(() => expect(rowIds()).toEqual([A, B, C]));

    for (const label of [d.tabAll, d.tabLegal, d.tabInfo, d.tabHub]) {
      expect(view(label)).toHaveAttribute("aria-selected", "false");
    }
  });
});

/**
 * TASK-562 — the status filter, LOCAL like the kind views; since wave 198 it
 * lives in «Фільтри» (TASK-1043) with a chip for what is applied.
 */
describe("AdminPageTable — status filter (TASK-562)", () => {
  it("filters the rows it already has by ?status= — never asks the server", async () => {
    const urls: string[] = [];
    mockSearchParams = new URLSearchParams("status=DRAFT");
    mockReorder();
    server.use(
      http.get("*/api/admin/pages", ({ request }) => {
        urls.push(request.url);
        listCalls += 1;
        return HttpResponse.json(listResponse());
      }),
    );
    renderTable();

    await waitFor(() => expect(rowIds()).toEqual([B]));
    expect(listCalls).toBe(1);
    expect(new URL(urls[0]).searchParams.has("status")).toBe(false);
  });

  it("writes ?status= to the URL from the «Фільтри» sheet", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.click(screen.getByRole("button", { name: r.filters }));
    await userEvent.click(
      await screen.findByRole("button", { name: d.statusScheduled }),
    );
    await userEvent.click(screen.getByRole("button", { name: d.filtersApply }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockReplace.mock.calls.at(-1)?.[0]).toContain("status=SCHEDULED");
  });

  it("shows the applied status as a chip that removes it", async () => {
    mockSearchParams = new URLSearchParams("status=PUBLISHED");
    mockReorder();
    renderTable();
    await waitFor(() => expect(rowIds()).toEqual([A, C]));

    await userEvent.click(
      screen.getByRole("button", {
        name: r.removeChipAria(d.filterChip(d.statusPublished)),
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockReplace.mock.calls.at(-1)?.[0]).not.toContain("status=");
  });

  it("locks reordering while a status filter is active, and says why", async () => {
    mockSearchParams = new URLSearchParams("status=PUBLISHED");
    mockReorder();
    renderTable();
    await waitFor(() => expect(rowIds()).toEqual([A, C]));

    expect(screen.getByText(d.statusLockedHint)).toBeInTheDocument();

    keyboardMoveUp(C);
    expect(rowIds()).toEqual([A, C]);
    expect(bodies).toHaveLength(0);
  });

  it("combines with the kind view", async () => {
    mockSearchParams = new URLSearchParams("kind=LEGAL&status=PUBLISHED");
    mockReorder();
    renderTable();

    await waitFor(() => expect(rowIds()).toEqual([A]));
  });

  it("says the FILTER emptied the list, not that no pages exist", async () => {
    mockSearchParams = new URLSearchParams("status=SCHEDULED");
    mockReorder();
    renderTable();

    expect(
      await screen.findByText(dict.common.table.emptyFiltered),
    ).toBeInTheDocument();
    expect(screen.queryByText(d.emptyKind)).toBeNull();
  });

  it("ignores a bogus ?status= — every row listed, drag not locked", async () => {
    mockSearchParams = new URLSearchParams("status=NOT_A_STATUS");
    mockReorder();
    await renderGrid();

    expect(rowIds()).toEqual([A, B, C]);
    expect(screen.getByText(d.reorderHint)).toBeInTheDocument();
  });
});

/** Wave 198 canon: the default columns fit 1440 next to the «⋯» column. */
describe("page list columns — default widths", () => {
  it("every default-visible column declares a width and they fit the budget", () => {
    const visible = buildPageColumns().filter(
      (column) => column.defaultVisible !== false,
    );
    expect(visible.every((column) => column.defaultWidth !== undefined)).toBe(
      true,
    );
    const total = visible.reduce(
      (sum, column) => sum + (column.defaultWidth ?? 0),
      0,
    );
    expect(total).toBeLessThanOrEqual(PAGE_COLUMNS_WIDTH_BUDGET);
  });
});
