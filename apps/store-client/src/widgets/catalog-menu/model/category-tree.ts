// Pure shaping of `GET /categories/tree` for the «Каталог» menu (TASK-2072).
// The tree is the root + three nested levels (4 in all); the mega menu shows
// levels 1–3 and the step-by-step sheet walks all four.

import type { CategoryTreeNodeEntity } from "@/entities/category";

export type CatalogNode = CategoryTreeNodeEntity;

/** Level-3 links under one tile before the list folds into «Ще N →». */
export const TILE_LINK_LIMIT = 4;

/** Every category page lives at the same route. */
export function categoryHref(node: Pick<CatalogNode, "slug">): string {
  return `/categories/${node.slug}`;
}

/**
 * The tiles of a root's pane: its children — or, for a root without any, the
 * root itself as the one tile, so the pane is never blank (CatalogMenu
 * mockup: «Карти пам’яті та флешки» in the seed).
 */
export function paneTiles(root: CatalogNode): readonly CatalogNode[] {
  return root.children.length > 0 ? root.children : [root];
}

/** The first {@link TILE_LINK_LIMIT} grandchildren and how many are left. */
export function tileLinks(node: CatalogNode): {
  links: readonly CatalogNode[];
  rest: number;
} {
  return {
    links: node.children.slice(0, TILE_LINK_LIMIT),
    rest: Math.max(0, node.children.length - TILE_LINK_LIMIT),
  };
}

/**
 * The nodes along `ids` from the roots down — the sheet's drill path. Stops at
 * the first id the tree no longer has (a refetch after an admin edit), so the
 * sheet falls back to the deepest level that still exists instead of a blank
 * screen.
 */
export function resolvePath(
  roots: readonly CatalogNode[],
  ids: readonly string[],
): CatalogNode[] {
  const path: CatalogNode[] = [];
  let level: readonly CatalogNode[] = roots;
  for (const id of ids) {
    const node = level.find((candidate) => candidate.id === id);
    if (!node) break;
    path.push(node);
    level = node.children;
  }
  return path;
}
