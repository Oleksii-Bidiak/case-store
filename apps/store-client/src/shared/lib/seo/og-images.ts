import {
  BRAND_OG_IMAGE_HEIGHT,
  BRAND_OG_IMAGE_PATH,
  BRAND_OG_IMAGE_WIDTH,
  dict,
} from "@/shared/config";
import { resolveSiteName } from "./resolve-site-name";

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
 *   1.  `entityOgImage`  — the OG image an admin chose for THIS row (TASK-437)
 *   2.  `pageImage`      — the page's own automatic image (product photo, cover)
 *   2b. `categoryImage`  — a category's own tile picture (TASK-569), for the
 *       routes that render a category and have no page image of their own
 *   3.  `defaultOgImage` — the admin's `SeoSettings.defaultOgImage`
 *   4.  the committed brand card (TASK-279) — so a preview is never image-less
 *
 * Sizes and alt (TASK-568). Tiers 1 and 3 are uploaded FOR the link card — the
 * admin fields say 1200×630 — so they carry `width`/`height`, and a crawler need
 * not download and measure the file before laying the card out. Tiers 2 and 2b
 * are whatever the catalogue holds (a square product photo, a wide cover), so no
 * size is claimed for them: a wrong size is worse than none. EVERY entry carries
 * `alt` (→ `og:image:alt`), from the caller — the page's own title — with the
 * brand-card alt as the floor. That alt is built from the caller's resolved
 * `siteName` (TASK-546), so renaming the store in /settings/seo renames the
 * card too; before, it was `dict.meta.rootTitle` with the name baked in.
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
  /** Tier 2b — `CategoryTreeNodeEntity.image`, the category's tile (TASK-569). */
  categoryImage?: string | null;
  /** Tier 3 — `ResolvedSeo.ogImage`, i.e. `SeoSettings.defaultOgImage`. */
  defaultOgImage?: string | null;
  /**
   * `og:image:alt` for tiers 1–3 (TASK-568) — normally the page's title. The
   * brand card keeps its own alt: it is a picture of the store, not of the page.
   */
  alt?: string | null;
  /**
   * The store's display name — `resolveSiteName(seo)` at the call site
   * (TASK-546). It names the brand card in `og:image:alt` and is the alt floor
   * when the page passes no title. Omitted → the same fallback
   * `resolveSiteName` uses everywhere else.
   */
  siteName?: string | null;
}): OgImage[] {
  const brandAlt = dict.meta.brandCardAlt(
    resolveSiteName({ siteName: input?.siteName }),
  );
  const alt = input?.alt?.trim() || brandAlt;
  // Uploaded for the 1200×630 card — the size is known, so it is stated.
  const cardSized = (url: string): OgImage[] => [
    { url, width: BRAND_OG_IMAGE_WIDTH, height: BRAND_OG_IMAGE_HEIGHT, alt },
  ];
  // A catalogue picture of unknown proportions — no size is claimed.
  const unsized = (url: string): OgImage[] => [{ url, alt }];

  const entityOgImage = input?.entityOgImage?.trim();
  if (entityOgImage) return cardSized(entityOgImage);

  const pageImage = input?.pageImage?.trim();
  if (pageImage) return unsized(pageImage);

  const categoryImage = input?.categoryImage?.trim();
  if (categoryImage) return unsized(categoryImage);

  const defaultOgImage = input?.defaultOgImage?.trim();
  if (defaultOgImage) return cardSized(defaultOgImage);

  return [
    {
      url: BRAND_OG_IMAGE_PATH,
      width: BRAND_OG_IMAGE_WIDTH,
      height: BRAND_OG_IMAGE_HEIGHT,
      alt: brandAlt,
    },
  ];
}
