import type { CategoryControllerGetRootCategoriesParams } from "@/shared/api/generated/models";

/**
 * The root-category list the storefront shows — active roots in the owner's
 * order. Three widgets read it (the homepage «Категорії» tiles, the hero's
 * category rail and the `/promo` deal tabs), and the homepage and `/promo`
 * prefetch it on the server (TASK-563).
 *
 * One constant, because a prefetch is adopted only under the exact key the
 * widget asks for: a widget that spelled the params its own way would miss the
 * server's copy and render a skeleton over it — a hydration mismatch.
 */
export const ACTIVE_ROOT_CATEGORIES_PARAMS: CategoryControllerGetRootCategoriesParams =
  {
    isActive: true,
    sortBy: "sortOrder",
    sortOrder: "asc",
  };
