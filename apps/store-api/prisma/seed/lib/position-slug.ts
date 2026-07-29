import type { CatalogueEntry } from '../types';

/**
 * Position slugs of a catalogue entry, in variant order.
 *
 * A single-variant entry is a standalone position and reuses the entry slug.
 * A multi-variant entry becomes a group whose members are `${slug}-${slugPart}`,
 * and `slugPart` must be authored explicitly: Ukrainian variant names collapse
 * to the empty string under `slugify()`, and the SKU fallback this replaces
 * produced unreadable URLs like `apple-iphone-15-pro-ip15pro-128-nt` (TASK-366).
 *
 * Shared by `seedProducts` (which writes the rows) and by the seeders that must
 * address a specific position by slug — device compatibility and add-on deltas.
 */
export function positionSlugsOf(entry: Pick<CatalogueEntry, 'slug' | 'variants'>): string[] {
  if (entry.variants.length <= 1) {
    return entry.variants.map(() => entry.slug);
  }
  return entry.variants.map((variant) => {
    if (!variant.slugPart) {
      throw new Error(
        `Seed: variant "${variant.name}" of entry "${entry.slug}" has no slugPart — ` +
          'every variant of a multi-variant entry must name its position slug explicitly',
      );
    }
    return `${entry.slug}-${variant.slugPart}`;
  });
}
