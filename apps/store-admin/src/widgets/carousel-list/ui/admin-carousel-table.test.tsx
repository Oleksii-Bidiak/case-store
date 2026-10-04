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

const WRITER = ["carousels:write"];

function renderTable(permissions: string[] = WRITER) {
  return renderWithProviders(<AdminCarouselTable />, { auth: { permissions } });
}

async function openRowMenu(title: string) {
  await userEvent.click(
    await screen.findByRole("button", {
      name: dict.common.registry.rowActionsAria(title),
    }),
  );
}

async function renderGrids() {
  const result = renderTable();
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
  // TASK-720: the list and the form name one place one way.
  it("names each placement section exactly as the carousel form does", () => {
    expect(dict.carousels.placementLabels).toEqual(
      dict.carouselForm.placementOptions,
    );
  });

  it("says where the source comes from in words, with the count and status", async () => {
    mockReorder();
    await renderGrids();

    expect(screen.getByText("Хіти тижня")).toBeInTheDocument();
    expect(screen.getByText("Редакція обирає")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        dict.carousels.sourceAuto(dict.carousels.sourceLabels.BESTSELLING),
      ),
    ).toHaveLength(2);
    expect(
      screen.getByText(dict.carousels.sourceLabels.MANUAL),
    ).toBeInTheDocument();
    // «показує 12» for an automatic source — the count is in the list payload.
    expect(
      within(rowEl(R1)).getAllByText(dict.carousels.shows(12)).length,
    ).toBeGreaterThan(0);
    expect(
      within(rowEl(R2)).queryByText(dict.carousels.shows(12)),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(dict.carousels.statusLabels.PUBLISHED).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      within(rowEl(R2)).getAllByText(dict.carousels.statusLabels.DRAFT).length,
    ).toBeGreaterThan(0);
  });

  it("names a CATEGORY source by the category's name", async () => {
    server.use(
      http.get("*/api/admin/carousels", () =>
        HttpResponse.json({
          data: [
            {
              ...row(R1),
              source: "CATEGORY",
              categoryId: "cat-1",
            },
          ],
          meta: { total: 1, page: 1, limit: 1, totalPages: 1 },
        }),
      ),
      http.get("*/api/categories/tree", () =>
        HttpResponse.json({
          data: [
            {
              id: "cat-1",
              name: "Чохли",
              slug: "cases",
              isActive: true,
              sortOrder: 0,
              updatedAt: "2026-01-01T00:00:00.000Z",
              children: [],
            },
          ],
        }),
      ),
    );
    renderTable();

    expect(
      await screen.findByText(dict.carousels.sourceCategory("Чохли")),
    ).toBeInTheDocument();
  });

  /**
   * TASK-288 gave every row a placement BADGE so a tab could be told from a rail.
   * TASK-428 replaced it with a stronger signal: the placement is now the SECTION a row
   * lives in, which is also the unit of reordering. Wave 198 adds where on the
   * home page that section is.
   */
  it("groups the rows into one section per placement, each saying where it is", async () => {
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
      screen.getByText(dict.carousels.placementWhere.HOME_TABS),
    ).toBeInTheDocument();
    // No placement column — the section IS the placement.
    expect(
      screen.queryAllByRole("columnheader").map((header) => header.textContent),
    ).not.toContain("Місце на сайті");
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

  it("links the title to the edit route, and keeps «Редагувати» in «⋯»", async () => {
    mockReorder();
    await renderGrids();

    expect(
      within(rowEl(R1)).getByRole("link", { name: "Хіти тижня" }),
    ).toHaveAttribute("href", `/carousels/${R1}/edit`);
    await openRowMenu("Хіти тижня");
    expect(
      await screen.findByRole("menuitem", { name: dict.common.edit }),
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

    renderTable();

    expect(await screen.findByText(dict.carousels.empty)).toBeInTheDocument();
  });
});

