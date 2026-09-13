/**
 * Category ancestor-path lookup over the public category tree (TASK-432, plan 176).
 *
 * The tree endpoint returns a forest of active categories; consumers that need
 * the *breadcrumb* for a category they only know by id (the Merchant Center feed
 * needs `g:product_type`, "Аксесуари > Чохли") would otherwise walk the tree per
 * product — O(products × tree). `buildCategoryPathMap` walks the forest once and
 * returns every node's root-to-leaf name path.
 *
 * Structurally typed on purpose (`CategoryPathNode`, not the generated
 * `CategoryTreeNodeEntity`): the helper only needs id/name/children, so it stays
 * a pure node-testable function with no dependency on the generated client.
 * `CategoryTreeNodeEntity` satisfies it structurally, so call sites pass the
 * real tree unchanged.
 *
 * Sibling note: `widgets/product-list/model/catalog-header.ts` has
 * `findCategoryPathBySlug`, a single-slug depth-first search returning the node
 * chain. This is the id-keyed, whole-forest, name-only counterpart — different
 * key, different shape, and it belongs in `shared/` because a route handler
 * (`/merchant-feed.xml`) must not import from `widgets/`.
 */

/** The minimal node shape this module needs (the tree entity satisfies it). */
export interface CategoryPathNode {
  id: string;
  name: string;
  children?: CategoryPathNode[] | null;
}

/** Default `g:product_type` separator — Google's documented path delimiter. */
export const CATEGORY_PATH_SEPARATOR = " > ";

/**
 * Walk the whole forest once and map every category id to its root-to-leaf name
 * path (`["Аксесуари", "Чохли"]` for a second-level node, `["Аксесуари"]` for a
 * root).
 *
 * Cycle-safe: a node already visited on the current branch is skipped, so a
 * malformed tree (a child pointing back at an ancestor) cannot spin forever.
 * A later duplicate id elsewhere in the forest does not overwrite the first
 * path — the first occurrence wins, deterministically.
 */
export function buildCategoryPathMap(
  nodes: readonly CategoryPathNode[] | null | undefined,
): Map<string, string[]> {
  const paths = new Map<string, string[]>();

  const walk = (
    node: CategoryPathNode,
    ancestors: string[],
    seen: ReadonlySet<string>,
  ): void => {
    if (seen.has(node.id)) return;

    const path = [...ancestors, node.name];
    if (!paths.has(node.id)) paths.set(node.id, path);

    const nextSeen = new Set(seen);
    nextSeen.add(node.id);
    for (const child of node.children ?? []) {
      walk(child, path, nextSeen);
    }
  };

  for (const node of nodes ?? []) {
    walk(node, [], new Set<string>());
  }

  return paths;
}

/**
 * Render a name path as a single `g:product_type` string. Returns undefined for
 * an absent/empty path or one whose segments are all blank, so a caller can omit
 * the element entirely rather than emit an empty tag.
 */
export function formatCategoryPath(
  path: readonly string[] | null | undefined,
  separator: string = CATEGORY_PATH_SEPARATOR,
): string | undefined {
  const segments = (path ?? [])
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment));
  return segments.length > 0 ? segments.join(separator) : undefined;
}
