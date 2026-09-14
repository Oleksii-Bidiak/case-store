/**
 * Every place in this database that can hold the URL of an uploaded image
 * (TASK-441, plan 177).
 *
 * One entry per COLUMN, not per table: a blog post can reference the same asset
 * as its cover, as its Open Graph card and from inside its body, and an operator
 * told only "used by this article" cannot find which of the three to change.
 *
 * KEEPING THIS LIST COMPLETE IS THE WHOLE JOB. A column that records an image
 * URL and is missing here is an asset the library will happily delete out from
 * under a live page. `media-usage.repository.spec.ts` covers each kind
 * separately for exactly that reason — a single "finds usage" test passes while
 * thirteen of the fourteen sources are unreachable.
 */
export const MEDIA_USAGE_KINDS = {
  /** `product_images.url` — a photo in a product gallery. */
  PRODUCT_IMAGE: 'PRODUCT_IMAGE',
  /** `products.description` — an `<img>` inside the rich-text description. */
  PRODUCT_DESCRIPTION: 'PRODUCT_DESCRIPTION',
  /** `products.og_image` — the product's social-card override. */
  PRODUCT_OG_IMAGE: 'PRODUCT_OG_IMAGE',
  /** `categories.image` — the category tile. */
  CATEGORY_IMAGE: 'CATEGORY_IMAGE',
  /** `categories.og_image`. */
  CATEGORY_OG_IMAGE: 'CATEGORY_OG_IMAGE',
  /** `brands.logo`. */
  BRAND_LOGO: 'BRAND_LOGO',
  /** `banners.image_url` — homepage banner artwork. */
  BANNER_IMAGE: 'BANNER_IMAGE',
  /** `blog_posts.cover_image_url`. */
  BLOG_COVER_IMAGE: 'BLOG_COVER_IMAGE',
  /** `blog_posts.og_image`. */
  BLOG_OG_IMAGE: 'BLOG_OG_IMAGE',
  /** `blog_posts.content` — an `<img>` inside the article body. */
  BLOG_CONTENT: 'BLOG_CONTENT',
  /** `pages.content` — an `<img>` inside a static page's body. */
  PAGE_CONTENT: 'PAGE_CONTENT',
  /** `pages.og_image`. */
  PAGE_OG_IMAGE: 'PAGE_OG_IMAGE',
  /** `seo_settings.default_og_image` — the site-wide social card. */
  SEO_DEFAULT_OG_IMAGE: 'SEO_DEFAULT_OG_IMAGE',
  /** `seo_settings.logo_url` — the store logo in header, footer and JSON-LD. */
  SEO_STORE_LOGO: 'SEO_STORE_LOGO',
} as const;

export type MediaUsageKind = (typeof MEDIA_USAGE_KINDS)[keyof typeof MEDIA_USAGE_KINDS];

/** Stable ordering for responses, so a list of usages never shuffles between reads. */
export const MEDIA_USAGE_KIND_ORDER: readonly MediaUsageKind[] = [
  MEDIA_USAGE_KINDS.PRODUCT_IMAGE,
  MEDIA_USAGE_KINDS.PRODUCT_DESCRIPTION,
  MEDIA_USAGE_KINDS.PRODUCT_OG_IMAGE,
  MEDIA_USAGE_KINDS.CATEGORY_IMAGE,
  MEDIA_USAGE_KINDS.CATEGORY_OG_IMAGE,
  MEDIA_USAGE_KINDS.BRAND_LOGO,
  MEDIA_USAGE_KINDS.BANNER_IMAGE,
  MEDIA_USAGE_KINDS.BLOG_COVER_IMAGE,
  MEDIA_USAGE_KINDS.BLOG_OG_IMAGE,
  MEDIA_USAGE_KINDS.BLOG_CONTENT,
  MEDIA_USAGE_KINDS.PAGE_CONTENT,
  MEDIA_USAGE_KINDS.PAGE_OG_IMAGE,
  MEDIA_USAGE_KINDS.SEO_DEFAULT_OG_IMAGE,
  MEDIA_USAGE_KINDS.SEO_STORE_LOGO,
];

/** One place a media asset is currently referenced from. */
export interface MediaUsage {
  kind: MediaUsageKind;
  /** Primary key of the referencing row (the singleton id for site settings). */
  entityId: string;
  /**
   * What the operator calls that row — a product name, an article title. The
   * admin panel renders its own Ukrainian noun for `kind` and this for the
   * "which one", so the API stays free of UI copy.
   */
  label: string;
}
