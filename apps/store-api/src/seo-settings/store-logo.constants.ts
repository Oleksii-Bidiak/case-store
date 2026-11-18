/**
 * Upload constraints for the store logo (TASK-299).
 *
 * Deliberately far stricter than the product-image limits: a logo is a small
 * brand mark, not a photo, and every extra accepted byte/format is attack surface
 * on an asset served from the API's own origin.
 */

export const SVG_MIME = 'image/svg+xml';

/** MIME types the logo endpoint accepts. Mirrored by the Multer `fileFilter`. */
export const ALLOWED_LOGO_MIME = new Set([SVG_MIME, 'image/png', 'image/webp', 'image/jpeg']);

/**
 * Formats `sharp` must actually find in a raster upload's bytes. The declared
 * Content-Type is a claim; this is the check that makes it a fact.
 */
export const ALLOWED_LOGO_RASTER_FORMATS = new Set(['png', 'webp', 'jpeg']);

/**
 * Media type for each raster format the logo gate accepts, keyed by what sharp
 * reports — recorded as the library asset's original type (TASK-2041).
 */
export const LOGO_RASTER_SOURCE_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Stored media types a library asset may have to be chosen as the logo
 * (TASK-2041). The upload gate's list: a GIF is refused there, so it is refused
 * here too — an animated logo in the header is not what that slot is for.
 */
export const LOGO_LIBRARY_MIME = ALLOWED_LOGO_MIME;

/** Business size cap (bytes) → 413. A logo has no business weighing megabytes. */
export const MAX_LOGO_BYTES = 1024 * 1024;

/** Hard Multer cap: bounds memory use before the service's stricter limit runs. */
export const LOGO_MULTER_MAX_BYTES = 5 * 1024 * 1024;
