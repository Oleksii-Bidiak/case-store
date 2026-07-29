import { positionSlugsOf } from '../../lib/position-slug';
import type { CatalogueEntry, ProductSeed, VariantSeed } from '../../types';
import { headphones, speakers } from './audio.data';
import { cables } from './cables.data';
import { cases } from './cases.data';
import { holders } from './holders.data';
import { phones } from './phones.data';
import { chargers, powerBanks } from './power.data';
import { protection } from './protection.data';
import { storage } from './storage.data';
import { wearables } from './wearables.data';

/**
 * The seeded catalogue (TASK-366) — ~89 Ukrainian entries / ~178 positions
 * across the 11 root categories, ordered the way the storefront navigation is.
 *
 * A plain module-level constant on purpose: `seedOrders`, `seedDeviceCompat`,
 * `seedAttributeDefinitions` and `seedAddonServices` all address positions by
 * slug or SKU, and they read this array directly instead of guessing from the
 * database (the old `orderBy: createdAt, take: 3` heuristic stopped being
 * deterministic the moment 178 rows were inserted in one loop).
 */
export const catalogueEntries: CatalogueEntry[] = [
  ...phones,
  ...headphones,
  ...wearables,
  ...speakers,
  ...powerBanks,
  ...cases,
  ...protection,
  ...cables,
  ...chargers,
  ...holders,
  ...storage,
];

/** Gallery views used when an entry does not name its own. */
const DEFAULT_VIEWS = ['загальний вигляд', 'вигляд збоку'];

/**
 * Resolve every entry's `categorySlug` to a real id and expand `views` into
 * image records. The image URL itself never comes from here — the seed-image
 * seam builds it from the position slug (plan 170).
 */
export function buildProductsData(categories: Record<string, { id: string }>): ProductSeed[] {
  return catalogueEntries.map((entry) => {
    const category = categories[entry.categorySlug];
    if (!category) {
      throw new Error(
        `Seed: catalogue entry '${entry.slug}' points at unknown category '${entry.categorySlug}'`,
      );
    }
    const views = entry.views ?? DEFAULT_VIEWS;
    return {
      ...entry,
      categoryId: category.id,
      images: views.map((view, index) => ({
        alt: `${entry.name} — ${view}`,
        sortOrder: index,
      })),
    };
  });
}

/** One seeded product position, flattened out of its entry. */
export interface CataloguePosition {
  entry: CatalogueEntry;
  variant: VariantSeed;
  slug: string;
  sku: string;
  stock: number;
  price: number;
}

/** Every position the catalogue will create, in seed order. */
export function cataloguePositions(): CataloguePosition[] {
  return catalogueEntries.flatMap((entry) => {
    const slugs = positionSlugsOf(entry);
    return entry.variants.map((variant, index) => ({
      entry,
      variant,
      slug: slugs[index],
      sku: variant.sku ?? entry.sku,
      stock: variant.stock,
      price: variant.price,
    }));
  });
}

/** Position slugs of one entry, looked up by entry slug. Throws when unknown. */
export function positionSlugsOfEntry(entrySlug: string): string[] {
  const entry = catalogueEntries.find((candidate) => candidate.slug === entrySlug);
  if (!entry) {
    throw new Error(`Seed: no catalogue entry with slug '${entrySlug}'`);
  }
  return positionSlugsOf(entry);
}
