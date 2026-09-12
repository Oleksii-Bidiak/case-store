import { render, screen } from "@testing-library/react";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
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
 */

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
