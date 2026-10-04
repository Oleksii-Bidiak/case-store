"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import {
  getMediaControllerFindAllQueryKey,
  useMediaControllerUpload,
} from "@/entities/media";
import { imageUploadErrorMessage } from "@/shared/lib/image-upload-error";
import type { RichTextImage } from "@/shared/ui/rich-text-editor/rich-text-editor";
import { dict } from "@/shared/config";

/**
 * Upload a picture dropped or pasted into the rich-text editor INTO THE MEDIA
 * LIBRARY (wave 198, РЕ5/РЕ6) — the same `POST /api/admin/media` the library
 * screen uses, so the file gets an id, a usage list and a place in the library,
 * and the editor gets back what to put in the text.
 *
 * ── One at a time ──────────────────────────────────────────────────────────
 * Files are sent strictly in sequence, as everywhere else uploads happen
 * (`useImageUploadQueue`): ten pictures dropped at once do not open ten
 * sockets, and — the reason the progress callback can be a single hook-level
 * `onUploadProgress` — exactly one request is ever in flight, so the ref below
 * always names the placeholder the bytes belong to.
 *
 * ── Failure ───────────────────────────────────────────────────────────────
 * Rejects with an `Error` carrying the library's own words for 413/415/other
 * (`imageUploadErrorMessage`), which the editor shows next to the file name.
 */
export function useEditorImageUpload() {
  const queryClient = useQueryClient();
  const progressRef = useRef<((percent: number) => void) | null>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  const mutation = useMediaControllerUpload({
    request: {
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!event.total) return;
        progressRef.current?.(
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        );
      },
    },
  });
  const mutateRef = useRef(mutation.mutateAsync);
  useEffect(() => {
    mutateRef.current = mutation.mutateAsync;
  });

  return useCallback(
    (file: File, onProgress: (percent: number) => void) => {
      const run = chainRef.current.then(async (): Promise<RichTextImage> => {
        progressRef.current = onProgress;
        try {
          const response = await mutateRef.current({ data: { file } });
          // The library screen and every open picker list the new asset.
          void queryClient.invalidateQueries({
            queryKey: getMediaControllerFindAllQueryKey(),
          });
          return { src: response.data.url, alt: response.data.alt };
        } catch (error) {
          throw new Error(imageUploadErrorMessage(error, dict.mediaLibrary));
        } finally {
          progressRef.current = null;
        }
      });
      chainRef.current = run.catch(() => undefined);
      return run;
    },
    [queryClient],
  );
}
