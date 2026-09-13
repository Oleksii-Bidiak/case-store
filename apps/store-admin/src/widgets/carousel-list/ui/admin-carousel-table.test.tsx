/**
 * `AdminCarouselTable` — the sortable carousel view (TASK-139/288; reordering added in
 * TASK-428).
 *
 * ONE PLACEMENT = ONE GRID, because a carousel's `sortOrder` is only meaningful inside its
 * own placement. The suite therefore renders both buckets and asserts that a move inside
 * one names only that bucket's ids and carries its `placement`.
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
import { AdminCarouselTable } from "./admin-carousel-table";

/* ─────────────────────────────── fixtures ──────────────────────────────── */

// Two rails + one tab: the rail bucket is the one being reordered, and TAB exists to
// prove a rail move never names it.
const R1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // Хіти тижня (rail, published)
const R2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // Редакція обирає (rail, draft)
const TAB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // Популярне (tab, published)

const TITLES: Record<string, string> = {
  [R1]: "Хіти тижня",
  [R2]: "Редакція обирає",
  [TAB]: "Популярне",
};

const RAILS = [R1, R2];

function row(id: string) {
  const isTab = id === TAB;
  const isDraft = id === R2;
  return {
    id,
    title: TITLES[id],
    source: isDraft ? "MANUAL" : "BESTSELLING",
    placement: isTab ? "HOME_TABS" : "HOME_RAILS",
    categoryId: null,
    itemLimit: 12,
    sortOrder: 0,
    status: isDraft ? "DRAFT" : "PUBLISHED",
    publishedAt: isDraft ? null : "2026-07-01T00:00:00.000Z",
    scheduledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function listResponse(railOrder: string[] = RAILS) {
  const data = [row(TAB), ...railOrder.map(row)].map((r, i) => ({
    ...r,
    sortOrder: i,
  }));
  return {
    data,
    meta: { total: data.length, page: 1, limit: data.length, totalPages: 1 },
  };
}

/** Every PATCH body the widget sent, in order. */
let bodies: unknown[] = [];
/** GET count — the "resyncs from the response alone" assertion reads it. */
let listCalls = 0;

/** The endpoint returns the FULL refreshed list (both placements), as the real one does. */
function mockReorder(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json(listResponse([R2, R1])),
) {
  server.use(
    http.get("*/api/admin/carousels", () => {
      listCalls += 1;
      return HttpResponse.json(listResponse());
    }),
    http.patch("*/api/admin/carousels/reorder", async ({ request }) => {
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
  const el = document.getElementById(`carousel-row-${id}`);
  if (!el) throw new Error(`row ${TITLES[id] ?? id} is not rendered`);
  return el as HTMLTableRowElement;
};

/** Row ids of ONE placement's grid, in rendered order. */
const railIds = (): string[] => {
  const grid = screen.getByRole("grid", {
    name: dict.carousels.gridLabel(dict.carousels.placementLabels.HOME_RAILS),
  });
  return Array.from(
    grid.querySelectorAll<HTMLTableRowElement>("tr[id^='carousel-row-']"),
  ).map((r) => r.id.replace("carousel-row-", ""));
};

const polite = () => screen.getByTestId("tree-live-polite").textContent ?? "";
const assertive = () =>
  screen.getByTestId("tree-live-assertive").textContent ?? "";

async function renderGrids() {
  const result = renderWithProviders(<AdminCarouselTable />);
  await screen.findByRole("grid", {
    name: dict.carousels.gridLabel(dict.carousels.placementLabels.HOME_RAILS),
  });
  await waitFor(() => expect(railIds()).toHaveLength(2));
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

describe("AdminCarouselTable — rendering", () => {
  it("renders carousel rows with source and status badges", async () => {
    mockReorder();
    await renderGrids();

    expect(screen.getByText("Хіти тижня")).toBeInTheDocument();
    expect(screen.getByText("Редакція обирає")).toBeInTheDocument();
    expect(
      screen.getAllByText(dict.carousels.sourceLabels.BESTSELLING),
    ).toHaveLength(2);
    expect(
      screen.getByText(dict.carousels.sourceLabels.MANUAL),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(dict.carousels.statusLabels.PUBLISHED),
    ).toHaveLength(2);
    expect(
      screen.getByText(dict.carousels.statusLabels.DRAFT),
    ).toBeInTheDocument();
  });

  /**
   * TASK-288 gave every row a placement BADGE so a tab could be told from a rail.
   * TASK-428 replaced it with a stronger signal: the placement is now the SECTION a row
   * lives in, which is also the unit of reordering. The badge column is gone because
   * every row under a heading has that heading's placement by construction.
   */
  it("groups the rows into one section per placement instead of a placement column", async () => {
    mockReorder();
    await renderGrids();

    expect(
      screen.getByRole("heading", {
        name: dict.carousels.placementLabels.HOME_TABS,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: dict.carousels.placementLabels.HOME_RAILS,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: dict.carousels.colPlacement }),
    ).not.toBeInTheDocument();
    // The tab bucket renders its own grid, with only its own row.
    const tabGrid = screen.getByRole("grid", {
      name: dict.carousels.gridLabel(dict.carousels.placementLabels.HOME_TABS),
    });
    expect(within(tabGrid).getByText("Популярне")).toBeInTheDocument();
    expect(within(tabGrid).queryByText("Хіти тижня")).not.toBeInTheDocument();
  });

  it("has NO sort-order column any more — the row order IS the order", async () => {
    mockReorder();
    await renderGrids();

    expect(screen.queryByText("Порядок")).not.toBeInTheDocument();
  });

  it("renders an edit action linking to the carousel edit route", async () => {
    mockReorder();
    await renderGrids();

    expect(
      within(rowEl(R1)).getByRole("link", { name: dict.common.edit }),
    ).toHaveAttribute("href", `/carousels/${R1}/edit`);
  });

  it("shows the empty state when there are no carousels", async () => {
    server.use(
      http.get("*/api/admin/carousels", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 0, totalPages: 0 },
        }),
      ),
    );

    renderWithProviders(<AdminCarouselTable />);

    expect(await screen.findByText(dict.carousels.empty)).toBeInTheDocument();
  });
});

describe("AdminCarouselTable — publish toggles and delete", () => {
  it("publishes a draft via the toggle and PATCHes the publish endpoint", async () => {
    mockReorder();
    let published = false;
    server.use(
      http.patch(`*/api/admin/carousels/${R2}/publish`, () => {
        published = true;
        return HttpResponse.json({ data: row(R2) });
      }),
    );
    await renderGrids();

    await userEvent.click(
      within(rowEl(R2)).getByRole("button", { name: dict.carousels.publish }),
    );

    await waitFor(() => expect(published).toBe(true));
  });

  it("unpublishes a published carousel via the toggle", async () => {
    mockReorder();
    let unpublished = false;
    server.use(
      http.patch(`*/api/admin/carousels/${R1}/unpublish`, () => {
        unpublished = true;
        return HttpResponse.json({ data: row(R1) });
      }),
    );
    await renderGrids();

    await userEvent.click(
      within(rowEl(R1)).getByRole("button", { name: dict.carousels.unpublish }),
    );

    await waitFor(() => expect(unpublished).toBe(true));
  });

  describe("delete with confirm", () => {
    let confirmSpy: jest.SpyInstance;

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it("deletes after the admin confirms", async () => {
      confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
      mockReorder();
      let deleted = false;
      server.use(
        http.delete(`*/api/admin/carousels/${R1}`, () => {
          deleted = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      await renderGrids();

      await userEvent.click(
        within(rowEl(R1)).getByRole("button", { name: dict.common.delete }),
      );

      expect(confirmSpy).toHaveBeenCalledWith(
        dict.carousels.deleteConfirm("Хіти тижня"),
      );
      await waitFor(() => expect(deleted).toBe(true));
    });

    it("does nothing when the admin cancels the confirm", async () => {
      confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
      mockReorder();
      let deleted = false;
      server.use(
        http.delete(`*/api/admin/carousels/${R1}`, () => {
          deleted = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      await renderGrids();

      await userEvent.click(
        within(rowEl(R1)).getByRole("button", { name: dict.common.delete }),
      );

      expect(confirmSpy).toHaveBeenCalled();
      // Give any (wrong) mutation a beat to fire before asserting it did not.
      await waitFor(() => expect(deleted).toBe(false));
    });
  });
});

describe("AdminCarouselTable — keyboard reorder", () => {
  it("Space ↑ Space sends ONE PATCH naming the bucket and only its ids", async () => {
    mockReorder();
    await renderGrids();

    rowEl(R2).focus();
    fireEvent.keyDown(rowEl(R2), { key: " " });
    expect(polite()).toBe(
      dict.reorderList.announce.grabbed("Редакція обирає", 2, 2),
    );

    fireEvent.keyDown(rowEl(R2), { key: "ArrowUp" });
    expect(railIds()).toEqual([R2, R1]);
    expect(bodies).toHaveLength(0); // nothing committed yet

    fireEvent.keyDown(rowEl(R2), { key: " " });

    await waitFor(() => expect(bodies).toHaveLength(1));
    // The HOME_TABS row is NOT in the payload: a bucket is reordered on its own, and the
    // server scopes every write to that placement.
    expect(bodies[0]).toEqual({
      placement: "HOME_RAILS",
      orderedIds: [R2, R1],
    });
  });

  it("resyncs the list from the PATCH RESPONSE alone — no refetch", async () => {
    mockReorder();
    await renderGrids();
    const before = listCalls;

    keyboardMoveUp(R2);

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(railIds()).toEqual([R2, R1]));
    expect(listCalls).toBe(before);
  });

  it("the Undo control of that section sends the INVERSE order", async () => {
    mockReorder();
    await renderGrids();

    keyboardMoveUp(R2);
    await waitFor(() => expect(bodies).toHaveLength(1));

    // One Undo per section — the rails section's is the second in the DOM.
    const undo = screen.getAllByRole("button", {
      name: dict.reorderList.undo,
    })[1];
    await waitFor(() => expect(undo).toHaveAttribute("aria-disabled", "false"));
    fireEvent.click(undo);

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ placement: "HOME_RAILS", orderedIds: RAILS });
  });
});

describe("AdminCarouselTable — server rejections", () => {
  it("409 REORDER_STALE → the «list changed» alert, a reload, and the server order back", async () => {
    mockReorder(() =>
      HttpResponse.json(
        { statusCode: 409, error: "REORDER_STALE", message: "stale" },
        { status: 409 },
      ),
    );
    await renderGrids();
    const before = listCalls;

    keyboardMoveUp(R2);

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderList.rejected.REORDER_STALE),
    );
    await waitFor(() => expect(listCalls).toBeGreaterThan(before));
    expect(railIds()).toEqual(RAILS);
  });
});

/**
 * The two rules that keep the payload complete. TASK-357 had given this table server
 * paging and a URL search; both had to go, because a page (or a filtered view) is a
 * PARTIAL view and a reorder computed on one is a partial ordering.
 */
describe("AdminCarouselTable — the payload can never be partial", () => {
  it("a search that hides rows LOCKS reordering", async () => {
    mockReorder();
    await renderGrids();

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "Редакція",
    );

    await waitFor(() => expect(railIds()).toEqual([R2]));
    expect(
      screen.getByText(dict.reorderList.searchLockedHint),
    ).toBeInTheDocument();
    expect(
      within(rowEl(R2)).getByRole("button", {
        name: dict.reorderList.handleLabel("Редакція обирає"),
      }),
    ).toHaveAttribute("aria-disabled", "true");

    rowEl(R2).focus();
    fireEvent.keyDown(rowEl(R2), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.searchLocked);
    expect(rowEl(R2)).toHaveAttribute("data-grabbed", "false");
    expect(bodies).toHaveLength(0);
  });

  it("never asks for a page or a limit, and offers no page controls", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/carousels", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderWithProviders(<AdminCarouselTable />);
    await waitFor(() => expect(railIds()).toHaveLength(2));
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
      http.get("*/api/admin/carousels", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderWithProviders(<AdminCarouselTable />);
    await waitFor(() => expect(railIds()).toHaveLength(2));

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "Редакція",
    );
    await waitFor(() => expect(railIds()).toEqual([R2]));

    expect(urls).toHaveLength(1);
    expect(urls[0].searchParams.get("search")).toBeNull();
  });

  it("distinguishes an empty search result from an empty table", async () => {
    mockReorder();
    await renderGrids();

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "невідоме",
    );

    expect(
      await screen.findByText(dict.reorderList.emptyMatch("невідоме")),
    ).toBeInTheDocument();
    expect(screen.queryByText(dict.carousels.empty)).not.toBeInTheDocument();
  });
});
