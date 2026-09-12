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
 *   1. `pageImage`   — the page's own image (product photo, blog cover, …)
 *   2. `ogImage`     — the admin's `SeoSettings.defaultOgImage`
 *   3. the committed brand card (TASK-279) — so a preview is never image-less
 *
 * Mirrors the root layout's own chain (tiers 2–3); `pageImage` is the addition
 * a real entity page contributes.
 */
export function buildOgImages(input?: {
  /** The entity's own image, when it has one (product photo, blog cover). */
  pageImage?: string | null;
  /** `ResolvedSeo.ogImage` — the admin-uploaded `SeoSettings.defaultOgImage`. */
  ogImage?: string | null;
}): OgImage[] {
  const pageImage = input?.pageImage?.trim();
  if (pageImage) return [{ url: pageImage }];

  const ogImage = input?.ogImage?.trim();
  if (ogImage) return [{ url: ogImage }];

  return [
    {
      url: BRAND_OG_IMAGE_PATH,
      width: BRAND_OG_IMAGE_WIDTH,
      height: BRAND_OG_IMAGE_HEIGHT,
      alt: dict.meta.rootTitle,
    },
  ];
}
