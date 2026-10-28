/**
 * The homepage block reorder adapter (plan 186, TASK-662).
 *
 * What it must guarantee: the PATCH names EVERY block (hidden, scheduled and
 * singleton ones included) in the new page order, a no-op sends nothing, and a
 * 409 `REORDER_STALE` reloads the list and says so — the same contract as the
 * carousel adapter it is copied from.
 */

import { useState } from "react";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { LiveAnnouncer } from "@/shared/ui";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import { applyIntent, type TreeItem } from "@/shared/lib/sortable-tree";
import type { HomeBlockEntity } from "@/shared/api";
import {
  homeBlockReorderPayload,
  homeBlocksToItems,
  useHomeBlockReorder,
} from "./use-home-block-reorder";

jest.mock("@/shared/ui/toast", () => ({
  UNDO_TOAST_DURATION_MS: 10_000,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    undo: jest.fn(),
    dismiss: jest.fn(),
  },
}));

const HERO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TABS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RAIL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NEWS = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function block(
  id: string,
  sortOrder: number,
  overrides: Partial<HomeBlockEntity> = {},
): HomeBlockEntity {
  return {
    id,
    type: "HERO",
    title: null,
    sortOrder,
    status: "PUBLISHED",
    publishedAt: "2026-10-01T00:00:00.000Z",
    scheduledAt: null,
    carousel: null,
    tabs: [],
    isSystem: true,
    isOrphaned: false,
    isEmpty: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** The page as the server holds it — handed in deliberately OUT of order. */
const BLOCKS: HomeBlockEntity[] = [
  block(NEWS, 3, { type: "NEWSLETTER", status: "DRAFT" }),
  block(RAIL, 2, {
    type: "CAROUSEL",
    isSystem: false,
    carousel: {
      id: "car-1",
      title: "Чохли",
      source: "CATEGORY",
      status: "PUBLISHED",
    },
  }),
  block(HERO, 0),
  block(TABS, 1, {
    type: "TABS",
    title: "Популярне",
    isSystem: false,
    status: "SCHEDULED",
    scheduledAt: "2026-11-28T00:00:00.000Z",
  }),
];

describe("homeBlocksToItems", () => {
  it("lists every block in page order, named as the screen names it", () => {
    expect(homeBlocksToItems(BLOCKS)).toEqual([
      { id: HERO, parentId: null, label: dict.homeBlocks.hero },
      { id: TABS, parentId: null, label: "Популярне" },
      { id: RAIL, parentId: null, label: "Чохли" },
      { id: NEWS, parentId: null, label: dict.homeBlocks.newsletter },
    ]);
  });

  it("names a CAROUSEL block whose carousel was deleted", () => {
    const [item] = homeBlocksToItems([
      block(RAIL, 0, { type: "CAROUSEL", isSystem: false, isOrphaned: true }),
    ]);
    expect(item.label).toBe(dict.homeBlocks.carouselDeleted);
  });
});

describe("homeBlockReorderPayload", () => {
  const items = homeBlocksToItems(BLOCKS);

  it("is the FULL new order — never just the moved row", () => {
    const outcome = applyIntent(items, NEWS, "first");
    if (outcome.kind !== "moved") throw new Error("not moved");
    expect(homeBlockReorderPayload(items, outcome.items)).toEqual({
      orderedIds: [NEWS, HERO, TABS, RAIL],
    });
  });

  it("is null when nothing moved", () => {
    expect(homeBlockReorderPayload(items, [...items])).toBeNull();
  });
});

/* ───────────────────────────── the hook ───────────────────────────────── */

function Harness() {
  const [items] = useState<TreeItem[]>(() => homeBlocksToItems(BLOCKS));
  const reorder = useHomeBlockReorder({ items });
  const moveLastUp = () => {
    const id = reorder.items[reorder.items.length - 1].id;
    const outcome = applyIntent(reorder.items, id, "up");
    if (outcome.kind === "moved") reorder.move(outcome.items, id);
  };
  return (
    <div>
      <button type="button" onClick={moveLastUp}>
        move-last-up
      </button>
      <div data-testid="order">{reorder.items.map((i) => i.id).join(",")}</div>
    </div>
  );
}

let bodies: unknown[] = [];
let listCalls = 0;

function mockApi(reorderStatus = 200) {
  server.use(
    http.get("*/api/admin/home-blocks", () => {
      listCalls += 1;
      return HttpResponse.json({ data: BLOCKS });
    }),
    http.patch("*/api/admin/home-blocks/reorder", async ({ request }) => {
      bodies.push(await request.json());
      return reorderStatus === 200
        ? HttpResponse.json({ data: BLOCKS })
        : HttpResponse.json(
            { statusCode: 409, error: "REORDER_STALE", message: "stale" },
            { status: 409 },
          );
    }),
  );
}

beforeEach(() => {
  resetReorderLock();
  bodies = [];
  listCalls = 0;
});

function renderHarness() {
  return renderWithProviders(
    <LiveAnnouncer>
      <Harness />
    </LiveAnnouncer>,
  );
}

describe("useHomeBlockReorder", () => {
  it("PATCHes the complete ordered id list, hidden and scheduled blocks included", async () => {
    mockApi();
    renderHarness();

    await userEvent.click(screen.getByRole("button", { name: "move-last-up" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ orderedIds: [HERO, TABS, NEWS, RAIL] });
  });

  it("409 REORDER_STALE → the «list changed» alert and a reload", async () => {
    mockApi(409);
    renderHarness();

    await userEvent.click(screen.getByRole("button", { name: "move-last-up" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-assertive")).toHaveTextContent(
        dict.reorderList.rejected.REORDER_STALE,
      ),
    );
    await waitFor(() => expect(listCalls).toBeGreaterThan(0));
  });
});
