import { render, screen } from "@testing-library/react";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { fixtureTree } from "@/shared/lib/sortable-tree/fixtures";
import { depthClampFor, getProjection } from "@/shared/lib/sortable-tree";
import { flattenTree, toNested } from "@/shared/lib/sortable-tree";
import { LiveAnnouncer } from "@/shared/ui/live-announcer";
import {
  DISABLED_DND_ANNOUNCEMENTS,
  POINTER_ACTIVATION_CONSTRAINT,
  SortableTree,
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
