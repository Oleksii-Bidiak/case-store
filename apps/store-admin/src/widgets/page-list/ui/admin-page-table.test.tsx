/**
 * `AdminPageTable` — the sortable static-page grid (TASK-153; reordering added in
 * TASK-428).
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
import { dict } from "@/shared/config";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import { AdminPageTable } from "./admin-page-table";

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

const DEFAULT_ORDER = [A, B, C];

function listResponse(order: string[] = DEFAULT_ORDER) {
  return {
    data: order.map((id, i) => ({
      id,
      slug: SLUGS[id],
      title: TITLES[id],
      content: "<p>Body</p>",
      excerpt: null,
      metaTitle: null,
      metaDescription: null,
      status: id === B ? "DRAFT" : "PUBLISHED",
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

async function renderGrid() {
  const result = renderWithProviders(<AdminPageTable />);
  await screen.findByRole("grid", { name: dict.pages.gridLabel });
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

/* ──────────────────────────────── the suite ────────────────────────────── */

describe("AdminPageTable — rendering", () => {
  it("renders page rows with title, slug, and status badge", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(screen.getByText("privacy-policy")).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
    expect(screen.getAllByText(dict.pages.statusPublished)).toHaveLength(2);
    expect(screen.getByText(dict.pages.statusDraft)).toBeInTheDocument();
  });

  it("has NO sort-order column any more — the row order IS the order", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryByText("Порядок")).not.toBeInTheDocument();
  });

  it("renders an edit action linking to the page edit route", async () => {
    mockReorder();
    await renderGrid();

    expect(
      within(rowEl(A)).getByRole("link", { name: dict.common.edit }),
    ).toHaveAttribute("href", `/pages/${A}/edit`);
  });

  it("shows the error state when the request fails, keeping refresh reachable", async () => {
    server.use(
      http.get(
        "*/api/admin/pages",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderWithProviders(<AdminPageTable />);

    expect(await screen.findByText(dict.pages.loadError)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    ).toBeInTheDocument();
  });
});

// TASK-285: the delete-confirm copy warns about the Google index only for a
// currently-published row.
/**
 * TASK-430 — a page scheduled for Friday was badged «Чернетка».
 *
 * The badge read `isActive`, which the schema documents as a derived mirror of
 * `status == PUBLISHED` — so it collapses DRAFT and SCHEDULED into one value, and the
 * operator could not tell a forgotten draft from a scheduled publication.
 */
describe("AdminPageTable — scheduled badge (TASK-430)", () => {
  /** The list with page B SCHEDULED for 19.09.2026 instead of DRAFT. */
  function stubScheduled(
    scheduledAt: string | null = "2026-09-19T08:00:00.000Z",
  ) {
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

  it("shows the date instead of «Чернетка»", async () => {
    stubScheduled();
    await renderGrid();

    expect(
      screen.getByText(dict.pages.statusScheduledOn("19.09.2026")),
    ).toBeInTheDocument();
    // The draft label must be GONE — B is the only non-published row.
    expect(screen.queryByText(dict.pages.statusDraft)).not.toBeInTheDocument();
  });

  it("falls back to «Заплановано» when the instant is missing", async () => {
    // Should not happen (the API writes status and instant together), but the cell
    // must not render "Invalid Date" if it ever does.
    stubScheduled(null);
    await renderGrid();

    expect(screen.getByText(dict.pages.statusScheduled)).toBeInTheDocument();
  });

  it("leaves the published and draft badges alone", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.getAllByText(dict.pages.statusPublished)).toHaveLength(2);
    expect(screen.getByText(dict.pages.statusDraft)).toBeInTheDocument();
  });
});

describe("AdminPageTable — delete confirm copy (TASK-285)", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("appends the still-may-be-indexed warning for a published page", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.click(
      within(rowEl(A)).getByRole("button", { name: dict.common.delete }),
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      dict.pages.deleteConfirm("Privacy Policy", true),
    );
    expect(confirmSpy.mock.calls[0][0]).toContain("пошуковому індексі");
  });

  it("omits the indexed warning for a draft page", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.click(
      within(rowEl(B)).getByRole("button", { name: dict.common.delete }),
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      dict.pages.deleteConfirm("FAQ", false),
    );
    expect(confirmSpy.mock.calls[0][0]).not.toContain("пошуковому індексі");
  });
});

describe("AdminPageTable — ARIA model", () => {
  it("is a `grid` (never a treegrid) whose rows carry aria-rowindex and a roving tabindex", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryAllByRole("treegrid")).toHaveLength(0);
    expect(rowEl(A)).toHaveAttribute("aria-rowindex", "2");
    expect(rowEl(C)).toHaveAttribute("aria-rowindex", "4");
    expect(
      screen.getByRole("grid", { name: dict.pages.gridLabel }),
    ).toHaveAttribute("aria-busy", "false");
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

  it("the Undo control sends the INVERSE order", async () => {
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
 * The two rules that keep the payload complete.
 *
 * TASK-357 gave this table server paging to fix a silent truncation (`limit: 100`, no
 * pager). TASK-428 had to take the paging back out: a page is a PARTIAL view, and a
 * reorder computed on one is a partial ordering the server rejects as a lost update. The
 * fix for the truncation is now the complete list, not a bigger slab.
 */
describe("AdminPageTable — the payload can never be partial", () => {
  it("a search that hides rows LOCKS reordering", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "FAQ",
    );

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

  // The local needle also matches the SLUG: an operator hunting for a legal page usually
  // remembers its URL rather than its exact heading (the server search did the same).
  it("matches the slug as well as the title", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "privacy-pol",
    );

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

    renderWithProviders(<AdminPageTable />);
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

    renderWithProviders(<AdminPageTable />);
    await waitFor(() => expect(rowIds()).toHaveLength(3));

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "FAQ",
    );
    await waitFor(() => expect(rowIds()).toEqual([B]));

    expect(urls).toHaveLength(1);
    expect(urls[0].searchParams.get("search")).toBeNull();
  });

  it("distinguishes an empty search result from an empty table", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "невідоме",
    );

    expect(
      await screen.findByText(dict.reorderList.emptyMatch("невідоме")),
    ).toBeInTheDocument();
    expect(screen.queryByText(dict.pages.empty)).not.toBeInTheDocument();
  });
});
