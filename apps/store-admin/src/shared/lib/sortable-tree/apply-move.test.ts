import {
  applyIntent,
  applyMove,
  descendantsOf,
  levelOf,
  subtreeHeight,
} from "./apply-move";
import { deepTree, fixtureTree, shape } from "./fixtures";
import type { MoveIntent } from "./types";

describe("sortable-tree pure reducer", () => {
  describe("helpers", () => {
    it("computes 1-based levels, subtree heights and descendants", () => {
      const levels = levelOf(fixtureTree);
      expect(levels.get("a")).toBe(1);
      expect(levels.get("a2")).toBe(2);
      expect(levels.get("a2x")).toBe(3);

      expect(subtreeHeight(fixtureTree, "a")).toBe(3);
      expect(subtreeHeight(fixtureTree, "a2")).toBe(2);
      expect(subtreeHeight(fixtureTree, "b1")).toBe(1);

      expect([...descendantsOf(fixtureTree, "a")].sort()).toEqual([
        "a1",
        "a2",
        "a2x",
      ]);
      expect([...descendantsOf(fixtureTree, "b1")]).toEqual([]);
    });
  });

  describe("applyMove", () => {
    it("reorders within a bucket and returns depth-first order", () => {
      const next = applyMove(fixtureTree, "a2", {
        targetParentId: "a",
        targetIndex: 0,
      });
      expect(shape(next as never)).toEqual([
        "a<-",
        "a2<a",
        "a2x<a2",
        "a1<a",
        "b<-",
        "b1<b",
      ]);
    });

    it("reparents a node with its whole subtree", () => {
      const next = applyMove(fixtureTree, "a2", {
        targetParentId: "b",
        targetIndex: 0,
      });
      expect(shape(next as never)).toEqual([
        "a<-",
        "a1<a",
        "b<-",
        "a2<b",
        "a2x<a2",
        "b1<b",
      ]);
    });

    it("clamps an out-of-range targetIndex to the end of the bucket", () => {
      const next = applyMove(fixtureTree, "b1", {
        targetParentId: "a",
        targetIndex: 99,
      });
      expect(shape(next as never)).toEqual([
        "a<-",
        "a1<a",
        "a2<a",
        "a2x<a2",
        "b1<a",
        "b<-",
      ]);
    });

    it("refuses a self-parent move", () => {
      expect(
        applyMove(fixtureTree, "a", { targetParentId: "a", targetIndex: 0 }),
      ).toBeNull();
    });

    it("refuses a move into its own descendant (client mirror of the server cycle guard)", () => {
      expect(
        applyMove(fixtureTree, "a", { targetParentId: "a2x", targetIndex: 0 }),
      ).toBeNull();
    });

    it("refuses an unknown node or unknown target parent", () => {
      expect(
        applyMove(fixtureTree, "nope", {
          targetParentId: null,
          targetIndex: 0,
        }),
      ).toBeNull();
      expect(
        applyMove(fixtureTree, "b1", {
          targetParentId: "nope",
          targetIndex: 0,
        }),
      ).toBeNull();
    });

    it("refuses when level + height − 1 exceeds the 4-level cap", () => {
      // `a` (height 3) under `b1` (level 2) ⇒ 3 + 3 − 1 = 5 > 4.
      expect(
        applyMove(fixtureTree, "a", { targetParentId: "b1", targetIndex: 0 }),
      ).toBeNull();
      // …but the same node under `b` (level 1) ⇒ 2 + 3 − 1 = 4 ✓
      expect(
        applyMove(fixtureTree, "a", { targetParentId: "b", targetIndex: 0 }),
      ).not.toBeNull();
    });

    it("honours a tighter maxLevels (flat-list mode refuses any nesting)", () => {
      expect(
        applyMove(
          fixtureTree,
          "b1",
          { targetParentId: "b", targetIndex: 0 },
          1,
        ),
      ).toBeNull();
    });
  });

  describe("applyIntent — keyboard / menu path", () => {
    const run = (id: string, intent: MoveIntent, items = fixtureTree) =>
      applyIntent(items, id, intent);

    it("↑ moves one slot up among siblings", () => {
      const out = run("a2", "up");
      expect(out).toMatchObject({
        kind: "moved",
        point: { targetParentId: "a", targetIndex: 0 },
      });
    });

    it("↓ moves one slot down among siblings", () => {
      const out = run("a1", "down");
      expect(out).toMatchObject({
        kind: "moved",
        point: { targetParentId: "a", targetIndex: 1 },
      });
      if (out.kind !== "moved") throw new Error("unreachable");
      expect(shape(out.items)).toEqual([
        "a<-",
        "a2<a",
        "a2x<a2",
        "a1<a",
        "b<-",
        "b1<b",
      ]);
    });

    it("→ indents under the previous sibling (as its last child)", () => {
      const out = run("a2", "indent");
      expect(out).toMatchObject({
        kind: "moved",
        point: { targetParentId: "a1", targetIndex: 0 },
      });
      if (out.kind !== "moved") throw new Error("unreachable");
      expect(shape(out.items)).toEqual([
        "a<-",
        "a1<a",
        "a2<a1",
        "a2x<a2",
        "b<-",
        "b1<b",
      ]);
    });

    it("← outdents to become the next sibling of its parent", () => {
      const out = run("a2x", "outdent");
      expect(out).toMatchObject({
        kind: "moved",
        point: { targetParentId: "a", targetIndex: 2 },
      });
      if (out.kind !== "moved") throw new Error("unreachable");
      expect(shape(out.items)).toEqual([
        "a<-",
        "a1<a",
        "a2<a",
        "a2x<a",
        "b<-",
        "b1<b",
      ]);
    });

    it("Home / End jump to the first / last sibling slot", () => {
      const first = run("a2", "first");
      expect(first).toMatchObject({
        kind: "moved",
        point: { targetParentId: "a", targetIndex: 0 },
      });
      const last = run("a1", "last");
      expect(last).toMatchObject({
        kind: "moved",
        point: { targetParentId: "a", targetIndex: 1 },
      });
      if (last.kind !== "moved") throw new Error("unreachable");
      expect(shape(last.items)).toEqual([
        "a<-",
        "a2<a",
        "a2x<a2",
        "a1<a",
        "b<-",
        "b1<b",
      ]);
    });

    it.each([
      ["a1", "up", "at-top"],
      ["a1", "first", "at-top"],
      ["a2", "down", "at-bottom"],
      ["a2", "last", "at-bottom"],
      ["a1", "indent", "no-previous-sibling"],
      ["a", "outdent", "at-root"],
      ["a", "up", "at-top"],
    ] as [string, MoveIntent, string][])(
      "boundary no-op: %s + %s → %s",
      (id, intent, reason) => {
        expect(run(id, intent)).toEqual({ kind: "refused", reason });
      },
    );

    it("refuses an indent that would exceed the 4-level cap", () => {
      // c2 (height 3) under c1 (level 2) ⇒ 3 + 3 − 1 = 5 > 4.
      expect(applyIntent(deepTree, "c2", "indent")).toEqual({
        kind: "refused",
        reason: "max-depth",
      });
      // A shorter subtree (g2, height 2) under a level-2 node is fine:
      // its own parent bucket has no previous sibling, so move it explicitly.
      expect(
        applyMove(deepTree, "g2", { targetParentId: "c1", targetIndex: 0 }),
      ).not.toBeNull();
    });

    it("reports an unknown node", () => {
      expect(run("nope", "up")).toEqual({
        kind: "refused",
        reason: "not-found",
      });
    });
  });
});
