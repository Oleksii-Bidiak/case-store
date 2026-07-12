/**
 * THE test that makes "pointer and keyboard share one reducer" literally true
 * (plan 158 §3.2 / TASK-291-G).
 *
 * jsdom has no layout, so a dnd-kit pointer drag cannot be driven here. What CAN
 * be pinned is the only piece of the pointer path that carries any logic: the
 * conversion of `getProjection`'s (depth, parentId) output into the SAME
 * `{ targetParentId, targetIndex }` insertion point the keyboard produces. Over a
 * table of `(overId, offsetLeft)` pairs we assert:
 *
 *   1. the pointer pipeline yields the expected insertion point;
 *   2. feeding it to `applyMove` yields the expected tree;
 *   3. where the drag has a keyboard equivalent, `applyIntent` yields the SAME
 *      insertion point and the SAME tree — one reducer, two entry points.
 */

import { applyIntent, applyMove } from "./apply-move";
import { fixtureTree, shape } from "./fixtures";
import {
  depthClampFor,
  projectionToInsertionPoint,
  toNested,
} from "./projection";
import type { InsertionPoint, MoveIntent } from "./types";
import {
  flattenTree,
  getProjection,
  removeChildrenOf,
} from "./vendor-tree-utilities";

const INDENT = 24;

/** The exact pointer pipeline the UI primitive runs on drag end. */
function pointerMove(
  activeId: string,
  overId: string,
  offsetLeft: number,
): { point: InsertionPoint; items: ReturnType<typeof applyMove> } {
  const dragList = removeChildrenOf(flattenTree(toNested(fixtureTree)), [
    activeId,
  ]);
  const projection = getProjection(
    dragList,
    activeId,
    overId,
    offsetLeft,
    INDENT,
    depthClampFor(fixtureTree, activeId),
  );
  const point = projectionToInsertionPoint(
    dragList,
    activeId,
    overId,
    projection,
  );
  return { point, items: applyMove(fixtureTree, activeId, point) };
}

interface Case {
  name: string;
  activeId: string;
  overId: string;
  offsetLeft: number;
  point: InsertionPoint;
  expected: string[];
  /** Keyboard intent that must reach the identical insertion point, if any. */
  intent?: MoveIntent;
}

const cases: Case[] = [
  {
    name: "drag a2 onto a1, no horizontal offset ⇒ ↑ (move up among siblings)",
    activeId: "a2",
    overId: "a1",
    offsetLeft: 0,
    point: { targetParentId: "a", targetIndex: 0 },
    expected: ["a<-", "a2<a", "a2x<a2", "a1<a", "b<-", "b1<b"],
    intent: "up",
  },
  {
    name: "drag a2 in place, one indent step right ⇒ → (indent under a1)",
    activeId: "a2",
    overId: "a2",
    offsetLeft: INDENT,
    point: { targetParentId: "a1", targetIndex: 0 },
    expected: ["a<-", "a1<a", "a2<a1", "a2x<a2", "b<-", "b1<b"],
    intent: "indent",
  },
  {
    name: "drag a1 onto a2x, no offset ⇒ ↓ (move down among siblings)",
    activeId: "a1",
    overId: "a2x",
    offsetLeft: 0,
    point: { targetParentId: "a", targetIndex: 1 },
    expected: ["a<-", "a2<a", "a2x<a2", "a1<a", "b<-", "b1<b"],
    intent: "down",
  },
  {
    name: "drag a1 onto a2x, one indent step left ⇒ ← (outdent to root)",
    activeId: "a1",
    overId: "a2x",
    offsetLeft: -INDENT,
    point: { targetParentId: null, targetIndex: 1 },
    expected: ["a<-", "a2<a", "a2x<a2", "a1<-", "b<-", "b1<b"],
    intent: "outdent",
  },
  {
    name: "drag a2 onto b (cross-tree reparent — no single keyboard equivalent)",
    activeId: "a2",
    overId: "b",
    offsetLeft: -INDENT,
    point: { targetParentId: "b", targetIndex: 0 },
    expected: ["a<-", "a1<a", "b<-", "a2<b", "a2x<a2", "b1<b"],
  },
  {
    name: "drag a (height 3) onto b1 — the depth clamp keeps it at level 2 under b",
    activeId: "a",
    overId: "b1",
    offsetLeft: INDENT,
    point: { targetParentId: "b", targetIndex: 1 },
    expected: ["b<-", "b1<b", "a<b", "a1<a", "a2<a", "a2x<a2"],
  },
];

describe("getProjection → projectionToInsertionPoint → applyMove", () => {
  it.each(cases)(
    "$name",
    ({ activeId, overId, offsetLeft, point, expected }) => {
      const result = pointerMove(activeId, overId, offsetLeft);
      expect(result.point).toEqual(point);
      expect(result.items).not.toBeNull();
      expect(shape(result.items as never)).toEqual(expected);
    },
  );

  it.each(cases.filter((c) => c.intent))(
    "keyboard parity — $name",
    ({ activeId, overId, offsetLeft, intent }) => {
      const pointer = pointerMove(activeId, overId, offsetLeft);
      const keyboard = applyIntent(fixtureTree, activeId, intent as MoveIntent);

      expect(keyboard.kind).toBe("moved");
      if (keyboard.kind !== "moved") throw new Error("unreachable");
      expect(keyboard.point).toEqual(pointer.point);
      expect(shape(keyboard.items)).toEqual(shape(pointer.items as never));
    },
  );

  it("the depth clamp is load-bearing: without it the same drag projects an illegal drop", () => {
    const dragList = removeChildrenOf(flattenTree(toNested(fixtureTree)), [
      "a",
    ]);
    const unclamped = getProjection(dragList, "a", "b1", INDENT * 2, INDENT);
    const point = projectionToInsertionPoint(dragList, "a", "b1", unclamped);

    expect(point.targetParentId).toBe("b1"); // level 3 + height 3 − 1 = 5 ✗
    expect(applyMove(fixtureTree, "a", point)).toBeNull();
  });
});