describe("AdminCarouselTable — row «⋯» (publish toggle, duplicate, delete)", () => {
  it("publishes a draft from «⋯» and PATCHes the publish endpoint", async () => {
    mockReorder();
    let published = false;
    server.use(
      http.patch(`*/api/admin/carousels/${R2}/publish`, () => {
        published = true;
        return HttpResponse.json({ data: row(R2) });
      }),
    );
    await renderGrids();

    await openRowMenu("Редакція обирає");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: dict.carousels.publish }),
    );

    await waitFor(() => expect(published).toBe(true));
  });

  it("unpublishes a published carousel from «⋯»", async () => {
    mockReorder();
    let unpublished = false;
    server.use(
      http.patch(`*/api/admin/carousels/${R1}/unpublish`, () => {
        unpublished = true;
        return HttpResponse.json({ data: row(R1) });
      }),
    );
    await renderGrids();

    await openRowMenu("Хіти тижня");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: dict.carousels.unpublish }),
    );

    await waitFor(() => expect(unpublished).toBe(true));
  });

  it("«Дублювати» creates a DRAFT copy and gives a MANUAL copy the same list", async () => {
    mockReorder();
    const created: unknown[] = [];
    const itemWrites: { url: string; body: unknown }[] = [];
    server.use(
      http.post("*/api/admin/carousels", async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json({ data: { ...row(R2), id: "copy-1" } });
      }),
      http.get(`*/api/admin/carousels/${R2}/items`, () =>
        HttpResponse.json({
          data: [
            {
              id: "i1",
              productId: "p1",
              sortOrder: 0,
              product: {
                id: "p1",
                name: "Чохол",
                imageUrl: null,
                price: "10.00",
                isActive: true,
              },
            },
          ],
        }),
      ),
      http.put("*/api/admin/carousels/:id/items", async ({ request }) => {
        itemWrites.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ data: [] });
      }),
    );
    await renderGrids();

    await openRowMenu("Редакція обирає");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: dict.carousels.duplicate }),
    );

    await waitFor(() => expect(itemWrites).toHaveLength(1));
    expect(created[0]).toEqual({
      title: dict.carousels.duplicateTitle("Редакція обирає"),
      source: "MANUAL",
      placement: "HOME_RAILS",
      itemLimit: 12,
      status: "DRAFT",
    });
    expect(itemWrites[0].url).toContain("/api/admin/carousels/copy-1/items");
    expect(itemWrites[0].body).toEqual({
      items: [{ productId: "p1", sortOrder: 0 }],
    });
  });

  it("«Видалити…» asks in an AlertDialog; only «Видалити карусель» deletes", async () => {
    mockReorder();
    const deleted: string[] = [];
    server.use(
      http.delete("*/api/admin/carousels/:id", ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const confirmSpy = jest.spyOn(window, "confirm");
    await renderGrids();

    await openRowMenu("Популярне");
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: dict.carousels.deleteAction,
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(dict.carousels.deleteTitle("Популярне")),
    ).toBeInTheDocument();
    // A tab and a rail disappear from different places — the text says which.
    expect(
      within(dialog).getByText(
        dict.carousels.deleteDescriptionTab("Популярне"),
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    expect(deleted).toEqual([]);

    await openRowMenu("Хіти тижня");
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: dict.carousels.deleteAction,
      }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: dict.carousels.deleteConfirmLabel,
      }),
    );

    await waitFor(() => expect(deleted).toEqual([R1]));
    // TASK-812: the browser prompt is gone.
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("AdminCarouselTable — without carousels:write (КР3)", () => {
  it("is view-only: no add, no «⋯», no grips — and says so", async () => {
    mockReorder();
    renderTable([]);

    await screen.findByText("Хіти тижня");
    expect(screen.getByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.carousels.add }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: dict.common.registry.rowActionsAria("Хіти тижня"),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: dict.reorderList.handleLabel("Хіти тижня"),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Хіти тижня" }),
    ).not.toBeInTheDocument();
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

    renderTable();
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

    renderTable();
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
