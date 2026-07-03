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

/** Depth-first search of the category tree for a node's display name by id. */
export function findCategoryName(
  nodes: CategoryTreeNodeEntity[],
  id: string,
): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.name;
    const nested = findCategoryName(node.children ?? [], id);
    if (nested) return nested;
  }
  return null;
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
