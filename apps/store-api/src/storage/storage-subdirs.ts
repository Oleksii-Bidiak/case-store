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

export const STORAGE_SUBDIRS = [PRODUCTS_SUBDIR, BRANDING_SUBDIR, IMPORTS_SUBDIR] as const;

export type StorageSubdir = (typeof STORAGE_SUBDIRS)[number];

/** Narrow an untrusted string to a whitelisted {@link StorageSubdir}. */
export function isStorageSubdir(value: string): value is StorageSubdir {
  return (STORAGE_SUBDIRS as readonly string[]).includes(value);
}
