import { isAxiosError } from "axios";
import { dict } from "@/shared/config";

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
 */
export function logoUploadErrorMessage(error: unknown): string {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  switch (status) {
    case 413:
      return dict.storeLogo.errorTooLarge;
    case 415:
      return dict.storeLogo.errorUnsupportedType;
    case 400:
      return dict.storeLogo.errorRejected;
    default:
      return dict.storeLogo.errorGeneric;
  }
}
