/**
 * `AdminCategoryTree` — the treegrid RTL suite (plan 158 §5 TASK-291-J, §9 list E).
 *
 * ALL move interactions are KEYBOARD-ONLY — there is not a single pointer drag in
 * here, by design: jsdom has no layout (`getBoundingClientRect()` returns zeros),
 * so dnd-kit's collision detection cannot run (§1/§3.2). Pointer correctness rests
 * on the pointer path sharing ONE `applyMove()` reducer with the keyboard path,
 * pinned by the projection fixture table in `shared/lib/sortable-tree`.
 *
 * The two exceptions to "keyboard only" are deliberate and are NOT move
 * interactions: `fireEvent.click` on a twisty (an expand/collapse control — the
 * only way to collapse an ancestor WITHOUT first focusing it, which is exactly
 * what the §7.5 "collapse with focus inside" rule is about) and on a menu item.
 */

import { http, HttpResponse, delay } from "msw";
import {
  act,
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
import { getCategoryControllerGetAdminTreeQueryKey } from "@/entities/category";
import { AdminCategoryTree } from "./admin-category-tree";
import {
  EXPANDED_STORAGE_KEY,
  pointerAnnouncements,
} from "./admin-category-tree";

/* ─────────────────────────────── fixtures ──────────────────────────────── */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // Аксесуари (root, 2 children)
const A1 = "a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; //   Чохли (has 1 child)
const A1A = "a1a1aaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; //     Силіконові
const A2 = "a2aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; //   Скло
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // Кабелі (root)
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // Зарядки (root)

const NAMES: Record<string, string> = {
  [A]: "Аксесуари",
  [A1]: "Чохли",
  [A1A]: "Силіконові",
  [A2]: "Скло",
  [B]: "Кабелі",
  [C]: "Зарядки",
};

interface Node {
  id: string;
  parentId: string | null;
  depth: number;
  children: Node[];
}

function node(
  id: string,
  parentId: string | null,
  depth: number,
  children: Node[] = [],
): Node {
  return { id, parentId, depth, children };
}

/** Default shape: A(A1(A1A), A2), B, C. */
const DEFAULT_ROOTS = (): Node[] => [
  node(A, null, 1, [node(A1, A, 2, [node(A1A, A1, 3)]), node(A2, A, 2)]),
  node(B, null, 1),
  node(C, null, 1),
];

/** The nested `AdminCategoryTreeNodeEntity[]` the admin tree endpoint returns. */
function treeResponse(roots: Node[] = DEFAULT_ROOTS()) {
  const toEntity = (n: Node, sortOrder: number): unknown => ({
    id: n.id,
    name: NAMES[n.id],
    slug: n.id.slice(0, 4),
    description: null,
    image: null,
    isActive: true,
    sortOrder,
    metaTitle: null,
    metaDescription: null,
    updatedAt: "2026-07-01T00:00:00.000Z",
    parentId: n.parentId,
    productCount: 0,
    depth: n.depth,
    children: n.children.map((child, i) => toEntity(child, i)),
  });

  return { data: roots.map((root, i) => toEntity(root, i)) };
}

/* ────────────────────────────── environment ────────────────────────────── */

const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/categories",
  useSearchParams: () => mockSearchParams,
}));

/** Every PATCH body the widget sent, in order. */
let bodies: unknown[] = [];

