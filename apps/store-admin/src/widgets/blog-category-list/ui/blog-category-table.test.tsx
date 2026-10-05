/**
 * `BlogCategoryTable` — the sortable blog-category grid (TASK-295).
 *
 * KEYBOARD-ONLY moves, by design: jsdom has no layout, so dnd-kit's collision
 * detection cannot run. Pointer correctness rests on the pointer path sharing ONE
 * `applyMove()` reducer with the keyboard path (pinned in `shared/lib/sortable-tree`).
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
import { dict, STOREFRONT_URL } from "@/shared/config";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import { PERM } from "@/entities/permission";
import { BlogCategoryTable } from "./blog-category-table";

/** Reordering, editing and deleting are `blog:write` — the grid's own key. */
const WRITER = { permissions: [PERM.blogWrite] };

/* ─────────────────────────────── fixtures ──────────────────────────────── */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // Новини
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // Огляди
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // Поради

const NAMES: Record<string, string> = {
  [A]: "Новини",
  [B]: "Огляди",
  [C]: "Поради",
};

const DEFAULT_ORDER = [A, B, C];

function listResponse(order: string[] = DEFAULT_ORDER) {
  return {
    data: order.map((id, i) => ({
      id,
      name: NAMES[id],
      slug: id.slice(0, 4),
      sortOrder: i,
      postCount: 0,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    })),
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
    http.get("*/api/admin/blog/categories", () => {
      listCalls += 1;
      return HttpResponse.json(listResponse());
    }),
    http.patch("*/api/admin/blog/categories/reorder", async ({ request }) => {
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
  const el = document.getElementById(`blog-category-row-${id}`);
  if (!el) throw new Error(`row ${NAMES[id] ?? id} is not rendered`);
  return el as HTMLTableRowElement;
};

const rowIds = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLTableRowElement>(
      "tr[id^='blog-category-row-']",
    ),
  ).map((row) => row.id.replace("blog-category-row-", ""));

const polite = () => screen.getByTestId("tree-live-polite").textContent ?? "";
const assertive = () =>
  screen.getByTestId("tree-live-assertive").textContent ?? "";

async function renderGrid() {
  const result = renderWithProviders(<BlogCategoryTable />, { auth: WRITER });
  await screen.findByRole("grid", { name: dict.blogCategories.gridLabel });
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

describe("BlogCategoryTable — ARIA model", () => {
  it("is a `grid` (never a treegrid) whose rows carry aria-rowindex and a roving tabindex", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryAllByRole("treegrid")).toHaveLength(0);
    expect(rowEl(A)).toHaveAttribute("aria-rowindex", "2");
    expect(rowEl(C)).toHaveAttribute("aria-rowindex", "4");
    expect(rowEl(A)).not.toHaveAttribute("aria-level");
    expect(rowEl(A)).not.toHaveAttribute("aria-expanded");

    expect(
      screen.getByRole("grid", { name: dict.blogCategories.gridLabel }),
    ).toHaveAttribute("aria-busy", "false");
    expect(rowIds().filter((id) => rowEl(id).tabIndex === 0)).toHaveLength(1);
  });

  it("has NO sort-order column any more — the row order IS the order", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryByText("Порядок")).not.toBeInTheDocument();
  });
});

describe("BlogCategoryTable — keyboard reorder", () => {
  it("Space ↑ Space sends exactly ONE PATCH with the COMPLETE orderedIds", async () => {
    mockReorder();
    await renderGrid();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.grabbed("Огляди", 2, 3));

    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(polite()).toBe(dict.reorderList.announce.moved("Огляди", 1, 3));
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

describe("BlogCategoryTable — server rejections", () => {
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
    await waitFor(() =>
      expect(polite()).toBe(
        dict.reorderList.announce.positionAfterConflict("Огляди", 2, 3),
      ),
    );
    expect(rowIds()).toEqual(DEFAULT_ORDER);
  });
});

describe("BlogCategoryTable — the payload can never be partial", () => {
  it("a search that hides rows LOCKS reordering", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "Огляди",
    );

    await waitFor(() => expect(rowIds()).toEqual([B]));
    expect(
      screen.getByText(dict.reorderList.searchLockedHint),
    ).toBeInTheDocument();
    expect(
      within(rowEl(B)).getByRole("button", {
        name: dict.reorderList.handleLabel("Огляди"),
      }),
    ).toHaveAttribute("aria-disabled", "true");

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.searchLocked);
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "false");
    expect(bodies).toHaveLength(0);
  });
});

/**
 * TASK-357 gave every reference table a toolbar with a refresh control — but
 * deliberately did NOT paginate this one. The reorder payload has to name EVERY
 * category, and a page is a partial view; paging here would have traded a
 * missing button for a corrupt PATCH.
 */
