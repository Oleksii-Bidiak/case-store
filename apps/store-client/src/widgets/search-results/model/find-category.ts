import type { CategoryTreeNodeEntity } from "@/entities/category";

/**
 * Depth-first slug → id lookup over the public category tree (TASK-523).
 *
 * `/search` carries the category as a SLUG (the URL language since TASK-420),
 * while the brand list the filter panel scopes by it is id-addressed. The tree
 * is already fetched for the chips row, so this costs no request. `undefined`
 * for an unknown slug — the panel then simply shows the unscoped brand list,
 * and the search itself answers an unknown slug with no results.
 *
 * Deliberately a copy of the catalogue widget's lookup rather than an import:
 * widgets do not import one another (FSD), and five lines do not earn a place
 * in `entities`.
 */
export function findCategoryIdBySlug(
  nodes: CategoryTreeNodeEntity[],
  slug: string,
): string | undefined {
  for (const node of nodes) {
    if (node.slug === slug) return node.id;
    const nested = findCategoryIdBySlug(node.children ?? [], slug);
    if (nested) return nested;
  }
  return undefined;
}
