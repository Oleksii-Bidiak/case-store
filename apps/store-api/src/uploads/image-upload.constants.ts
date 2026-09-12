/**
 * Shared constraints for every image upload in the API (TASK-424).
 *
 * These used to live as private copies inside `product-image.controller.ts` and
 * `product-image.service.ts`. They are here because there is now more than one
 * caller — the four content-image routes in `uploads.controller.ts` — and two
 * drifting copies of "which formats do we accept" is the kind of difference
 * nobody notices until one of them accepts something it should not.
 */

/** Accepted image MIME types mapped to their canonical file extension. */
export const ALLOWED_IMAGE_MIME_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Animated GIFs are passed through untouched: re-encoding to a single WebP frame
 * would kill the animation, so they keep their original bytes/extension and get
 * no LQIP (TASK-091). This is the only path that writes client bytes verbatim,
 * which is why {@link ImageUploadService} sniffs the buffer on it.
 */
export const GIF_MIME = 'image/gif';

/** Business size cap (bytes) → 413. Enforced by the service, not by Multer. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Hard Multer cap. Deliberately larger than {@link MAX_IMAGE_BYTES}: Multer's
 * own limit aborts the stream with a 413 that says nothing useful, so it is set
 * high enough to bound memory use while letting the service produce the real,
 * explainable "over 5 MB" refusal.
 */
export const IMAGE_MULTER_MAX_BYTES = 15 * 1024 * 1024;

/** The URL path segment under which uploads are served (ServeStaticModule root). */
export const PUBLIC_UPLOADS_PREFIX = '/uploads/';

/** Maximum number of files one product-image upload may carry. */
export const MAX_FILES_PER_UPLOAD = 10;
