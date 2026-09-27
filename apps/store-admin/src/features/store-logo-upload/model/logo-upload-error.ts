import { dict } from "@/shared/config";
import { imageUploadErrorMessage } from "@/shared/lib/image-upload-error";

/**
 * Extensions offered by the file picker. Mirrors the API's `ALLOWED_LOGO_MIME`
 * (`store-logo.constants.ts`): SVG is stored sanitized, rasters are re-encoded
 * to WebP. `accept` is only a picker hint — the backend re-validates the MIME
 * AND sniffs the real bytes, so a renamed file still gets rejected (415).
 */
export const LOGO_ACCEPT = ".svg,.png,.webp,.jpg,.jpeg";

/**
 * Map a logo-upload failure onto operator-readable copy. The status codes are
 * the API's contract for `POST /api/admin/seo-settings/logo`:
 * 413 = over the 1 MB cap, 415 = MIME or real bytes are not an allowed image,
 * 400 = accepted as an image but unusable (e.g. an SVG with nothing safe left
 * after sanitization, or no file part at all).
 *
 * A thin wrapper over the shared `imageUploadErrorMessage` (TASK-810): it was a
 * copy of it that differed only in what a 400 means, which is now the shared
 * mapper's `errorRejected` parameter. Keys spelled out one by one so the
 * dictionary-usage test sees each of them read.
 */
export function logoUploadErrorMessage(error: unknown): string {
  return imageUploadErrorMessage(error, {
    errorTooLarge: dict.storeLogo.errorTooLarge,
    errorUnsupportedType: dict.storeLogo.errorUnsupportedType,
    errorRejected: dict.storeLogo.errorRejected,
    errorGeneric: dict.storeLogo.errorGeneric,
  });
}
