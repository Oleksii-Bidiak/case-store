/**
 * The sub-directories (under UPLOAD_DEST) that uploads may be written to.
 *
 * This is a closed set on purpose: {@link IStorageService.save} takes a subdir,
 * but it must never be an arbitrary string derived from a request — a whitelist
 * is what keeps `../`-style traversal out of the on-disk layout. The served URL
 * (`/uploads/<subdir>/<file>`) mirrors these names exactly.
 */
export const PRODUCTS_SUBDIR = 'products';

/** Store branding assets (the logo uploaded via SEO settings — TASK-299). */
export const BRANDING_SUBDIR = 'branding';

/**
 * Uploaded supplier catalogue workbooks (TASK-360). The file is kept so the
 * apply step can re-read the full values the reviewable plan only previews —
 * inlining 1300 descriptions into the plan JSON would put a single run into the
 * megabytes. Unlike the other two subdirs these are never served publicly;
 * they live here because `IStorageService` is the one place that knows where
 * uploaded bytes go.
 */
export const IMPORTS_SUBDIR = 'imports';

/**
 * Imagery attached to editorial content (TASK-424): category covers, brand
 * logos, banner artwork, blog cover photos.
 *
 * One subdir for all four rather than one each, because the entity an image
 * belongs to is recorded in the row that points at it, not in the path — and a
 * path segment per entity would have to be derived from the request, which is
 * exactly what this whitelist exists to prevent. Served publicly, like
 * `products`/`branding`: the storefront's `next.config.ts` already allows
 * `/uploads/**`, so `/uploads/content/**` needs no config change.
 */
export const CONTENT_SUBDIR = 'content';

/**
 * The internal media library (TASK-441, plan 177).
 *
 * A subdir of its own rather than a fold into `content`, because the two have
 * different origins and different lifetimes. A `content` file was uploaded INTO
 * a form that already had a slot for it, so a row pointed at it from the moment
 * it existed; a `media` file was uploaded into the library and may be referenced
 * by nothing, by one entity, or by six. When an operator later asks "what is
 * actually on this disk", the path is the only thing that answers it — and
 * unlike the entity an image belongs to, the library IS a fixed, code-level
 * target, so it can be a whitelisted constant instead of a request-derived
 * segment, which is what this list exists to forbid.
 *
 * Served publicly like `products`/`branding`/`content`: the storefront's
 * `next.config.ts` allows the whole `/uploads/**` path, so `/uploads/media/**`
 * needs no config change.
 */
export const MEDIA_SUBDIR = 'media';

export const STORAGE_SUBDIRS = [
  PRODUCTS_SUBDIR,
  BRANDING_SUBDIR,
  IMPORTS_SUBDIR,
  CONTENT_SUBDIR,
  MEDIA_SUBDIR,
] as const;

export type StorageSubdir = (typeof STORAGE_SUBDIRS)[number];

/** Narrow an untrusted string to a whitelisted {@link StorageSubdir}. */
export function isStorageSubdir(value: string): value is StorageSubdir {
  return (STORAGE_SUBDIRS as readonly string[]).includes(value);
}
