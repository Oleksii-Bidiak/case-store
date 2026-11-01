// Pure shaping for the homepage first block (TASK-1952): which models get a
// tile, where a chosen device leads, and what its panel lists.

import type {
  DeviceHubGroupEntity,
  PublicProductEntity,
} from "@/shared/api/generated/models";

/** Model tiles from 768 up (2 rows × 4 with «Усі моделі»). */
export const HERO_TILE_COUNT = 7;
/** Model tiles below 768 (3 rows × 2 with «Усі моделі»). */
export const HERO_TILE_COUNT_COMPACT = 5;
/** Quick category links on the active device's panel. */
export const QUICK_CATEGORY_COUNT = 4;
/** Products the panel hands to its picks slot. */
export const HERO_PICK_COUNT = 3;

/** The model hub — «Все для <модель>» (TASK-1954). */
export function deviceHubHref(slug: string): string {
  return `/devices/${encodeURIComponent(slug)}`;
}

/** The compat landing for one category of the device (TASK-490). */
export function deviceCategoryHref(
  categorySlug: string,
  deviceSlug: string,
): string {
  return `/catalog/${encodeURIComponent(categorySlug)}/${encodeURIComponent(deviceSlug)}`;
}

/**
 * The hub exists only for a model with at least one visible product (the API
 * answers 404 otherwise) — so a zero-count model is saved, never linked.
 * An unknown count (catalogue still loading) is not a reason to block: the
 * picker only lists catalogue models, which carry their count.
 */
export function hasHub(productCount: number | null | undefined): boolean {
  return (productCount ?? 0) > 0;
}

const byCountDesc = (a: DeviceHubGroupEntity, b: DeviceHubGroupEntity) =>
  b.productCount - a.productCount;

/** The device's biggest categories first (stable for equal counts). */
export function quickCategories(
  groups: readonly DeviceHubGroupEntity[],
  limit = QUICK_CATEGORY_COUNT,
): DeviceHubGroupEntity[] {
  return [...groups].sort(byCountDesc).slice(0, limit);
}

/**
 * Picks for the panel's rail: one product from each of the biggest
 * categories before a second from any — a case, a glass and a charger read
 * as «everything for this model» better than three cases. The hub already
 * orders each group in stock first, newest next.
 */
export function pickHeroProducts(
  groups: readonly DeviceHubGroupEntity[],
  limit = HERO_PICK_COUNT,
): PublicProductEntity[] {
  const ordered = [...groups].sort(byCountDesc);
  const picks: PublicProductEntity[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...ordered.map((g) => g.products.length));
  for (let round = 0; round < depth && picks.length < limit; round += 1) {
    for (const group of ordered) {
      const product = group.products[round];
      if (!product || seen.has(product.id)) continue;
      seen.add(product.id);
      picks.push(product);
      if (picks.length === limit) break;
    }
  }
  return picks;
}
