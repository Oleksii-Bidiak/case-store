// Tier 2 of the device bar (TASK-2074): the top-level categories that have
// products for the active device, derived from `GET /catalog/compat-pages`.
//
// That endpoint lists every (category × device model) landing page with its
// product count, rolled up the category tree — so one device appears under a
// root AND under each of its subcategories. The bar wants the roots only (the
// same top level the «Каталог» menu shows), so the category tree decides which
// rows are roots and breaks ties in the owner's order.

export interface CompatPageLike {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  deviceSlug: string;
  productCount: number;
}

export interface RootCategoryLike {
  id: string;
}

export interface DeviceCategory {
  id: string;
  slug: string;
  name: string;
  productCount: number;
}

/**
 * The active device's root categories, most products first; equal counts keep
 * the tree's (owner's) order. Rows without products are dropped.
 */
export function selectDeviceCategories(
  pages: readonly CompatPageLike[],
  deviceSlug: string,
  roots: readonly RootCategoryLike[],
): DeviceCategory[] {
  const rootOrder = new Map(roots.map((root, index) => [root.id, index]));
  return pages
    .filter(
      (page) =>
        page.deviceSlug === deviceSlug &&
        page.productCount > 0 &&
        rootOrder.has(page.categoryId),
    )
    .map((page) => ({
      id: page.categoryId,
      slug: page.categorySlug,
      name: page.categoryName,
      productCount: page.productCount,
    }))
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        (rootOrder.get(a.id) ?? 0) - (rootOrder.get(b.id) ?? 0),
    );
}

/**
 * Products for the device across its root categories. A product sits in one
 * category, so the root counts do not overlap and their sum is the total.
 */
export function totalProductCount(
  categories: readonly DeviceCategory[],
): number {
  return categories.reduce((sum, category) => sum + category.productCount, 0);
}

/** The compatibility listing for one (category, device) pair. */
export function deviceCategoryHref(
  categorySlug: string,
  deviceSlug: string,
): string {
  return `/catalog/${encodeURIComponent(categorySlug)}/${encodeURIComponent(deviceSlug)}`;
}

/** The device's own page — the DeviceHub (TASK-1954). */
export function deviceHubHref(deviceSlug: string): string {
  return `/devices/${encodeURIComponent(deviceSlug)}`;
}
