import { act, render, screen } from "@testing-library/react";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import type { TreeItem } from "@/shared/lib/sortable-tree";
import { fixtureTree } from "@/shared/lib/sortable-tree/fixtures";
import { depthClampFor, getProjection } from "@/shared/lib/sortable-tree";
import { flattenTree, toNested } from "@/shared/lib/sortable-tree";
import { LiveAnnouncer } from "@/shared/ui/live-announcer";
import { removeChildrenOf } from "@/shared/lib/sortable-tree";
import {
  DISABLED_DND_ANNOUNCEMENTS,
  POINTER_ACTIVATION_CONSTRAINT,
  SortableTree,
  dropHintStyle,
  resolveDropHint,
  resolveModifiers,
  sanitizeSortableAttributes,
} from "./sortable-tree";

/**
 * Note on scope: a pointer DRAG cannot be exercised in jsdom (no layout ⇒
 * dnd-kit's collision detection sees zero-sized rects — plan §1/§3.2). What is
 * asserted here is the configuration that §3.2 makes mandatory, plus the flat-mode
 * collapse. Drag CORRECTNESS is covered by the pure projection→reducer fixture
 * table in `shared/lib/sortable-tree/projection.test.ts`.
 *
 * TASK-578 adds one seam: `DndContext` is wrapped (the REAL one still renders)
 * so a test can hand the component the exact start / move / end events dnd-kit
 * would emit, and check that the drop lands where the painted hint said.
 */

type DndHandler = (event: unknown) => void;
const mockDndProps: {
  current: {
    onDragStart?: DndHandler;
    onDragMove?: DndHandler;
    onDragEnd?: DndHandler;
  } | null;
} = { current: null };

jest.mock("@dnd-kit/core", () => {
  const actual = jest.requireActual("@dnd-kit/core");
  const { createElement } = jest.requireActual("react");
  return {
    ...actual,
    DndContext: (props: Record<string, unknown>) => {
      mockDndProps.current = props;
      return createElement(actual.DndContext, props);
    },
  };
});

const renderTree = (maxDepth = 4, disabled = false) =>
  render(
    <LiveAnnouncer>
      <SortableTree
        items={fixtureTree}
        maxDepth={maxDepth}
        disabled={disabled}
        onMove={() => {}}
        renderRow={({ item, level, setNodeRef, style, handleProps }) => (
          <div
            key={item.id}
            ref={setNodeRef}
            style={style}
            data-testid={`row-${item.id}`}
            data-level={level}
          >
            <button
              type="button"
              {...handleProps}
              aria-label={`Grip ${item.id}`}
            >
              grip
            </button>
            <button type="button">edit {item.id}</button>
          </div>
        )}
      />
    </LiveAnnouncer>,
  );

