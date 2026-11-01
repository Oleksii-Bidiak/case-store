import type { CategoryTreeNodeEntity } from "@/entities/category";

/**
 * What the category tree in the filter rail shows for one page (TASK-2011,
 * option a «дерево в рейці»): «Усі категорії» → the current category's
 * ancestors → the level it sits on, with the current node opened onto its
 * children.
 *
 * On «Усі товари» (no category, or a slug the public tree does not have)
 * `current` is null, there are no ancestors and the level is every root.
 */
export interface CategoryTreeView {
  /** Root-first ancestors of the current category (empty for a root). */
  ancestors: CategoryTreeNodeEntity[];
  /** The current category and its siblings, in tree order. */
  level: CategoryTreeNodeEntity[];
  /** The category the page shows, or null on «Усі товари». */
  current: CategoryTreeNodeEntity | null;
}

/** Root-first path to the node with `slug`, or null when it is not in the tree. */
function pathTo(
  nodes: CategoryTreeNodeEntity[],
  slug: string,
): CategoryTreeNodeEntity[] | null {
  for (const node of nodes) {
    if (node.slug === slug) return [node];
    const nested = pathTo(node.children ?? [], slug);
    if (nested) return [node, ...nested];
  }
  return null;
}

/** The rows of the tree for `currentSlug` — see {@link CategoryTreeView}. */
export function categoryTreeView(
  tree: CategoryTreeNodeEntity[],
  currentSlug: string | undefined,
): CategoryTreeView {
  const path = currentSlug ? pathTo(tree, currentSlug) : null;
  if (!path) {
    return { ancestors: [], level: tree, current: null };
  }
  const current = path.at(-1)!;
  const ancestors = path.slice(0, -1);
  const parent = ancestors.at(-1);
  return {
    ancestors,
    level: parent ? (parent.children ?? []) : tree,
    current,
  };
}

/**
 * How many rows the tree draws before anything is expanded by hand: «Усі
 * категорії», the ancestors, the level and the current node's children. The
 * catalogue skeleton reserves exactly this many rows (TASK-515's rule — the
 * placeholder is the same box as what replaces it).
 */
export function categoryTreeRowCount(
  tree: CategoryTreeNodeEntity[],
  currentSlug: string | undefined,
): number {
  const { ancestors, level, current } = categoryTreeView(tree, currentSlug);
  return 1 + ancestors.length + level.length + (current?.children.length ?? 0);
}

/**
 * The number on the «Підкатегорії · N» toolbar button below `lg`: the current
 * category's children, or the number of top-level categories on «Усі товари».
 * Zero (a leaf) switches the label to «Категорія».
 */
export function subcategoryCount(
  tree: CategoryTreeNodeEntity[],
  currentSlug: string | undefined,
): number {
  const { current } = categoryTreeView(tree, currentSlug);
  return current ? (current.children ?? []).length : tree.length;
}

/** Read access to the current URL's query — `URLSearchParams` or Next's read-only one. */
interface QueryReader {
  get(key: string): string | null;
}

export interface CategoryTreeHrefOptions {
  /**
   * Where a node points. `landing` — the catalogue: a category's own landing
   * page `/categories/<slug>` (the canonical address of that category view, so
   * the rail is a set of crawlable links), «Усі категорії» → `/products`.
   * `{ path }` — a listing that narrows by `?category=<slug>` on its own path
   * (`/promo`, `/search`).
   */
  target: "landing" | { path: string };
  /**
   * Params of the current URL a category change keeps — the view, the device,
   * the sort order (and on `/search` the query). Everything else — facets,
   * price, availability, page — is dropped: they belonged to the old category.
   */
  keep: readonly string[];
  /** Appended as-is (the `/promo` listing anchor), e.g. `#deals`. */
  fragment?: string;
}

/** The address a tree node links to. `slug` undefined = «Усі категорії». */
export function categoryTreeHref(
  slug: string | undefined,
  current: QueryReader,
  { target, keep, fragment = "" }: CategoryTreeHrefOptions,
): string {
  const query = new URLSearchParams();
  for (const key of keep) {
    const value = current.get(key);
    if (value) query.set(key, value);
  }

  let path: string;
  if (target === "landing") {
    path = slug ? `/categories/${slug}` : "/products";
  } else {
    path = target.path;
    if (slug) query.set("category", slug);
  }

  const qs = query.toString();
  return `${path}${qs ? `?${qs}` : ""}${fragment}`;
}
