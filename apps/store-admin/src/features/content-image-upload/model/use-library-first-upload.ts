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
 * the library: `POST /admin/uploads/<kind>` stores it but records no asset, so
 * the next form that wanted the same picture could only get it by a second
 * upload. Both routes run the identical `ImageUploadService` pipeline — the
 * kind routes add no processing of their own — so the stored bytes are the
 * same either way; only the library row (and the `media/` subdir) differ.
 *
 * THE FALLBACK STAYS because the two routes are gated by different keys. The
 * kind route needs the form's own key (`categories:write`, …); the library
 * needs `media:write`, which an editor granted after the TASK-441 backfill may
 * lack. Dropping the fallback would take the upload away from them —
 * nobody loses a feature by not being granted a new one.
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