describe("shared/ui/sortable-tree", () => {
  it("registers a 4px pointer activation constraint and no keyboard sensor", () => {
    expect(POINTER_ACTIVATION_CONSTRAINT).toEqual({ distance: 4 });
  });

  it("disables every dnd-kit built-in announcement", () => {
    for (const announce of Object.values(DISABLED_DND_ANNOUNCEMENTS)) {
      expect(announce()).toBeUndefined();
    }
  });

  it("applies restrictToVerticalAxis ONLY in flat mode (maxDepth === 1)", () => {
    expect(resolveModifiers(1)).toEqual([restrictToVerticalAxis]);
    expect(resolveModifiers(4)).toEqual([]);
    expect(resolveModifiers(2)).toEqual([]);
  });

  it("flat mode makes depth projection unreachable (never deeper than level 1)", () => {
    const rows = flattenTree(toNested(fixtureTree));
    const clamp = depthClampFor(fixtureTree, "b1", 1);
    expect(clamp).toBe(0);

    for (const over of rows) {
      for (const offset of [-500, -24, 0, 24, 500]) {
        const p = getProjection(rows, "b1", over.id, offset, 24, clamp);
        expect(p.depth).toBe(0);
        expect(p.parentId).toBeNull();
      }
    }
  });

  it("sanitizeSortableAttributes drops role / aria-roledescription / aria-describedby", () => {
    expect(
      sanitizeSortableAttributes({
        role: "button",
        "aria-roledescription": "sortable",
        "aria-describedby": "DndContext-0",
        "aria-disabled": false,
        tabIndex: 0,
      }),
    ).toEqual({ "aria-disabled": false, tabIndex: 0 });
  });

  it("renders exactly two live regions — dnd-kit's own region never reaches the document", () => {
    renderTree();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(2);
    expect(screen.getByTestId("tree-live-polite")).toBeEmptyDOMElement();
    expect(screen.getByTestId("tree-live-assertive")).toBeEmptyDOMElement();
    // dnd-kit's HiddenText instructions node is portalled away too.
    expect(document.querySelector("[id^='DndDescribedBy']")).toBeNull();
  });

  it("puts the drag attributes on the GRIP HANDLE only, leaving the row's other buttons clickable", () => {
    renderTree();
    const grip = screen.getByRole("button", { name: "Grip a1" });
    const row = screen.getByTestId("row-a1");

    expect(grip).toHaveAttribute("aria-disabled", "false");
    expect(grip).not.toHaveAttribute("aria-roledescription");
    expect(grip).not.toHaveAttribute("aria-describedby");
    // The row itself carries no drag semantics.
    expect(row).not.toHaveAttribute("aria-roledescription");
    expect(row).not.toHaveAttribute("aria-describedby");
    expect(screen.getByRole("button", { name: "edit a1" })).toBeEnabled();
  });

  it("renders 1-based levels from the tree, and a constant level 1 in flat mode", () => {
    const { unmount } = renderTree(4);
    expect(screen.getByTestId("row-a")).toHaveAttribute("data-level", "1");
    expect(screen.getByTestId("row-a2x")).toHaveAttribute("data-level", "3");
    unmount();

    renderTree(1);
    expect(screen.getByTestId("row-a2x")).toHaveAttribute("data-level", "1");
  });

  it("marks the handle aria-disabled when the tree is disabled", () => {
    renderTree(4, true);
    expect(screen.getByRole("button", { name: "Grip a1" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

/**
 * The live drop hint (TASK-423).
 *
 * Before this, the depth projection existed only inside `handleDragEnd`: during
 * the drag itself "this will become a CHILD of the row above" and "this will sit
 * NEXT to it" looked exactly the same, and the operator found out which one they
 * had asked for only after the PATCH. These cases pin the two apart on the same
 * fixture the projection table uses, so the hint can never promise one outcome
 * while the reducer performs the other.
 *
 * The drag list is the flattened tree minus the dragged node's children —
 * exactly what `handleDragEnd` reconstructs before projecting.
 */
describe("resolveDropHint", () => {
  const dragging = (activeId: string) =>
    removeChildrenOf(flattenTree(toNested(fixtureTree)), [activeId]);

  const CLAMP_B = depthClampFor(fixtureTree, "b", 4);

  it("draws a line under the row above when the depths match", () => {
    // `a1` dropped past the last row (b1, level 2) at its own indent: it becomes
    // b1's SIBLING, so the hint is a line under b1 at the same depth.
    const hint = resolveDropHint(dragging("a1"), "a1", "b1", 0, 24, 3);
    expect(hint).toEqual({ anchorId: "b1", mode: "after", depth: 1 });
  });

  it("nests when ONE indent step to the right takes the projection deeper", () => {
    // The same drop, dragged one step right ⇒ b1 becomes the parent instead of
    // the sibling. Same over-row, same list: only the offset differs, which is
    // exactly the distinction the operator could not see before.
    const hint = resolveDropHint(dragging("a1"), "a1", "b1", 24, 24, 3);
    expect(hint).toEqual({ anchorId: "b1", mode: "nest", depth: 2 });
  });

  it("draws the line on the TOP edge when the drop lands above every row", () => {
    // There is no row above the first one to hang an "after" line under, so the
    // hint moves to the top edge of the row that will follow.
    const hint = resolveDropHint(dragging("b"), "b", "a", 0, 24, CLAMP_B);
    expect(hint?.anchorId).toBe("a");
    expect(hint?.mode).toBe("before");
  });

  it("anchors on the row that will end up ABOVE the drop, not on the hovered row", () => {
    // Dragging `b` up onto a1: after the array move the row above is `a`, and it
    // is `a` the hint must point at — a1 will sit BELOW the dropped row.
    const hint = resolveDropHint(dragging("b"), "b", "a1", 0, 24, CLAMP_B);
    expect(hint?.anchorId).toBe("a");
  });

  it("returns nothing for ids that are not in the drag list", () => {
    expect(resolveDropHint(dragging("b"), "b", "nope", 0, 24, 3)).toBeNull();
    expect(resolveDropHint(dragging("b"), "ghost", "a", 0, 24, 3)).toBeNull();
  });

  it("never offers a NEST in flat mode — the clamp makes nesting unreachable", () => {
    const rows = dragging("b1");
    for (const over of rows) {
      for (const offset of [-500, -24, 0, 24, 500]) {
        const hint = resolveDropHint(rows, "b1", over.id, offset, 24, 0);
        expect(hint?.mode).not.toBe("nest");
        expect(hint?.depth ?? 0).toBe(0);
      }
    }
  });
});

describe("dropHintStyle", () => {
  it("frames the future parent for a nest", () => {
    const style = dropHintStyle({ anchorId: "a", mode: "nest", depth: 1 }, 24);
    expect(style.outline).toBe("2px solid var(--color-primary)");
    expect(style.backgroundImage).toBeUndefined();
  });

  it("indents the insertion line by the PROJECTED depth", () => {
    const style = dropHintStyle({ anchorId: "a", mode: "after", depth: 2 }, 24);
    expect(style.backgroundImage).toContain("transparent 48px");
    expect(style.backgroundImage).toContain("var(--color-primary) 48px");
    expect(style.backgroundPosition).toBe("left bottom");
    expect(style.outline).toBeUndefined();
  });

  it("puts the line on the top edge in `before` mode", () => {
    const style = dropHintStyle(
      { anchorId: "a", mode: "before", depth: 0 },
      24,
    );
    expect(style.backgroundPosition).toBe("left top");
  });

  it("paints with a design token, never a literal colour", () => {
    for (const mode of ["nest", "after", "before"] as const) {
      const style = dropHintStyle({ anchorId: "a", mode, depth: 1 }, 24);
      expect(JSON.stringify(style)).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(JSON.stringify(style)).toContain("var(--color-primary)");
    }
  });
});

/**
 * TASK-578 — «куди показали — туди й упало». The hint and the drop used to run
 * `getProjection` separately (state `overId` vs the end event's `over.id`); now
 * the drop consumes the projection that was painted.
 */
describe("SortableTree — where it hinted is where it landed (TASK-578)", () => {
  const renderDraggable = (onMove: jest.Mock) =>
    render(
      <LiveAnnouncer>
        <SortableTree
          items={fixtureTree}
          maxDepth={4}
          onMove={onMove}
          renderRow={({ item, setNodeRef, style, handleProps }) => (
            <div
              key={item.id}
              ref={setNodeRef}
              style={style}
              data-testid={`row-${item.id}`}
            >
              <button type="button" {...handleProps}>
                grip {item.id}
              </button>
            </div>
          )}
        />
      </LiveAnnouncer>,
    );

  const handlers = () => {
    const current = mockDndProps.current;
    if (!current) throw new Error("DndContext was not rendered");
    return current;
  };
  const start = (id: string) =>
    act(() => handlers().onDragStart?.({ active: { id } }));
  const move = (id: string, overId: string, x: number) =>
    act(() =>
      handlers().onDragMove?.({
        active: { id },
        over: { id: overId },
        delta: { x, y: 0 },
      }),
    );
  const end = (id: string, overId: string) =>
    act(() => handlers().onDragEnd?.({ active: { id }, over: { id: overId } }));

  const parentOf = (next: TreeItem[], id: string) =>
    next.find((item) => item.id === id)?.parentId;

  it("a NEST hint on b1 drops a1 INSIDE b1", async () => {
    const onMove = jest.fn();
    renderDraggable(onMove);

    await start("a1");
    await move("a1", "b1", 24);
    // The hint on screen: b1 framed as the future parent.
    expect(screen.getByTestId("row-b1").style.outline).toBe(
      "2px solid var(--color-primary)",
    );

    await end("a1", "b1");

    expect(onMove).toHaveBeenCalledTimes(1);
    const [, next, movingId] = onMove.mock.calls[0];
    expect(movingId).toBe("a1");
    expect(parentOf(next, "a1")).toBe("b1");
  });

  it("an AFTER line under b1 drops a1 as b1's sibling — even if the end event names another row", async () => {
    const onMove = jest.fn();
    renderDraggable(onMove);

    await start("a1");
    await move("a1", "b1", 0);
    const row = screen.getByTestId("row-b1");
    expect(row.style.backgroundPosition).toBe("left bottom");
    expect(row.style.outline).toBe("");

    // The release event disagrees with the last painted frame. The operator
    // let go on what they were SHOWN, so the painted projection decides.
    await end("a1", "a2");

    expect(onMove).toHaveBeenCalledTimes(1);
    const [, next] = onMove.mock.calls[0];
    expect(parentOf(next, "a1")).toBe("b");
    const order = (next as TreeItem[])
      .filter((item) => item.parentId === "b")
      .map((item) => item.id);
    expect(order).toEqual(["b1", "a1"]);
  });

  it("clears the hint once the drag ends", async () => {
    renderDraggable(jest.fn());

    await start("a1");
    await move("a1", "b1", 24);
    await end("a1", "b1");

    expect(screen.getByTestId("row-b1").style.outline).toBe("");
  });

  it("a release with no painted frame falls back to the end event", async () => {
    const onMove = jest.fn();
    renderDraggable(onMove);

    await start("a1");
    await end("a1", "b1");

    expect(onMove).toHaveBeenCalledTimes(1);
    const [, next] = onMove.mock.calls[0];
    // offset 0 over b1 ⇒ the same answer the AFTER hint above gives.
    expect(parentOf(next, "a1")).toBe("b");
  });
});
