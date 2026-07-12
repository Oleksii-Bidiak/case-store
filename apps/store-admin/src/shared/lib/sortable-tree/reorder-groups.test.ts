import { applyMove } from "./apply-move";
import { fixtureTree } from "./fixtures";
import { toReorderGroups } from "./reorder-groups";
import type { TreeItem } from "./types";

const sortGroups = (groups: { parentId: string | null }[]) =>
  [...groups].sort((x, y) =>
    String(x.parentId ?? "-").localeCompare(String(y.parentId ?? "-")),
  );

describe("toReorderGroups", () => {
  it("emits ONE group for a same-parent reorder", () => {
    const next = applyMove(fixtureTree, "a2", {
      targetParentId: "a",
      targetIndex: 0,
    }) as TreeItem[];

    expect(toReorderGroups(fixtureTree, next)).toEqual([
      { parentId: "a", orderedIds: ["a2", "a1"] },
    ]);
  });

  it("emits TWO groups (source + destination) for a reparent", () => {
    const next = applyMove(fixtureTree, "a2", {
      targetParentId: "b",
      targetIndex: 0,
    }) as TreeItem[];

    expect(sortGroups(toReorderGroups(fixtureTree, next))).toEqual([
      { parentId: "a", orderedIds: ["a1"] },
      { parentId: "b", orderedIds: ["a2", "b1"] },
    ]);
  });

  it("emits an EMPTY orderedIds group when a parent loses its last child", () => {
    const next = applyMove(fixtureTree, "a2x", {
      targetParentId: null,
      targetIndex: 2,
    }) as TreeItem[];

    expect(sortGroups(toReorderGroups(fixtureTree, next))).toEqual([
      { parentId: null, orderedIds: ["a", "b", "a2x"] },
      { parentId: "a2", orderedIds: [] },
    ]);
  });

  it("emits the root bucket as parentId: null", () => {
    const next = applyMove(fixtureTree, "b", {
      targetParentId: null,
      targetIndex: 0,
    }) as TreeItem[];

    expect(toReorderGroups(fixtureTree, next)).toEqual([
      { parentId: null, orderedIds: ["b", "a"] },
    ]);
  });

  it("emits nothing when the tree is unchanged", () => {
    expect(toReorderGroups(fixtureTree, [...fixtureTree])).toEqual([]);
  });
});
