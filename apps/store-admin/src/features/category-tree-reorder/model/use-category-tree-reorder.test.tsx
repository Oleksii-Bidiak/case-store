import { useState } from "react";
import { http, HttpResponse, delay } from "msw";
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
import { CategoryReorderUndoButton } from "../ui/category-reorder-undo-button";
import { useCategoryTreeReorder } from "./use-category-tree-reorder";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Three root categories: A, B, C. */
const ITEMS: TreeItem[] = [
  { id: A, parentId: null, label: "Alpha" },
  { id: B, parentId: null, label: "Beta" },
  { id: C, parentId: null, label: "Gamma" },
];

/** A tree response the PATCH can hand back (shape only — the hook stores it verbatim). */
const SERVER_TREE = {
  data: [node(B, "Beta", 0), node(A, "Alpha", 1), node(C, "Gamma", 2)],
};

function node(id: string, name: string, sortOrder: number) {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    description: null,
    image: null,
    isActive: true,
    sortOrder,
    metaTitle: null,
    metaDescription: null,
    updatedAt: "2026-07-01T00:00:00.000Z",
    children: [],
    parentId: null,
    productCount: 0,
    depth: 1,
  };
}

/** Harness: exposes `move` (Alpha down one slot) and the persistent Undo control. */
function Harness({ onFocusRow }: { onFocusRow?: (id: string) => void }) {
  const [items] = useState<TreeItem[]>(ITEMS);
  const reorder = useCategoryTreeReorder({ items, onFocusRow });

  const moveAlphaDown = () => {
    const outcome = applyIntent(reorder.items, A, "down");
    if (outcome.kind === "moved") reorder.move(outcome.items, A);
  };

  return (
    <div>
      <button type="button" onClick={moveAlphaDown}>
        move-alpha-down
      </button>
      <CategoryReorderUndoButton
        canUndo={reorder.canUndo}
        onUndo={reorder.undo}
      />
      <div data-testid="order">
        {reorder.items.map((i) => i.label).join(",")}
      </div>
      <div data-testid="busy">{String(reorder.isPending)}</div>
    </div>
  );
}

function renderHarness(onFocusRow?: (id: string) => void) {
  return renderWithProviders(
    <LiveAnnouncer>
      <Harness onFocusRow={onFocusRow} />
    </LiveAnnouncer>,
  );
}

const polite = () => screen.getByTestId("tree-live-polite").textContent;
const assertive = () => screen.getByTestId("tree-live-assertive").textContent;

beforeEach(() => resetReorderLock());

