/**
 * Flatten the NESTED admin category tree into the flat `TreeItem[]` model every
 * move path speaks (plan 158 §3.2/§3.3).
 *
 * `GET /api/categories/admin/tree` returns NESTED `AdminCategoryTreeNodeEntity`
 * nodes (`children[]`), NOT a flat array — the pure reducer in
 * `shared/lib/sortable-tree` consumes a flat, ordered `{ id, parentId }` list
 * where array order within a parent bucket IS the sibling order. This is the
 * single conversion point.
 *
 * The result is in depth-first order, which is also the row order the treegrid
 * renders, and is a strict SUPERSET of `TreeItem` — the extra columns
 * (`slug`, `isActive`, `productCount`, `subtreeProductCount`, `depth`) ride
 * along so the widget does not need a second lookup map.
 */

import type { TreeItem } from "@/shared/lib/sortable-tree";
import type { AdminCategoryTreeNodeEntity } from "@/shared/api";

export interface CategoryTreeItem extends TreeItem {
  slug: string;
  isActive: boolean;
  /** ACTIVE products filed DIRECTLY on this category. */
  productCount: number;
  /**
   * ACTIVE products in this category AND every descendant (TASK-408) — the
   * figure the storefront category page lists, since a listing rolls up over the
   * whole subtree (TASK-236).
   */
  subtreeProductCount: number;
  /** 1-based level as computed by the server (a root category is level 1). */
  depth: number;
}

/**
 * Read `subtreeProductCount` off a tree node, falling back to its direct count.
 *
 * The field is new in TASK-408 and the Orval-generated `AdminCategoryTreeNodeEntity`
 * only learns about it on the next `swagger:export` + `orval` run, so the read is
 * narrowed here rather than asserted across the widget. The fallback is also the
 * honest answer against an older API: with no rollup available, a category's own
 * count is the most the client can truthfully claim.
 */
function readSubtreeCount(node: AdminCategoryTreeNodeEntity): number {
  const withRollup = node as AdminCategoryTreeNodeEntity & {
    subtreeProductCount?: number;
  };
  return withRollup.subtreeProductCount ?? node.productCount;
}

/** Depth-first flatten of the nested admin tree. */
export function flattenAdminCategoryTree(
  nodes: AdminCategoryTreeNodeEntity[] | undefined,
): CategoryTreeItem[] {
  const out: CategoryTreeItem[] = [];

  const visit = (
    node: AdminCategoryTreeNodeEntity,
    parentId: string | null,
  ) => {
    out.push({
      id: node.id,
      parentId,
      label: node.name,
      slug: node.slug,
      isActive: node.isActive,
      productCount: node.productCount,
      subtreeProductCount: readSubtreeCount(node),
      depth: node.depth,
    });
    for (const child of node.children ?? []) {
      visit(child, node.id);
    }
  };

  for (const node of nodes ?? []) {
    visit(node, node.parentId ?? null);
  }

  return out;
}
