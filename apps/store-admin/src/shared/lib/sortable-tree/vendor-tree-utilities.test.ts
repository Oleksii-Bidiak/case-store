import { fixtureTree } from "./fixtures";
import { toNested, depthClampFor } from "./projection";
import {
  buildTree,
  flattenTree,
  getProjection,
  removeChildrenOf,
} from "./vendor-tree-utilities";

describe("vendored dnd-kit tree utilities", () => {
  describe("flattenTree / buildTree", () => {
    it("round-trips a nested tree", () => {
      const nested = toNested(fixtureTree);
      const flattened = flattenTree(nested);

      expect(
        flattened.map((i) => [i.id, i.parentId, i.depth, i.index]),
      ).toEqual([
        ["a", null, 0, 0],
        ["a1", "a", 1, 0],
        ["a2", "a", 1, 1],
        ["a2x", "a2", 2, 0],
        ["b", null, 0, 1],
        ["b1", "b", 1, 0],
      ]);

      // buildTree(flattenTree(x)) === x, structurally.
      const rebuilt = buildTree(flattened);
      const strip = (nodes: { id: string; children: unknown[] }[]): unknown =>
        nodes.map((n) => ({
          id: n.id,
          children: strip(n.children as { id: string; children: [] }[]),
        }));
      expect(strip(rebuilt)).toEqual(strip(nested));
    });
  });

  describe("removeChildrenOf", () => {
    it("drops the whole subtree of the dragged node", () => {
      const flattened = flattenTree(toNested(fixtureTree));
      expect(removeChildrenOf(flattened, ["a"]).map((i) => i.id)).toEqual([
        "a",
        "b",
        "b1",
      ]);
      expect(removeChildrenOf(flattened, ["a2"]).map((i) => i.id)).toEqual([
        "a",
        "a1",
        "a2",
        "b",
        "b1",
      ]);
    });
  });

  describe("getProjection depth clamping", () => {
    // Drag list while `a2` (height 2) is active: its child `a2x` is removed.
    const listForA2 = () =>
      removeChildrenOf(flattenTree(toNested(fixtureTree)), ["a2"]);

    it("clamps to maxDepth derived from the previous row", () => {
      // Hovering itself, dragged far right: max is previousItem(a1).depth + 1 = 2.
      const p = getProjection(listForA2(), "a2", "a2", 500, 24);
      expect(p.maxDepth).toBe(2);
      expect(p.depth).toBe(2);
      expect(p.parentId).toBe("a1");
    });

    it("clamps to minDepth derived from the next row", () => {
      // Hovering `a1` dragged far left: next row (a1 after the move) sits at depth 1.
      const p = getProjection(listForA2(), "a2", "a1", -500, 24);
      expect(p.minDepth).toBe(1);
      expect(p.depth).toBe(1);
      expect(p.parentId).toBe("a");
    });

    it("honours the absolute maxDepthClamp (our addition) over the neighbour-derived max", () => {
      // `a` has height 3 ⇒ clamp = 4 − 3 = 1 (0-based) ⇒ it may never go below level 2.
      const listForA = removeChildrenOf(flattenTree(toNested(fixtureTree)), [
        "a",
      ]);
      const clamp = depthClampFor(fixtureTree, "a");
      expect(clamp).toBe(1);

      // Two indent steps right: without the clamp this projects a drop UNDER b1.
      const unclamped = getProjection(listForA, "a", "b1", 48, 24);
      expect(unclamped.depth).toBe(2); // level 3 + height 3 − 1 = 5 ✗
      expect(unclamped.parentId).toBe("b1");

      const clamped = getProjection(listForA, "a", "b1", 48, 24, clamp);
      expect(clamped.depth).toBe(1);
      expect(clamped.parentId).toBe("b");
    });

    it("flat mode (maxLevels = 1) makes depth projection unreachable", () => {
      const list = flattenTree(toNested(fixtureTree));
      for (const over of list) {
        for (const offset of [-100, -24, 0, 24, 100, 1000]) {
          const p = getProjection(list, "b1", over.id, offset, 24, 0);
          expect(p.depth).toBe(0);
          expect(p.parentId).toBeNull();
        }
      }
    });
  });
});
