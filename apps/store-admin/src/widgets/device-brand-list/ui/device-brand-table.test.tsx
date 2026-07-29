/**
 * `DeviceBrandTable` — the sortable device-brand grid (TASK-295).
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
import { dict } from "@/shared/config";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import { DeviceBrandTable } from "./device-brand-table";

/* ─────────────────────────────── fixtures ──────────────────────────────── */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // Apple
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // Samsung
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // Xiaomi

const NAMES: Record<string, string> = {
  [A]: "Apple",
  [B]: "Samsung",
  [C]: "Xiaomi",
};

const DEFAULT_ORDER = [A, B, C];

function listResponse(order: string[] = DEFAULT_ORDER) {
  return {
    data: order.map((id, i) => ({
      id,
      name: NAMES[id],
      slug: NAMES[id].toLowerCase(),
      sortOrder: i,
      isActive: true,
      modelCount: 0,
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
    http.get("*/api/admin/devices/brands", () => {
      listCalls += 1;
      return HttpResponse.json(listResponse());
    }),
    http.patch("*/api/admin/devices/brands/reorder", async ({ request }) => {
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
  const el = document.getElementById(`device-brand-row-${id}`);
  if (!el) throw new Error(`row ${NAMES[id] ?? id} is not rendered`);
  return el as HTMLTableRowElement;
};

const rowIds = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLTableRowElement>(
      "tr[id^='device-brand-row-']",
    ),
  ).map((row) => row.id.replace("device-brand-row-", ""));

const polite = () => screen.getByTestId("tree-live-polite").textContent ?? "";
const assertive = () =>
  screen.getByTestId("tree-live-assertive").textContent ?? "";

async function renderGrid() {
  const result = renderWithProviders(<DeviceBrandTable />);
  await screen.findByRole("grid", { name: dict.devices.brandsGridLabel });
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

describe("DeviceBrandTable — ARIA model", () => {
  it("is a `grid` (never a treegrid) whose rows carry aria-rowindex and a roving tabindex", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryAllByRole("treegrid")).toHaveLength(0);
    expect(rowEl(A)).toHaveAttribute("aria-rowindex", "2");
    expect(rowEl(C)).toHaveAttribute("aria-rowindex", "4");
    expect(rowEl(A)).not.toHaveAttribute("aria-level");
    expect(rowEl(A)).not.toHaveAttribute("aria-expanded");

    expect(
      screen.getByRole("grid", { name: dict.devices.brandsGridLabel }),
    ).toHaveAttribute("aria-busy", "false");
    expect(rowIds().filter((id) => rowEl(id).tabIndex === 0)).toHaveLength(1);
  });

  it("has NO sort-order column any more — the row order IS the order", async () => {
    mockReorder();
    await renderGrid();

    expect(screen.queryByText("Порядок")).not.toBeInTheDocument();
  });
});

describe("DeviceBrandTable — keyboard reorder", () => {
  it("Space ↑ Space sends exactly ONE PATCH with the COMPLETE orderedIds", async () => {
    mockReorder();
    await renderGrid();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(dict.reorderList.announce.grabbed("Samsung", 2, 3));

    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(polite()).toBe(dict.reorderList.announce.moved("Samsung", 1, 3));
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

describe("DeviceBrandTable — server rejections", () => {
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
        dict.reorderList.announce.positionAfterConflict("Samsung", 2, 3),
      ),
    );
    expect(rowIds()).toEqual(DEFAULT_ORDER);
  });
});

describe("DeviceBrandTable — the payload can never be partial", () => {
  it("a search that hides rows LOCKS reordering", async () => {
    mockReorder();
    await renderGrid();

    await userEvent.type(
      screen.getByRole("searchbox", { name: dict.reorderList.searchLabel }),
      "Samsung",
    );

    await waitFor(() => expect(rowIds()).toEqual([B]));
    expect(
      screen.getByText(dict.reorderList.searchLockedHint),
    ).toBeInTheDocument();
    expect(
      within(rowEl(B)).getByRole("button", {
        name: dict.reorderList.handleLabel("Samsung"),
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
 * brand, and a page is a partial view; paging here would have traded a missing
 * button for a corrupt PATCH.
 */
describe("DeviceBrandTable — toolbar (TASK-357)", () => {
  it("refetches on demand without ever asking for a page", async () => {
    const urls: URL[] = [];
    server.use(
      http.get("*/api/admin/devices/brands", ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(listResponse());
      }),
    );

    renderWithProviders(<DeviceBrandTable />);
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
    // No page controls either — there is no page to move to.
    expect(
      screen.queryByRole("button", { name: dict.common.next }),
    ).not.toBeInTheDocument();
  });

  it("keeps the refresh control reachable when the list failed to load", async () => {
    server.use(
      http.get(
        "*/api/admin/devices/brands",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderWithProviders(<DeviceBrandTable />);

    expect(
      await screen.findByText(dict.devices.brandsLoadError),
    ).toBeInTheDocument();
    // The state where a refresh matters most used to hide the whole toolbar.
    expect(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    ).toBeInTheDocument();
  });
});
