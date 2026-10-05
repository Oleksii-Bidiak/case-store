import type { CategoryTreeNodeEntity } from "@/entities/category";

/**
 * The second chips row under the catalogue's category chips (TASK-236): the
 * direct children of the root whose subtree is in focus — the root itself is
 * selected, or one of its children is. Empty when nothing is selected or the
 * root has no children.
 *
 * One rule for `CategoryChips`, which draws the row, and for the catalogue
 * pages, which tell the skeleton to reserve it (TASK-515) — the row is 48px
 * tall, and a skeleton that guessed wrong moved the grid by exactly that much.
 */
export function subcategoryChipsOf(
  categories: CategoryTreeNodeEntity[],
  activeCategorySlug: string | undefined,
): CategoryTreeNodeEntity[] {
  if (!activeCategorySlug) {
    return [];
  }
  const activeRoot = categories.find(
    (root) =>
      root.slug === activeCategorySlug ||
      root.children.some((child) => child.slug === activeCategorySlug),
  );
  return activeRoot?.children ?? [];
}