describe("useCategoryTreeReorder — mutation lifecycle (TASK-291-I)", () => {
  it("sends the reorder payload and announces the commit, naming the Undo control", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.patch("*/api/admin/categories/reorder", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(SERVER_TREE);
      }),
    );

    renderHarness();
    await userEvent.click(
      screen.getByRole("button", { name: "move-alpha-down" }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      groups: [{ parentId: null, orderedIds: [B, A, C] }],
    });

    await waitFor(() =>
      expect(polite()).toContain("Скасувати останнє переміщення"),
    );
    expect(polite()).toContain("„Alpha“ переміщено");
  });

  it("the PERSISTENT Undo control is focusable and fires the exact INVERSE payload", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.patch("*/api/admin/categories/reorder", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(SERVER_TREE);
      }),
    );

    renderHarness();

    const undo = screen.getByRole("button", {
      name: dict.categories.tree.undo,
    });
    // Before any move: still in the tab order (aria-disabled, never `disabled`),
    // because a toast cannot be the accessible entry point (§7.6.4).
    expect(undo).toHaveAttribute("aria-disabled", "true");
    expect(undo).not.toBeDisabled();
    undo.focus();
    expect(undo).toHaveFocus();

    await userEvent.click(
      screen.getByRole("button", { name: "move-alpha-down" }),
    );
    await waitFor(() => expect(undo).toHaveAttribute("aria-disabled", "false"));

    await userEvent.click(undo);

    await waitFor(() => expect(bodies).toHaveLength(2));
    // The inverse of [B, A, C] is the original [A, B, C].
    expect(bodies[1]).toEqual({
      groups: [{ parentId: null, orderedIds: [A, B, C] }],
    });
    await waitFor(() =>
      expect(polite()).toBe(dict.reorderTree.announce.undone),
    );
  });

  it("a second move while a PATCH is in flight fires NO second request and announces busy", async () => {
    let calls = 0;
    server.use(
      http.patch("*/api/admin/categories/reorder", async () => {
        calls += 1;
        await delay(500);
        return HttpResponse.json(SERVER_TREE);
      }),
    );

    renderHarness();
    const trigger = screen.getByRole("button", { name: "move-alpha-down" });

    await userEvent.click(trigger);
    await waitFor(() =>
      expect(screen.getByTestId("busy")).toHaveTextContent("true"),
    );

    await userEvent.click(trigger);
    expect(polite()).toBe(dict.reorderTree.announce.busyRefused);

    await waitFor(() =>
      expect(screen.getByTestId("busy")).toHaveTextContent("false"),
    );
    expect(calls).toBe(1);
  });

  it("on a coded rejection: rolls the override back, re-focuses the row, announces assertively", async () => {
    server.use(
      http.patch("*/api/admin/categories/reorder", () =>
        HttpResponse.json(
          { statusCode: 400, error: "CATEGORY_MAX_DEPTH", message: "nope" },
          { status: 400 },
        ),
      ),
    );

    const onFocusRow = jest.fn();
    renderHarness(onFocusRow);

    await userEvent.click(
      screen.getByRole("button", { name: "move-alpha-down" }),
    );

    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderTree.rejected.CATEGORY_MAX_DEPTH),
    );
    expect(onFocusRow).toHaveBeenCalledWith(A);
    // The optimistic override is dropped — the server tree is what renders.
    await waitFor(() =>
      expect(screen.getByTestId("order")).toHaveTextContent("Alpha,Beta,Gamma"),
    );
  });

  it("an UNRECOGNISED error code falls back to the never-empty, never-English string", async () => {
    server.use(
      http.patch("*/api/admin/categories/reorder", () =>
        HttpResponse.json(
          { statusCode: 400, error: "SOMETHING_NEW", message: "?" },
          { status: 400 },
        ),
      ),
    );

    renderHarness();
    await userEvent.click(
      screen.getByRole("button", { name: "move-alpha-down" }),
    );

    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderTree.rejectedUnknown("Alpha")),
    );
  });

  it("a retry issued DURING the 409 recovery fetch is refused — the single-in-flight guard spans the recovery too", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/categories/admin/tree", async () => {
        // The recovery GET is still running when the operator re-presses the key.
        await delay(300);
        return HttpResponse.json(SERVER_TREE);
      }),
      http.patch("*/api/admin/categories/reorder", () => {
        calls += 1;
        return HttpResponse.json(
          { statusCode: 409, error: "CATEGORY_TREE_STALE", message: "stale" },
          { status: 409 },
        );
      }),
    );

    renderHarness();
    const trigger = screen.getByRole("button", { name: "move-alpha-down" });

    await userEvent.click(trigger);
    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderTree.rejected.CATEGORY_TREE_STALE),
    );

    // The reflexive retry, while the recovery GET is still in flight: refused,
    // announced, and NO second PATCH (which would race the recovery write).
    await userEvent.click(trigger);
    expect(polite()).toBe(dict.reorderTree.announce.busyRefused);
    expect(calls).toBe(1);

    // Once the recovery lands, the guard is released again.
    await waitFor(() =>
      expect(polite()).toBe(
        dict.reorderTree.announce.positionAfterConflict("Alpha", 2, 3, 1, null),
      ),
    );
    await userEvent.click(trigger);
    await waitFor(() => expect(calls).toBe(2));
  });

  it("CATEGORY_TREE_STALE (409): assertive conflict, refetch, re-focus, then the new position politely", async () => {
    server.use(
      http.get("*/api/categories/admin/tree", () =>
        HttpResponse.json(SERVER_TREE),
      ),
      http.patch("*/api/admin/categories/reorder", () =>
        HttpResponse.json(
          { statusCode: 409, error: "CATEGORY_TREE_STALE", message: "stale" },
          { status: 409 },
        ),
      ),
    );

    const onFocusRow = jest.fn();
    renderHarness(onFocusRow);

    await userEvent.click(
      screen.getByRole("button", { name: "move-alpha-down" }),
    );

    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderTree.rejected.CATEGORY_TREE_STALE),
    );
    await waitFor(() => expect(onFocusRow).toHaveBeenCalledWith(A));
    // The refetched tree puts Alpha at position 2 of 3, level 1.
    await waitFor(() =>
      expect(polite()).toBe(
        dict.reorderTree.announce.positionAfterConflict("Alpha", 2, 3, 1, null),
      ),
    );
  });
});