function mockReorder(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json(treeResponse()),
) {
  server.use(
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json(treeResponse()),
    ),
    http.patch("*/api/admin/categories/reorder", async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
}

beforeEach(() => {
  resetReorderLock();
  bodies = [];
  mockPush.mockClear();
  mockSearchParams = new URLSearchParams("");
  window.localStorage.clear();
});

/* ─────────────────────────────── DOM helpers ───────────────────────────── */

const rowEl = (id: string): HTMLTableRowElement => {
  const el = document.getElementById(`cat-row-${id}`);
  if (!el) throw new Error(`row ${NAMES[id] ?? id} is not rendered`);
  return el as HTMLTableRowElement;
};

const dataRows = (): HTMLTableRowElement[] =>
  Array.from(document.querySelectorAll<HTMLTableRowElement>("tr[aria-level]"));

const visibleIds = (): string[] =>
  dataRows().map((r) => (r.id ?? "").replace("cat-row-", ""));

const polite = () => screen.getByTestId("tree-live-polite").textContent ?? "";
const assertive = () =>
  screen.getByTestId("tree-live-assertive").textContent ?? "";

async function renderTree() {
  const result = renderWithProviders(<AdminCategoryTree />);
  await screen.findByRole("treegrid");
  await waitFor(() => expect(dataRows().length).toBeGreaterThan(0));
  return result;
}

/**
 * The §7.1 / §10 ARIA invariants, re-derived from the DOM alone and asserted
 * after EVERY case (including after a search and after a collapse):
 *
 * - `aria-level` / `aria-posinset` / `aria-setsize` agree with the row order;
 * - a row WITHOUT `aria-expanded` (a leaf) never has visible children, and a row
 *   with `aria-expanded="true"` always does;
 * - EXACTLY ONE row owns `tabIndex === 0` (the roving-tabindex invariant);
 * - no deprecated `aria-grabbed`/`aria-dropeffect`, no row `aria-roledescription`.
 */
function assertAriaInvariants() {
  const rows = dataRows();
  const levels = rows.map((r) => Number(r.getAttribute("aria-level")));

  // Parent of row i = the last preceding row with a SHALLOWER level.
  const parentIndex = rows.map((_, i) => {
    for (let j = i - 1; j >= 0; j -= 1) {
      if (levels[j] < levels[i]) return j;
    }
    return -1;
  });

  rows.forEach((row, i) => {
    const siblings = rows
      .map((_, j) => j)
      .filter(
        (j) => levels[j] === levels[i] && parentIndex[j] === parentIndex[i],
      );
    expect(row.getAttribute("aria-posinset")).toBe(
      String(siblings.indexOf(i) + 1),
    );
    expect(row.getAttribute("aria-setsize")).toBe(String(siblings.length));

    const hasVisibleChild = levels[i + 1] === levels[i] + 1;
    const expandedAttr = row.getAttribute("aria-expanded");
    if (expandedAttr === "true") expect(hasVisibleChild).toBe(true);
    else expect(hasVisibleChild).toBe(false);

    expect(row).not.toHaveAttribute("aria-grabbed");
    expect(row).not.toHaveAttribute("aria-dropeffect");
    expect(row).not.toHaveAttribute("aria-roledescription");
  });

  expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
}

/* ──────────────────────────────── the suite ────────────────────────────── */

describe("AdminCategoryTree — ARIA model (§7.1)", () => {
  it("renders a treegrid whose rows carry authored level/posinset/setsize, with aria-expanded on PARENT rows only", async () => {
    mockReorder();
    await renderTree();

    // Default expanded state: roots expanded, level 2 collapsed (§3.11).
    expect(visibleIds()).toEqual([A, A1, A2, B, C]);

    expect(rowEl(A)).toHaveAttribute("aria-level", "1");
    expect(rowEl(A)).toHaveAttribute("aria-posinset", "1");
    expect(rowEl(A)).toHaveAttribute("aria-setsize", "3");
    expect(rowEl(A)).toHaveAttribute("aria-expanded", "true");

    // A1 HAS a child (collapsed) → aria-expanded="false".
    expect(rowEl(A1)).toHaveAttribute("aria-expanded", "false");
    // A2 / B / C are leaves → NO aria-expanded at all.
    expect(rowEl(A2)).not.toHaveAttribute("aria-expanded");
    expect(rowEl(B)).not.toHaveAttribute("aria-expanded");

    const grid = screen.getByRole("treegrid");
    expect(grid).toHaveAttribute("aria-busy", "false");
    expect(grid).toHaveAttribute(
      "aria-describedby",
      "cat-tree-instructions-long",
    );
    expect(rowEl(A)).toHaveAttribute(
      "aria-describedby",
      "cat-tree-instructions-short",
    );
    expect(
      document.getElementById("cat-tree-instructions-long")?.textContent,
    ).toBe(dict.reorderTree.instructionsLong);
    expect(
      document.getElementById("cat-tree-instructions-short")?.textContent,
    ).toBe(dict.reorderTree.instructionsShort);

    assertAriaInvariants();
  });

  it("renders EXACTLY two live regions, both EMPTY on mount", async () => {
    mockReorder();
    await renderTree();

    expect(document.querySelectorAll("[aria-live]")).toHaveLength(2);
    expect(polite()).toBe("");
    expect(assertive()).toBe("");
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — keyboard moves (§7.2)", () => {
  it("keyboard REORDER sends the exact request body and announces exactly one message per action", async () => {
    mockReorder();
    await renderTree();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(polite()).toBe(
      dict.reorderTree.announce.grabbedRoot("Кабелі", 2, 3),
    );
    expect(assertive()).toBe("");
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "true");

    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(polite()).toBe(dict.reorderTree.announce.movedRoot("Кабелі", 1, 3));
    expect(visibleIds()).toEqual([B, A, A1, A2, C]);
    expect(bodies).toHaveLength(0); // nothing committed yet

    fireEvent.keyDown(rowEl(B), { key: "Enter" });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      groups: [{ parentId: null, orderedIds: [B, A, C] }],
    });
    await waitFor(() => expect(polite()).toContain(dict.categories.tree.undo));
    assertAriaInvariants();
  });

  it("keyboard REPARENT sends BOTH buckets and recomputes level/posinset/setsize on both lists", async () => {
    mockReorder();
    await renderTree();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    fireEvent.keyDown(rowEl(B), { key: "ArrowRight" }); // indent under Аксесуари

    // Кабелі: root (level 1, 2 of 3) → child of Аксесуари (level 2, 3 of 3).
    expect(rowEl(B)).toHaveAttribute("aria-level", "2");
    expect(rowEl(B)).toHaveAttribute("aria-posinset", "3");
    expect(rowEl(B)).toHaveAttribute("aria-setsize", "3");
    // The SOURCE list is recomputed too — Зарядки is now 2 of 2 at the root.
    expect(rowEl(C)).toHaveAttribute("aria-level", "1");
    expect(rowEl(C)).toHaveAttribute("aria-posinset", "2");
    expect(rowEl(C)).toHaveAttribute("aria-setsize", "2");
    expect(polite()).toBe(
      dict.reorderTree.announce.indented("Кабелі", "Аксесуари", 3, 3, 2),
    );
    assertAriaInvariants();

    fireEvent.keyDown(rowEl(B), { key: " " }); // commit

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      groups: [
        { parentId: null, orderedIds: [A, C] },
        { parentId: A, orderedIds: [A1, A2, B] },
      ],
    });
    assertAriaInvariants();
  });

  it("MENU ⇄ KEYBOARD PARITY: «Перемістити вгору» produces the byte-identical body that Alt+Shift+ArrowUp does", async () => {
    mockReorder();
    const first = await renderTree();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), {
      key: "ArrowUp",
      altKey: true,
      shiftKey: true,
    });
    await waitFor(() => expect(bodies).toHaveLength(1));
    const fromKeyboard = bodies[0];

    first.unmount();
    bodies = [];
    resetReorderLock();

    await renderTree();
    // Keyboard-only, end to end: Shift+F10 opens the row's "Дії" menu (§7.2) and
    // Radix moves focus to the first item; Enter activates it.
    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: "F10", shiftKey: true });
    const item = await screen.findByRole("menuitem", {
      name: dict.categories.tree.moveUp,
    });
    fireEvent.keyDown(item, { key: "Enter" });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual(fromKeyboard);
    expect(fromKeyboard).toEqual({
      groups: [{ parentId: null, orderedIds: [B, A, C] }],
    });
  });

  it("Alt+Shift+←/→ are handled; bare Alt+←/→ are NOT bound (browser Back/Forward)", async () => {
    mockReorder();
    await renderTree();

    // Bare Alt+arrow: not preventDefault-ed, no move, no request.
    rowEl(A2).focus();
    expect(
      fireEvent.keyDown(rowEl(A2), { key: "ArrowLeft", altKey: true }),
    ).toBe(true);
    expect(
      fireEvent.keyDown(rowEl(A2), { key: "ArrowRight", altKey: true }),
    ).toBe(true);
    expect(visibleIds()).toEqual([A, A1, A2, B, C]);
    expect(bodies).toHaveLength(0);

    // Alt+Shift+ArrowRight: indent Скло under Чохли — handled, committed.
    expect(
      fireEvent.keyDown(rowEl(A2), {
        key: "ArrowRight",
        altKey: true,
        shiftKey: true,
      }),
    ).toBe(false);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      groups: [
        { parentId: A, orderedIds: [A1] },
        { parentId: A1, orderedIds: [A1A, A2] },
      ],
    });
    assertAriaInvariants();
  });

  it("Escape CANCELS: order restored, focus back on the row, ZERO network calls", async () => {
    mockReorder();
    await renderTree();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(visibleIds()).toEqual([B, A, A1, A2, C]);

    fireEvent.keyDown(rowEl(B), { key: "Escape" });

    expect(visibleIds()).toEqual([A, A1, A2, B, C]);
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "false");
    expect(rowEl(B)).toHaveFocus();
    expect(polite()).toBe(
      dict.reorderTree.announce.cancelled("Кабелі", 2, 3, dict.categories.root),
    );
    expect(bodies).toHaveLength(0);
    assertAriaInvariants();
  });

  it("focus FOLLOWS THE NODE after every move-mode step", async () => {
    mockReorder();
    await renderTree();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });

    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(rowEl(B)).toHaveFocus();
    expect(visibleIds()[0]).toBe(B);

    fireEvent.keyDown(rowEl(B), { key: "ArrowDown" });
    expect(rowEl(B)).toHaveFocus();

    fireEvent.keyDown(rowEl(B), { key: "End" });
    expect(rowEl(B)).toHaveFocus();
    expect(visibleIds()[visibleIds().length - 1]).toBe(B);
    assertAriaInvariants();
  });

  it("Tab is swallowed mid-move and announced", async () => {
    mockReorder();
    await renderTree();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    expect(fireEvent.keyDown(rowEl(B), { key: "Tab" })).toBe(false);
    expect(polite()).toBe(dict.reorderTree.announce.tabBlocked);
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "true");
    assertAriaInvariants();
  });

  it("boundary refusals are announced, never silent", async () => {
    mockReorder();
    await renderTree();

    rowEl(A).focus();
    fireEvent.keyDown(rowEl(A), { key: " " });
    fireEvent.keyDown(rowEl(A), { key: "ArrowUp" });
    expect(polite()).toBe(dict.reorderTree.announce.atTop);
    fireEvent.keyDown(rowEl(A), { key: "ArrowRight" });
    expect(polite()).toBe(dict.reorderTree.announce.cannotIndentNoSibling);
    fireEvent.keyDown(rowEl(A), { key: "ArrowLeft" });
    expect(polite()).toBe(dict.reorderTree.announce.cannotOutdentRoot);
    expect(bodies).toHaveLength(0);
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — illegal targets (§7.2)", () => {
  it("the grabbed node's own subtree is aria-disabled and is never a landing slot for ArrowDown", async () => {
    mockReorder();
    await renderTree();

    rowEl(A).focus();
    fireEvent.keyDown(rowEl(A), { key: " " });

    // subtree(Аксесуари) — its own descendants can never receive it.
    expect(rowEl(A1)).toHaveAttribute("aria-disabled", "true");
    expect(rowEl(A2)).toHaveAttribute("aria-disabled", "true");
    expect(rowEl(B)).not.toHaveAttribute("aria-disabled");

    // ArrowDown walks SIBLINGS only — the node lands after Кабелі, never inside
    // its own (aria-disabled) subtree, and never changes level.
    fireEvent.keyDown(rowEl(A), { key: "ArrowDown" });
    expect(visibleIds()).toEqual([B, A, A1, A2, C]);
    expect(rowEl(A)).toHaveAttribute("aria-level", "1");
    expect(rowEl(A)).toHaveAttribute("aria-posinset", "2");
    expect(rowEl(A1)).toHaveAttribute("aria-level", "2");
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — expand / collapse (§7.5, §3.11)", () => {
  it("collapsing an ancestor of the focused row focuses the ANCESTOR, not document.body", async () => {
    mockReorder();
    await renderTree();

    // Expand Чохли so Силіконові is visible, then put the roving focus on it.
    rowEl(A1).focus();
    fireEvent.keyDown(rowEl(A1), { key: "ArrowRight" }); // expand
    await waitFor(() => expect(visibleIds()).toContain(A1A));
    fireEvent.keyDown(rowEl(A1), { key: "ArrowRight" }); // focus first child
    expect(rowEl(A1A)).toHaveFocus();
    assertAriaInvariants();

    // Collapse the GRANDPARENT via its twisty, WITHOUT focusing it first — this
    // is the only way to reach §7.5's "collapse an ancestor of the focused row".
    fireEvent.click(
      within(rowEl(A)).getByRole("button", {
        name: dict.categories.tree.collapseRow("Аксесуари"),
      }),
    );

    expect(document.activeElement).not.toBe(document.body);
    expect(rowEl(A)).toHaveFocus();
    expect(visibleIds()).toEqual([A, B, C]);
    assertAriaInvariants();
  });

  it("persists the expanded set to localStorage", async () => {
    mockReorder();
    await renderTree();

    rowEl(A1).focus();
    fireEvent.keyDown(rowEl(A1), { key: "ArrowRight" });

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(EXPANDED_STORAGE_KEY) ?? "[]",
      ) as string[];
      expect(stored).toContain(A1);
    });
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — search filter (§3.11)", () => {
  it("shows matches with their ancestors, LOCKS every move affordance and announces the lock", async () => {
    mockSearchParams = new URLSearchParams("search=Силіконові");
    mockReorder();
    await renderTree();

    // Match + auto-expanded ancestor chain only.
    expect(visibleIds()).toEqual([A, A1, A1A]);
    await waitFor(() =>
      expect(polite()).toBe(dict.reorderTree.announce.searchLocked),
    );

    // The drag handle is aria-disabled — DnD is off while the visible order is
    // not the real sibling order.
    const handle = within(rowEl(A1A)).getByRole("button", {
      name: dict.reorderTree.handleLabel("Силіконові"),
    });
    expect(handle).toHaveAttribute("aria-disabled", "true");

    // …and so is every keyboard move.
    rowEl(A1A).focus();
    fireEvent.keyDown(rowEl(A1A), {
      key: "ArrowUp",
      altKey: true,
      shiftKey: true,
    });
    fireEvent.keyDown(rowEl(A1A), { key: " " });
    expect(polite()).toBe(dict.reorderTree.announce.searchLocked);
    expect(rowEl(A1A)).toHaveAttribute("data-grabbed", "false");
    expect(bodies).toHaveLength(0);
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — server rejections (§7.3, §7.5)", () => {
  async function moveAndFail(status: number, error: string) {
    mockReorder(() =>
      HttpResponse.json(
        { statusCode: status, error, message: "x" },
        { status },
      ),
    );
    await renderTree();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), {
      key: "ArrowUp",
      altKey: true,
      shiftKey: true,
    });
    await waitFor(() => expect(bodies).toHaveLength(1));
  }

  it("400 CATEGORY_CYCLE → assertive alert, FULL rollback, focus back on the moved row", async () => {
    await moveAndFail(400, "CATEGORY_CYCLE");

    await waitFor(() =>
      expect(assertive()).toBe(
        dict.reorderTree.rejected.CATEGORY_CYCLE(
          "Кабелі",
          dict.categories.root,
        ),
      ),
    );
    // Rollback: the optimistic override is dropped, the server order is back.
    await waitFor(() => expect(visibleIds()).toEqual([A, A1, A2, B, C]));
    expect(rowEl(B)).toHaveFocus();
    assertAriaInvariants();
  });

  it("400 CATEGORY_NOT_FOUND → the mapped Ukrainian string", async () => {
    await moveAndFail(400, "CATEGORY_NOT_FOUND");

    await waitFor(() =>
      expect(assertive()).toBe(
        dict.reorderTree.rejected.CATEGORY_NOT_FOUND("Кабелі"),
      ),
    );
    assertAriaInvariants();
  });

  it("an UNKNOWN error code → the rejectedUnknown fallback (never empty, never English)", async () => {
    await moveAndFail(400, "SOMETHING_THE_CLIENT_HAS_NEVER_HEARD_OF");

    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderTree.rejectedUnknown("Кабелі")),
    );
    expect(assertive()).not.toBe("");
    assertAriaInvariants();
  });

  it("409 CATEGORY_TREE_STALE → assertive conflict, refetch, re-focus, then the new position politely", async () => {
    await moveAndFail(409, "CATEGORY_TREE_STALE");

    await waitFor(() =>
      expect(assertive()).toBe(dict.reorderTree.rejected.CATEGORY_TREE_STALE),
    );
    // Refetched → re-focused → the operator's node reads out its NEW position.
    await waitFor(() => expect(rowEl(B)).toHaveFocus());
    await waitFor(() =>
      expect(polite()).toBe(
        dict.reorderTree.announce.positionAfterConflict(
          "Кабелі",
          2,
          3,
          1,
          null,
        ),
      ),
    );
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — single in-flight PATCH (§3.11)", () => {
  it("a second move while a PATCH is pending fires NO second call, announces busy, and the grid is aria-busy", async () => {
    mockReorder(async () => {
      await delay(200);
      return HttpResponse.json(treeResponse());
    });
    await renderTree();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), {
      key: "ArrowUp",
      altKey: true,
      shiftKey: true,
    });

    await waitFor(() =>
      expect(screen.getByRole("treegrid")).toHaveAttribute("aria-busy", "true"),
    );
    await waitFor(() =>
      expect(polite()).toBe(dict.reorderTree.announce.saving),
    );

    // A DIFFERENT, individually-legal move while the first is still saving.
    rowEl(C).focus();
    fireEvent.keyDown(rowEl(C), {
      key: "ArrowUp",
      altKey: true,
      shiftKey: true,
    });
    expect(polite()).toBe(dict.reorderTree.announce.busyRefused);

    await waitFor(() =>
      expect(screen.getByRole("treegrid")).toHaveAttribute(
        "aria-busy",
        "false",
      ),
    );
    expect(bodies).toHaveLength(1);
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — pointer-drag announcements (§7.3)", () => {
  // jsdom has no layout, so a REAL dnd-kit drag cannot run here (§3.2). What
  // CAN be pinned is the announcement callbacks the widget hands to the
  // primitive: they must resolve the row's REAL position, never placeholders.
  const items = [
    { id: A, parentId: null, label: "Аксесуари" },
    { id: A1, parentId: A, label: "Чохли" },
    { id: A1A, parentId: A1, label: "Силіконові" },
    { id: A2, parentId: A, label: "Скло" },
    { id: B, parentId: null, label: "Кабелі" },
    { id: C, parentId: null, label: "Зарядки" },
  ];

  it("droppedNoop names the row's REAL position, size and parent — not 1 of 1 at the root", () => {
    const announce = pointerAnnouncements(items);

    expect(announce.droppedNoop?.(items[3])).toBe(
      dict.reorderTree.announce.committedNoop("Скло", 2, 2, "Аксесуари"),
    );
    expect(announce.droppedNoop?.(items[4])).toBe(
      dict.reorderTree.announce.committedNoop(
        "Кабелі",
        2,
        3,
        dict.categories.root,
      ),
    );
  });

  it("a pointer pick-up and a pointer cancel are announced (never silent)", () => {
    const announce = pointerAnnouncements(items);

    expect(announce.grabbed?.(items[1])).toBe(
      dict.reorderTree.announce.grabbed("Чохли", 1, 2, 2, "Аксесуари"),
    );
    expect(announce.grabbed?.(items[4])).toBe(
      dict.reorderTree.announce.grabbedRoot("Кабелі", 2, 3),
    );
    expect(announce.cancelled?.(items[3])).toBe(
      dict.reorderTree.announce.cancelled("Скло", 2, 2, "Аксесуари"),
    );
  });
});

describe("AdminCategoryTree — row-internal Tab cycle (§7.1, §7.2)", () => {
  it("Tab from the focused row walks ITS controls in DOM order, then leaves the grid", async () => {
    mockReorder();
    await renderTree();

    rowEl(A).focus();
    const row = within(rowEl(A));

    // The selection checkbox is the row's first control in DOM order (TASK-293).
    await userEvent.tab();
    expect(
      row.getByRole("checkbox", {
        name: dict.categories.tree.bulk.selectRow("Аксесуари"),
      }),
    ).toHaveFocus();

    await userEvent.tab();
    expect(
      row.getByRole("button", {
        name: dict.categories.tree.collapseRow("Аксесуари"),
      }),
    ).toHaveFocus();

    await userEvent.tab();
    expect(
      row.getByRole("button", {
        name: dict.reorderTree.handleLabel("Аксесуари"),
      }),
    ).toHaveFocus();

    await userEvent.tab();
    expect(
      row.getByRole("button", { name: dict.statusToggle.categoryDeactivate }),
    ).toHaveFocus();

    await userEvent.tab();
    expect(
      row.getByRole("button", {
        name: dict.categories.tree.actionsLabel("Аксесуари"),
      }),
    ).toHaveFocus();

    // From the last control, Tab LEAVES the grid — it never walks into the
    // controls of the other rows.
    await userEvent.tab();
    const grid = screen.getByRole("treegrid");
    expect(grid.contains(document.activeElement)).toBe(false);
    assertAriaInvariants();
  });

  it("only the roving-tabindex OWNER row's controls are tabbable", async () => {
    mockReorder();
    await renderTree();

    rowEl(A).focus();

    const otherGrip = within(rowEl(B)).getByRole("button", {
      name: dict.reorderTree.handleLabel("Кабелі"),
    });
    const otherMenu = within(rowEl(B)).getByRole("button", {
      name: dict.categories.tree.actionsLabel("Кабелі"),
    });
    expect(otherGrip.tabIndex).toBe(-1);
    expect(otherMenu.tabIndex).toBe(-1);
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — coarse-pointer targets (§7.7)", () => {
  it("the row's «Дії» trigger is ≥44×44 CSS px below `md` (pointer DnD is off there)", async () => {
    mockReorder();
    await renderTree();

    const trigger = within(rowEl(B)).getByRole("button", {
      name: dict.categories.tree.actionsLabel("Кабелі"),
    });
    expect(trigger).toHaveClass("min-h-11", "min-w-11");
    // …and compact again from `md` up, exactly like the grip handle.
    expect(trigger).toHaveClass("md:min-h-0", "md:min-w-0");
  });
});

describe("AdminCategoryTree — focus never falls to document.body (§7.5)", () => {
  it("a search filter that hides the focused row moves focus to the new tabindex owner", async () => {
    mockReorder();
    const view = await renderTree();

    // Focus a row that the upcoming search will NOT match (and whose ancestors
    // it will not match either).
    rowEl(A1).focus();
    fireEvent.keyDown(rowEl(A1), { key: "ArrowRight" }); // expand Чохли
    await waitFor(() => expect(visibleIds()).toContain(A1A));
    fireEvent.keyDown(rowEl(A1), { key: "ArrowRight" }); // focus Силіконові
    expect(rowEl(A1A)).toHaveFocus();

    // The `?search=` param lands (deep link / Back-Forward) — Силіконові
    // unmounts under the focused element.
    mockSearchParams = new URLSearchParams("search=Кабелі");
    view.rerender(<AdminCategoryTree />);

    expect(visibleIds()).toEqual([B]);
    expect(document.activeElement).not.toBe(document.body);
    expect(rowEl(B)).toHaveFocus();
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — server tree replaced under a held grab (§7.5)", () => {
  it("cancels the uncommitted move instead of committing a diff against a tree that no longer exists", async () => {
    mockReorder();
    const view = await renderTree();

    rowEl(B).focus();
    fireEvent.keyDown(rowEl(B), { key: " " });
    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(visibleIds()).toEqual([B, A, A1, A2, C]);
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "true");

    // Another admin's write (or this operator's own status toggle) lands: the
    // admin-tree query is replaced while the row is still held.
    act(() => {
      view.queryClient.setQueryData(
        getCategoryControllerGetAdminTreeQueryKey(),
        treeResponse([
          node(A, null, 1, [
            node(A1, A, 2, [node(A1A, A1, 3)]),
            node(A2, A, 2),
          ]),
          node(C, null, 1),
          node(B, null, 1),
        ]),
      );
    });

    await waitFor(() =>
      expect(polite()).toBe(dict.reorderTree.announce.treeChangedDuringMove),
    );
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "false");
    // The fresh SERVER order renders — not the stale preview.
    expect(visibleIds()).toEqual([A, A1, A2, C, B]);
    expect(bodies).toHaveLength(0);
    assertAriaInvariants();
  });
});

describe("AdminCategoryTree — undo rejection names the undo's TARGET (§7.3)", () => {
  it("a CATEGORY_CYCLE on undo names the parent the undo was restoring to, not the current one", async () => {
    let call = 0;
    server.use(
      http.get("*/api/categories/admin/tree", () =>
        HttpResponse.json(treeResponse()),
      ),
      http.patch("*/api/admin/categories/reorder", async ({ request }) => {
        bodies.push(await request.json());
        call += 1;
        if (call === 1) {
          // The outdent succeeded: Силіконові now sits under Аксесуари.
          return HttpResponse.json(
            treeResponse([
              node(A, null, 1, [
                node(A1, A, 2),
                node(A1A, A, 2),
                node(A2, A, 2),
              ]),
              node(B, null, 1),
              node(C, null, 1),
            ]),
          );
        }
        return HttpResponse.json(
          { statusCode: 400, error: "CATEGORY_CYCLE", message: "x" },
          { status: 400 },
        );
      }),
    );
    await renderTree();

    // Outdent Силіконові out of Чохли, then undo it.
    rowEl(A1).focus();
    fireEvent.keyDown(rowEl(A1), { key: "ArrowRight" }); // expand
    await waitFor(() => expect(visibleIds()).toContain(A1A));
    rowEl(A1A).focus();
    fireEvent.keyDown(rowEl(A1A), {
      key: "ArrowLeft",
      altKey: true,
      shiftKey: true,
    });
    await waitFor(() => expect(bodies).toHaveLength(1));

    const undo = await screen.findByRole("button", {
      name: dict.categories.tree.undo,
    });
    await waitFor(() => expect(undo).toHaveAttribute("aria-disabled", "false"));
    fireEvent.click(undo);

    await waitFor(() => expect(bodies).toHaveLength(2));
    // The undo aimed Силіконові back under „Чохли“ — NOT under „Аксесуари“,
    // where the original move left it.
    await waitFor(() =>
      expect(assertive()).toBe(
        dict.reorderTree.rejected.CATEGORY_CYCLE("Силіконові", "Чохли"),
      ),
    );
  });
});

describe("AdminCategoryTree — key-repeat suppression (§7.3)", () => {
  it("a HELD arrow announces only the SETTLED position, after the 150 ms idle", async () => {
    mockReorder();
    await renderTree();

    jest.useFakeTimers();
    try {
      rowEl(C).focus();
      fireEvent.keyDown(rowEl(C), { key: " " });
      expect(polite()).toBe(
        dict.reorderTree.announce.grabbedRoot("Зарядки", 3, 3),
      );

      // Held key: the intermediate step is SUPPRESSED — the region still shows
      // the pick-up message, not the intermediate position.
      fireEvent.keyDown(rowEl(C), { key: "ArrowUp", repeat: true });
      expect(polite()).toBe(
        dict.reorderTree.announce.grabbedRoot("Зарядки", 3, 3),
      );

      fireEvent.keyDown(rowEl(C), { key: "ArrowUp", repeat: true });
      act(() => {
        jest.advanceTimersByTime(160);
      });

      // Only the settled position is spoken.
      expect(polite()).toBe(
        dict.reorderTree.announce.movedRoot("Зарядки", 1, 3),
      );
      expect(visibleIds()[0]).toBe(C);
    } finally {
      jest.useRealTimers();
    }
    assertAriaInvariants();
  });
});

/* ───────────────── multi-select + bulk status (TASK-293) ───────────────── */

const bulkBodies: unknown[] = [];

/**
 * The bulk endpoint returns the FULL refreshed tree, exactly as the real one does —
 * so a successful PATCH must resync the grid from the response alone.
 */
function mockBulkStatus(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json(treeResponse()),
) {
  server.use(
    http.patch("*/api/admin/categories/status", async ({ request }) => {
      bulkBodies.push(await request.json());
      return respond();
    }),
  );
}

const bulkDict = dict.categories.tree.bulk;

const checkboxOf = (id: string): HTMLElement =>
  within(rowEl(id)).getByRole("checkbox", {
    name: bulkDict.selectRow(NAMES[id]),
  });

describe("AdminCategoryTree — multi-select + bulk status (TASK-293)", () => {
  beforeEach(() => {
    bulkBodies.length = 0;
  });

  it("declares itself multi-selectable and marks every row's selection state", async () => {
    mockReorder();
    await renderTree();

    expect(screen.getByRole("treegrid")).toHaveAttribute(
      "aria-multiselectable",
      "true",
    );
    expect(rowEl(A)).toHaveAttribute("aria-selected", "false");

    await userEvent.click(checkboxOf(A));

    expect(rowEl(A)).toHaveAttribute("aria-selected", "true");
    expect(polite()).toBe(bulkDict.announce.selected("Аксесуари", 1));
    assertAriaInvariants();
  });

  // The key-collision regression: bare `Space` is "pick the row up" and MUST stay
  // that way — selection lives on `Ctrl+Space`.
  it("selects on Ctrl+Space, and leaves bare Space as pick-up", async () => {
    mockReorder();
    await renderTree();

    rowEl(B).focus();
    await userEvent.keyboard("{Control>} {/Control}");

    expect(rowEl(B)).toHaveAttribute("aria-selected", "true");
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "false");

    await userEvent.keyboard(" ");
    expect(rowEl(B)).toHaveAttribute("data-grabbed", "true");
    expect(polite()).toContain(
      dict.reorderTree.announce.grabbedRoot("Кабелі", 2, 3),
    );
  });

  it("Shift+ArrowDown selects a contiguous range and moves focus with it", async () => {
    mockReorder();
    await renderTree();

    // Visible: A, A1, A2, B, C (A1A is under a collapsed A1).
    rowEl(A).focus();
    await userEvent.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}");

    expect(rowEl(A)).toHaveAttribute("aria-selected", "true");
    expect(rowEl(A1)).toHaveAttribute("aria-selected", "true");
    expect(rowEl(A2)).toHaveAttribute("aria-selected", "true");
    expect(rowEl(B)).toHaveAttribute("aria-selected", "false");
    expect(rowEl(A2)).toHaveFocus();
    assertAriaInvariants();
  });

  it("select-all is indeterminate on a partial selection and clears when already full", async () => {
    mockReorder();
    await renderTree();

    const selectAll = screen.getByRole("checkbox", {
      name: bulkDict.selectAll,
    });
    expect(selectAll).toHaveAttribute("data-state", "unchecked");

    await userEvent.click(checkboxOf(A));
    expect(selectAll).toHaveAttribute("data-state", "indeterminate");

    await userEvent.click(selectAll);
    expect(selectAll).toHaveAttribute("data-state", "checked");
    expect(rowEl(C)).toHaveAttribute("aria-selected", "true");

    await userEvent.click(selectAll);
    expect(rowEl(A)).toHaveAttribute("aria-selected", "false");
    expect(rowEl(C)).toHaveAttribute("aria-selected", "false");
  });

  it("sends ONE PATCH with every selected id and clears the selection on success", async () => {
    mockReorder();
    mockBulkStatus();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderTree();

    await userEvent.click(checkboxOf(A));
    await userEvent.click(checkboxOf(B));

    await userEvent.click(
      screen.getByRole("button", { name: bulkDict.deactivate(2) }),
    );

    await waitFor(() => expect(bulkBodies).toHaveLength(1));
    expect(bulkBodies[0]).toEqual({ ids: [A, B], isActive: false });

    await waitFor(() =>
      expect(rowEl(A)).toHaveAttribute("aria-selected", "false"),
    );
    expect(
      screen.queryByRole("button", { name: bulkDict.deactivate(2) }),
    ).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("cancelling the blast-radius confirmation fires ZERO mutations", async () => {
    mockReorder();
    mockBulkStatus();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    await renderTree();

    await userEvent.click(checkboxOf(A));
    await userEvent.click(
      screen.getByRole("button", { name: bulkDict.deactivate(1) }),
    );

    expect(confirmSpy).toHaveBeenCalledWith(bulkDict.deactivateConfirm(1));
    expect(bulkBodies).toHaveLength(0);
    // The selection survives a cancel — the operator did not lose their work.
    expect(rowEl(A)).toHaveAttribute("aria-selected", "true");

    confirmSpy.mockRestore();
  });

  it("activating asks for no confirmation (nothing is hidden by it)", async () => {
    mockReorder();
    mockBulkStatus();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderTree();

    await userEvent.click(checkboxOf(A));
    await userEvent.click(
      screen.getByRole("button", { name: bulkDict.activate(1) }),
    );

    await waitFor(() => expect(bulkBodies).toHaveLength(1));
    expect(bulkBodies[0]).toEqual({ ids: [A], isActive: true });
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("announces a failed bulk write assertively and keeps the selection", async () => {
    mockReorder();
    mockBulkStatus(() =>
      HttpResponse.json({ message: "boom" }, { status: 500 }),
    );
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    await renderTree();

    await userEvent.click(checkboxOf(A));
    await userEvent.click(
      screen.getByRole("button", { name: bulkDict.deactivate(1) }),
    );

    await waitFor(() => expect(assertive()).toBe(bulkDict.announce.failed));
    expect(rowEl(A)).toHaveAttribute("aria-selected", "true");

    confirmSpy.mockRestore();
  });
});
