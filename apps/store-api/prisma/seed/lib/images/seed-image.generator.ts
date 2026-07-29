/**
 * The seed-image seam (plan 170).
 *
 * THE SIGNATURES BELOW ARE THE FROZEN CONTRACT. TASK-365 replaces the bodies
 * with locally generated WebP files (icon + palette rendered to disk, a real
 * blur placeholder, and a prune pass for orphaned files) WITHOUT touching any
 * caller. Until then the stubs reproduce, byte for byte, what the single-file
 * seed used to write inline: a deterministic picsum.photos URL keyed on the
 * position slug, no blur placeholder, sortOrder 0 as the cover.
 *
 * `iconId` / `paletteId` are ignored by the stub. They are part of the contract
 * now so catalogue data can be authored against a stable vocabulary before the
 * renderer exists.
 */
import type { IconId } from './icon-set';
import type { PaletteId } from './palettes';

export type { IconId } from './icon-set';
export type { PaletteId } from './palettes';

export interface SeedImageRequest {
  /** Stable identity of the image — today the position slug. */
  key: string;
  iconId: IconId;
  paletteId: PaletteId;
  shape: 'product' | 'category';
  sortOrder: number;
  alt: string;
}

export interface SeedImageRef {
  url: string;
  alt: string;
  blurDataUrl: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

/** Render (today: address) one image per request, in request order. */
export async function renderSeedImages(reqs: SeedImageRequest[]): Promise<SeedImageRef[]> {
  return reqs.map((req) => ({
    url: `https://picsum.photos/seed/${req.key}-${req.sortOrder}/800/800`,
    alt: req.alt,
    blurDataUrl: null,
    sortOrder: req.sortOrder,
    isPrimary: req.sortOrder === 0,
  }));
}

/** Category tiles are not seeded today — keep it that way until TASK-365. */
export async function renderCategoryTile(_req: SeedImageRequest): Promise<string | null> {
  return null;
}

/** Delete seed-generated image files no longer referenced. Nothing to prune yet. */
export async function pruneSeedImages(): Promise<number> {
  return 0;
}
