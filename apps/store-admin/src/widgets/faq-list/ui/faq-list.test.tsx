/**
 * `AdminFaqTable` — the sortable FAQ grid (TASK-242; reordering added in TASK-428).
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
import { AdminFaqTable } from "./faq-list";

/* ─────────────────────────────── fixtures ──────────────────────────────── */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const QUESTIONS: Record<string, string> = {
  [A]: "Скільки коштує доставка?",
  [B]: "Яка гарантія на техніку?",
  [C]: "Чи можна повернути товар?",
};

const DEFAULT_ORDER = [A, B, C];

function listResponse(order: string[] = DEFAULT_ORDER) {
  return {
    data: order.map((id, i) => ({
      id,
      question: QUESTIONS[id],
      answer: "Відповідь.",
      sortOrder: i,
      // The middle question is hidden — the status badges are asserted below.
      isActive: id !== B,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
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
    http.get("*/api/admin/faq", () => {
      listCalls += 1;
      return HttpResponse.json(listResponse());
    }),
    http.patch("*/api/admin/faq/reorder", async ({ request }) => {
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
  const el = document.getElementById(`faq-row-${id}`);
  if (!el) throw new Error(`row ${QUESTIONS[id] ?? id} is not rendered`);
  return el as HTMLTableRowElement;
};

const rowIds = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLTableRowElement>("tr[id^='faq-row-']"),
  ).map((row) => row.id.replace("faq-row-", ""));

const polite = () => screen.getByTestId("tree-live-polite").textContent ?? "";
const assertive = () =>
  screen.getByTestId("tree-live-assertive").textContent ?? "";

async function renderGrid() {
  const result = renderWithProviders(<AdminFaqTable />);
  await screen.findByRole("grid", { name: dict.faq.gridLabel });
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

describe("AdminFaqTable — rendering", () => {
  it("renders the fetched FAQ items with their status", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.getByText(QUESTIONS[A])).toBeInTheDocument();
    expect(screen.getByText(QUESTIONS[B])).toBeInTheDocument();
    expect(screen.getAllByText(dict.faq.statusActive)).toHaveLength(2);
    expect(screen.getByText(dict.faq.statusInactive)).toBeInTheDocument();
  });

  it("has NO sort-order column any more — the row order IS the order", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryByText("Порядок")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no items", async () => {
    server.use(
      http.get("*/api/admin/faq", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 0, totalPages: 0 },
        }),
      ),
    );

    renderWithProviders(<AdminFaqTable />);

    expect(await screen.findByText(dict.faq.empty)).toBeInTheDocument();
  });

  it("shows the error state when the request fails, keeping refresh reachable", async () => {
    server.use(
      http.get(
        "*/api/admin/faq",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderWithProviders(<AdminFaqTable />);

    expect(await screen.findByText(dict.faq.loadError)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    ).toBeInTheDocument();
  });
});

describe("AdminFaqTable — ARIA model", () => {
  it("is a `grid` (never a treegrid) whose rows carry aria-rowindex and a roving tabindex", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryAllByRole("treegrid")).toHaveLength(0);
    expect(rowEl(A)).toHaveAttribute("aria-rowindex", "2");
    expect(rowEl(C)).toHaveAttribute("aria-rowindex", "4");
    expect(rowEl(A)).not.toHaveAttribute("aria-level");

    expect(
      screen.getByRole("grid", { name: dict.faq.gridLabel }),
    ).toHaveAttribute("aria-busy", "false");
    expect(rowIds().filter((id) => rowEl(id).tabIndex === 0)).toHaveLength(1);
  });
});

describe("AdminFaqTable — keyboard reorder", () => {
  it("Space ↑ Space sends exactly ONE PATCH with the COMPLETE orderedIds", async () => {
    mockReorder();
    await renderGrid();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(
      dict.reorderList.announce.grabbed(QUESTIONS[B], 2, 3),
    );

    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(polite()).toBe(dict.reorderList.announce.moved(QUESTIONS[B], 1, 3));
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

describe("AdminFaqTable — server rejections", () => {
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
 * The two rules that keep the payload complete. TASK-357 had given this table server
 * paging and a URL search; both had to go, because a page (or a filtered view) is a
 * PARTIAL view and a reorder computed on one is a partial ordering.
 */
describe("AdminFaqTable — the payload can never be partial", () => {
  it("a search that hides rows LOCKS reordering", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "гарантія",
    );

    await waitFor(() => expect(rowIds()).toEqual([B]));
    expect(
      screen.getByText(dict.reorderList.searchLockedHint),
    ).toBeInTheDocument();
    expect(
      within(rowEl(B)).getByRole("button", {
        name: dict.reorderList.handleLabel(QUESTIONS[B]),
      }),
    ).toHaveAttribute("aria-disabled", "true");

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.searchLocked);
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "false");
    expect(bodies).toHaveLength(0);
  });

  it("never asks for a page, and offers no page controls", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/faq", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderWithProviders(<AdminFaqTable />);
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

  // The local needle must not reach the server either: a server-filtered list would be
  // a partial one, and the grid would be ordering rows it cannot see.
  it("keeps the search local — it never becomes a query parameter", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/faq", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderWithProviders(<AdminFaqTable />);
    await waitFor(() => expect(rowIds()).toHaveLength(3));

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "гарантія",
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
    expect(screen.queryByText(dict.faq.empty)).not.toBeInTheDocument();
  });
});
