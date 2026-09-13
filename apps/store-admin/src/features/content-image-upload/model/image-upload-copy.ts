import { isAxiosError } from "axios";

/**
 * Extensions offered by the file picker, mirroring the API's accepted MIME set
 * (`ALLOWED_IMAGE_MIME_EXT` in `uploads/image-upload.constants.ts`). `accept` is
 * only a picker hint — the backend re-checks the MIME AND sniffs the real bytes,
 * so a renamed file is still refused (415).
 */
export const CONTENT_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif";

/**
 * Every string one image field needs. Supplied by the caller from its own
 * dictionary block, because an operator reading «Завантажити обкладинку» on a
 * blog post and «Завантажити логотип» on a brand is the whole point of putting
 * copy next to the entity it describes.
 */
export interface ImageUploadCopy {
  /** Alt text for the preview. */
  alt: string;
  /** Shown when no image is set yet. */
  empty: string;
  upload: string;
  replace: string;
  /** Clears the field — see `removeDescription` for why this is not a delete. */
  remove: string;
  removeTitle: string;
  removeDescription: string;
  /** Format/size guidance under the controls. */
  hint: string;
  toastUploaded: string;
  /** 413 — over the 5 MB cap. */
  errorTooLarge: string;
  /** 400/415 — the MIME or the real bytes are not an accepted image. */
  errorUnsupportedType: string;
  /** Anything else: a network failure, a 500, an expired session. */
  errorGeneric: string;
}

/**
 * Map an upload failure onto operator-readable copy, using the status contract
 * every upload route in the API shares: 413 over the size cap, 415 the bytes are
 * not a decodable image of an allowed type, 400 the declared MIME type is not one
 * we accept (Multer's `fileFilter`), anything else generic.
 *
 * 400 and 415 deliberately produce the SAME message. They are one mistake from
 * where the operator sits — "this file is not a picture we can use" — and the
 * distinction between "the browser's label was wrong" and "the bytes were wrong"
 * is ours, not theirs.
 */
export function imageUploadErrorMessage(
  error: unknown,
  copy: Pick<
    ImageUploadCopy,
    "errorTooLarge" | "errorUnsupportedType" | "errorGeneric"
  >,
): string {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  switch (status) {
    case 413:
      return copy.errorTooLarge;
    case 400:
    case 415:
      return copy.errorUnsupportedType;
    default:
      return copy.errorGeneric;
  }
}
