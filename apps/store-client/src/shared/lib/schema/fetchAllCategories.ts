import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";

/** Flat sitemap-shaped view of one category node (every level is a real route). */
export interface FlatCategoryRoute {
  slug: string;
  updatedAt: string;
}

/**
 * Recursively flatten the (already active-only) public category tree into a
 * flat `{ slug, updatedAt }[]` — root and every nested level included, since
 * every category has its own `/categories/[slug]` landing page (TASK-277).
 * Pure function — trusts its input (the tree endpoint filters inactive
 * branches upstream).
 */
export function flattenActiveCategories(
  nodes: CategoryTreeNodeEntity[],
): FlatCategoryRoute[] {
  return nodes.flatMap((node) => [
    { slug: node.slug, updatedAt: node.updatedAt },
    ...flattenActiveCategories(node.children ?? []),
  ]);
}

/**
 * Fetch every active category (root + nested) in one tree request using the
 * Orval plain fetcher (server-only — NOT a React hook). Used by app/sitemap.ts.
 *
 * Throws on HTTP error; the caller (sitemap) wraps this in try/catch and falls
 * back to its other routes so a fetch failure never breaks the route.
 */
export async function fetchAllActiveCategories(): Promise<FlatCategoryRoute[]> {
  const tree = await categoryControllerGetCategoryTree();
  return flattenActiveCategories(tree.data);
}
