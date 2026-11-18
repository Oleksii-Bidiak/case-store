"use client";

import { useMediaControllerUpload } from "@/entities/media";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import type { ImageUploadMutation } from "./use-image-upload-field";

/**
 * Pick the route a content-form upload goes through (TASK-2002): the media
 * library when this session may write to it, the form's own route otherwise.
 *
 * LIBRARY FIRST because a file uploaded into a form used to be invisible to
 * the library: `POST /admin/uploads/<kind>` stored it but recorded no asset.
 * Since TASK-2042 the kind routes record the asset too (same `media/` subdir,
 * same row, uploader included), so either route now lands in «Медіатека»;
 * the library route stays first only because it is the library's own.
 *
 * THE FALLBACK STAYS because the two routes are gated by different keys. The
 * kind route needs the form's own key (`categories:write`, …); the library
 * needs `media:write`, which an editor granted after the TASK-441 backfill may
 * lack. Dropping the fallback would take the upload away from them —
 * nobody loses a feature by not being granted a new one. Such an editor's
 * asset appears in the library, but editing or deleting it there still needs
 * `media:write`.
 *
 * Both mutations are always created (hooks cannot be conditional); only the
 * chosen one is ever called, so the other one's `isPending` stays false.
 */
export function useLibraryFirstUpload(
  fallback: ImageUploadMutation,
): ImageUploadMutation {
  const { can } = useAuth();
  const library = useMediaControllerUpload();
  return can(PERM.mediaWrite) ? library : fallback;
}
