import {
  BRAND_OG_IMAGE_HEIGHT,
  BRAND_OG_IMAGE_PATH,
  BRAND_OG_IMAGE_WIDTH,
  dict,
} from "@/shared/config";

/** One Open Graph image entry, in the shape Next's `Metadata.openGraph` takes. */
export interface OgImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

/**
 * The `openGraph.images` array for a route that declares its own `openGraph`
 * block (TASK-432, plan 176).
 *
 * WHY this exists: Next merges metadata SHALLOWLY — a segment that sets
 * `openGraph` at all **replaces** the root layout's entire `openGraph` object,
 * `images` included (see `generate-metadata.md` → "Overwriting fields"). So the
 * moment a page grows its own `openGraph` block it silently loses the root's
 * OG card and ships an image-less link preview. Every such block must therefore
 * re-state its images, and this helper is the single place that knows the
 * fallback chain:
 *
 *   1. `entityOgImage`  — the OG image an admin chose for THIS row (TASK-437)
 *   2. `pageImage`      — the page's own automatic image (product photo, cover)
 *   3. `defaultOgImage` — the admin's `SeoSettings.defaultOgImage`
 *   4. the committed brand card (TASK-279) — so a preview is never image-less
 *
 * Why tier 1 outranks tier 2 (TASK-437): the page image is whatever the
 * catalogue happened to put first — a product photo cropped for a grid tile, an
 * article cover cropped for a wide header. `entityOgImage` is a deliberate
 * choice for the 1200×630 link card. A person's pick beats a derived default;
 * when they make no pick, the derived one is still better than a site-wide
 * image, which is why tier 2 stays above tier 3.
 *
 * Why the entity tier lives HERE and not in `resolveSeo` (which already tiers
 * title and description): `resolveSeo` knows nothing about the page's automatic
 * image, so routing `entityOgImage` through its output would land it in tier 3's
 * slot — BELOW `pageImage` — and a product's chosen card would lose to its first
 * photo, which is the exact opposite of the intent. The image chain is ordered
 * in one place: this function.
 */
export function buildOgImages(input?: {
  /** Tier 1 — `Product/Category/Page/BlogPost.ogImage`, the admin's own pick. */
  entityOgImage?: string | null;
  /** Tier 2 — the entity's automatic image (product photo, blog cover). */
  pageImage?: string | null;
  /** Tier 3 — `ResolvedSeo.ogImage`, i.e. `SeoSettings.defaultOgImage`. */
  defaultOgImage?: string | null;
}): OgImage[] {
  const entityOgImage = input?.entityOgImage?.trim();
  if (entityOgImage) return [{ url: entityOgImage }];

  const pageImage = input?.pageImage?.trim();
  if (pageImage) return [{ url: pageImage }];

  const defaultOgImage = input?.defaultOgImage?.trim();
  if (defaultOgImage) return [{ url: defaultOgImage }];

  return [
    {
      url: BRAND_OG_IMAGE_PATH,
      width: BRAND_OG_IMAGE_WIDTH,
      height: BRAND_OG_IMAGE_HEIGHT,
      alt: dict.meta.rootTitle,
    },
  ];
}
