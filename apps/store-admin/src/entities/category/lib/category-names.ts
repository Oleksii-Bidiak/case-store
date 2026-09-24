/**
 * id → name for EVERY node of a nested category tree, at any depth (TASK-717).
 *
 * Products are filed on a leaf category, and a leaf is usually two or three
 * levels down. A lookup built from the root list alone — which is what the
 * product table did — answers «—» for nearly every row.
 *
 * Structurally typed on purpose: it takes the admin tree
 * (`AdminCategoryTreeNodeEntity`, all statuses) and the public tree
 * (`CategoryTreeNodeEntity`, active only) alike, because a caller without
 * `categories:write` can only read the public one.
 */

interface NamedCategoryNode {
  id: string;
  name: string;
  children?: readonly NamedCategoryNode[] | null;
}

export function categoryNamesById(
  nodes: readonly NamedCategoryNode[] | null | undefined,
): Map<string, string> {
  const names = new Map<string, string>();
  const visit = (list: readonly NamedCategoryNode[]) => {
    for (const node of list) {
      names.set(node.id, node.name);
      if (node.children?.length) visit(node.children);
    }
  };
  visit(nodes ?? []);
  return names;
}
