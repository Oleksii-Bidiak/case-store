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

/** Business size cap (bytes) → 413. A logo has no business weighing megabytes. */
export const MAX_LOGO_BYTES = 1024 * 1024;

/** Hard Multer cap: bounds memory use before the service's stricter limit runs. */
export const LOGO_MULTER_MAX_BYTES = 5 * 1024 * 1024;