describe("BlogCategoryTable — toolbar (TASK-357)", () => {
  it("refetches on demand without ever asking for a page", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/blog/categories", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderWithProviders(<BlogCategoryTable />);
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

  it("keeps the refresh control reachable when the list failed to load", async () => {
    server.use(
      http.get(
        "*/api/admin/blog/categories",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderWithProviders(<BlogCategoryTable />);

    expect(
      await screen.findByText(dict.blogCategories.loadError),
    ).toBeInTheDocument();
    // The state where a refresh matters most used to hide the whole toolbar.
    expect(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    ).toBeInTheDocument();
  });
});

/**
 * Wave 198 (BlogCategoriesProposal КБ1–КБ6, TASK-1072): «На сайті» instead of
 * Slug, «Статей» into the filtered posts list, the row's actions in «⋯», the
 * delete confirm as an AlertDialog and the «has posts» refusal explained.
 */
describe("BlogCategoryTable — columns and «⋯» (КБ1)", () => {
  const c = dict.blogCategories;

  it("shows the site filter and the posts link instead of Slug", async () => {
    mockReorder();
    await renderGrid();

    expect(
      screen.getByRole("columnheader", { name: c.colSite }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: c.colPosts }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Slug" }),
    ).not.toBeInTheDocument();

    const site = within(rowEl(A)).getByRole("link", {
      name: c.siteLinkAria("Новини"),
    });
    expect(site).toHaveAttribute(
      "href",
      `${STOREFRONT_URL}/blog?category=aaaa`,
    );
    expect(site).toHaveAttribute("target", "_blank");
    expect(
      within(rowEl(A)).getByRole("link", { name: c.postsLinkAria("Новини") }),
    ).toHaveAttribute("href", "/blog?category=aaaa");
    expect(screen.getByText(c.orderHint)).toBeInTheDocument();
  });

  it("offers Редагувати · Показати статті · Відкрити на сайті · Видалити…", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.click(
      within(rowEl(A)).getByRole("button", {
        name: c.rowActionsAria("Новини"),
      }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([c.rowEdit, c.rowShowPosts, c.rowOpenSite, c.rowDelete]);
    expect(
      within(menu).getByRole("menuitem", { name: c.rowEdit }),
    ).toHaveAttribute("href", `/blog/categories?edit=${A}`);
    expect(
      within(menu).getByRole("menuitem", { name: c.rowShowPosts }),
    ).toHaveAttribute("href", "/blog?category=aaaa");
  });

  it("without blog:write: no reordering, no edit or delete", async () => {
    mockReorder();
    renderWithProviders(<BlogCategoryTable />);
    await waitFor(() => expect(rowIds()).toHaveLength(3));

    expect(screen.queryByText(c.orderHint)).not.toBeInTheDocument();
    expect(
      within(rowEl(A)).queryByRole("button", {
        name: dict.reorderList.handleLabel("Новини"),
      }),
    ).not.toBeInTheDocument();
    // …and the keyboard pick-up is refused too: nothing is ever sent.
    rowEl(A).focus();
    fireEvent.keyDown(rowEl(A), { key: " " });
    expect(rowEl(A)).toHaveAttribute("data-grabbed", "false");

    await userEvent.click(
      within(rowEl(A)).getByRole("button", {
        name: c.rowActionsAria("Новини"),
      }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([c.rowShowPosts, c.rowOpenSite]);
  });
});

describe("BlogCategoryTable — delete (КБ3, TASK-812)", () => {
  const c = dict.blogCategories;

  async function askToDelete() {
    await userEvent.click(
      within(rowEl(A)).getByRole("button", {
        name: c.rowActionsAria("Новини"),
      }),
    );
    const menu = await screen.findByRole("menu");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: c.rowDelete }),
    );
    return screen.findByRole("alertdialog");
  }

  it("asks in an AlertDialog, and only the confirm deletes", async () => {
    mockReorder();
    const deletes: string[] = [];
    server.use(
      http.delete("*/api/admin/blog/categories/:id", ({ params }) => {
        deletes.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderGrid();

    let dialog = await askToDelete();
    expect(
      within(dialog).getByText(c.deleteTitle("Новини")),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(c.deleteDescription("aaaa"));
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    expect(deletes).toHaveLength(0);

    dialog = await askToDelete();
    await userEvent.click(
      within(dialog).getByRole("button", { name: c.deleteAction }),
    );

    await waitFor(() => expect(deletes).toEqual([A]));
  });

  it("explains a 409 «has posts» and links to them, instead of a vague toast", async () => {
    mockReorder();
    server.use(
      http.delete("*/api/admin/blog/categories/:id", () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: "Category has posts and cannot be deleted",
          },
          { status: 409 },
        ),
      ),
    );
    await renderGrid();

    const dialog = await askToDelete();
    await userEvent.click(
      within(dialog).getByRole("button", { name: c.deleteAction }),
    );

    const refusal = await screen.findByRole("alertdialog", {
      name: c.hasPostsTitle("Новини"),
    });
    expect(refusal).toHaveTextContent(c.hasPostsDescription);
    expect(
      within(refusal).getByRole("link", { name: c.rowShowPosts }),
    ).toHaveAttribute("href", "/blog?category=aaaa");
  });
});
