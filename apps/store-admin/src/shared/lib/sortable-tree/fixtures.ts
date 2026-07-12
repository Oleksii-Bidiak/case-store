import type { TreeItem } from "./types";

/**
 * Shared test fixture (not shipped to any screen — imported only by the
 * sortable-tree specs and kept next to them so every case reads the same tree).
 *
 *  a            level 1
 *  ├─ a1        level 2
 *  └─ a2        level 2
 *     └─ a2x    level 3
 *  b            level 1
 *  └─ b1        level 2
 */
export const fixtureTree: TreeItem[] = [
  { id: "a", parentId: null, label: "A" },
  { id: "a1", parentId: "a", label: "A1" },
  { id: "a2", parentId: "a", label: "A2" },
  { id: "a2x", parentId: "a2", label: "A2x" },
  { id: "b", parentId: null, label: "B" },
  { id: "b1", parentId: "b", label: "B1" },
];

/**
 * Deep fixture for the `level + height − 1 ≤ 4` refusal.
 *
 *  r
 *  ├─ c1
 *  └─ c2        subtree height 3 (c2 → g2 → gg2)
 *     └─ g2
 *        └─ gg2
 */
export const deepTree: TreeItem[] = [
  { id: "r", parentId: null, label: "R" },
  { id: "c1", parentId: "r", label: "C1" },
  { id: "c2", parentId: "r", label: "C2" },
  { id: "g2", parentId: "c2", label: "G2" },
  { id: "gg2", parentId: "g2", label: "GG2" },
];

/** Serialise a tree state as `id<parent` pairs — order AND parentage in one shot. */
export const shape = (items: TreeItem[]): string[] =>
  items.map((i) => `${i.id}<${i.parentId ?? "-"}`);
