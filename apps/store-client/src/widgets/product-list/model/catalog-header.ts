import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";

/** One breadcrumb node — `href` present for links, absent for the current page. */
export interface Crumb {
  name: string;
  href?: string;
}

export interface CatalogHeader {
  trail: Crumb[];
  title: string;
  subtitle: string;
  /** Canonical path of the current view (used for the last JSON-LD crumb). */
  currentPath: string;
}

/** Depth-first search of the category tree for a node by id (name, description, …). */
export function findCategoryNode(
  nodes: CategoryTreeNodeEntity[],
  id: string,
): CategoryTreeNodeEntity | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = findCategoryNode(node.children ?? [], id);
    if (nested) return nested;
  }
  return null;
}

/**
 * Depth-first search of the category tree for a node by slug, returning the
 * full ancestor chain `[root, ...intermediate, matched]` in root-to-leaf
 * order, or `null` when the slug is not found anywhere in the tree. The tree
 * endpoint only returns active categories, so an inactive/unknown slug
 * naturally resolves to `null` (TASK-277 — /categories/[slug] landing pages).
 */
export function findCategoryPathBySlug(
  nodes: CategoryTreeNodeEntity[],
  slug: string,
): CategoryTreeNodeEntity[] | null {
  for (const node of nodes) {
    if (node.slug === slug) return [node];
    const nested = findCategoryPathBySlug(node.children ?? [], slug);
    if (nested) return [node, ...nested];
  }
  return null;
}

/** Depth-first search of the category tree for a node's display name by id. */
export function findCategoryName(
  nodes: CategoryTreeNodeEntity[],
  id: string,
): string | null {
  return findCategoryNode(nodes, id)?.name ?? null;
}

/**
 * Build the catalog header (breadcrumb trail + title + subtitle) for the three
 * catalog modes: a specific category (`/products?categoryId=…` — the mid crumb
 * links to the categories hub, the last crumb is the category name), an
 * in-catalog keyword search (`/products?search=…`), or the unfiltered listing.
 */
export function buildCatalogHeader({
  categoryId,
  categoryName,
  search,
}: {
  categoryId?: string;
  categoryName: string | null;
  search?: string;
}): CatalogHeader {
  const home: Crumb = { name: dict.catalog.breadcrumbHome, href: "/" };

  if (categoryId) {
    const name = categoryName ?? dict.catalog.categoryFallback;
    return {
      trail: [
        home,
        { name: dict.catalog.breadcrumbCategories, href: "/categories" },
        { name },
      ],
      title: name,
      subtitle: dict.catalog.categorySubtitle(name),
      currentPath: `/products?categoryId=${categoryId}`,
    };
  }

  if (search) {
    return {
      trail: [
        home,
        { name: dict.catalog.breadcrumbProducts, href: "/products" },
        { name: `«${search}»` },
      ],
      title: dict.catalog.searchTitle(search),
      subtitle: dict.catalog.searchSubtitle(search),
      currentPath: `/products?search=${encodeURIComponent(search)}`,
    };
  }

  return {
    trail: [home, { name: dict.catalog.breadcrumbProducts }],
    title: dict.catalog.allProducts,
    subtitle: dict.catalog.allProductsSubtitle,
    currentPath: "/products",
  };
}
