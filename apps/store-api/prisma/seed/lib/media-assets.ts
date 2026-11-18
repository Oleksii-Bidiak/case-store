import type { PrismaClient } from '@prisma/client';

import type { SeedImageRef } from './images/seed-image.generator';

/** What the seed knows about a file it has just written. */
export type SeedMediaAssetInput = Pick<
  SeedImageRef,
  'url' | 'alt' | 'blurDataUrl' | 'width' | 'height' | 'bytes'
>;

/** Every seeded file is the generator's own WebP render. */
const SEED_MIME = 'image/webp';

/**
 * Register seed-rendered files as media-library assets (TASK-1029) and hand
 * back the asset id for each URL.
 *
 * Without it the seed wrote catalogue photos and category tiles that the
 * library never heard of: the migration's backfill only covers rows that
 * existed when it ran, so every NEW environment came up with a full catalogue
 * and an empty library.
 *
 * - Upsert BY URL, the column usage is matched on (`media_assets.url` is
 *   UNIQUE): a re-seed finds the row it made last time instead of adding one.
 * - `update: {}` — an existing row is left exactly as it is, so a re-seed never
 *   overwrites the alt text or tags an operator has since edited.
 * - Memoised per registry: the catalogue repeats one URL across many
 *   `product_images` rows (positions of a group share a gallery, and the
 *   generator reuses identical renders), and one round-trip per distinct URL is
 *   enough. The first caller's alt text is the one recorded.
 * - `uploadedById` / `originalFilename` stay null: nobody uploaded these, and
 *   naming an admin or a file would be a fabricated fact (same rule as the
 *   backfill).
 */
export function createSeedMediaRegistry(prisma: PrismaClient) {
  const ids = new Map<string, Promise<string>>();

  return (input: SeedMediaAssetInput): Promise<string> => {
    const known = ids.get(input.url);
    if (known) return known;

    const pending = prisma.mediaAsset
      .upsert({
        where: { url: input.url },
        create: {
          url: input.url,
          blurDataUrl: input.blurDataUrl,
          width: input.width,
          height: input.height,
          bytes: input.bytes,
          mime: SEED_MIME,
          alt: input.alt,
          tags: [],
          uploadedById: null,
          originalFilename: null,
        },
        update: {},
      })
      .then((asset) => asset.id);

    ids.set(input.url, pending);
    return pending;
  };
}
