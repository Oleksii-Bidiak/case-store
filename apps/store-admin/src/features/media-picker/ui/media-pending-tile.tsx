"use client";

import { useEffect, useMemo } from "react";
import { ImageIcon } from "lucide-react";
import type { UploadQueueItem } from "@/shared/lib/use-image-upload-queue";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.mediaLibrary;

/**
 * A local preview of a file that is not on the server yet.
 *
 * `URL.createObjectURL` is absent in jsdom and in some locked-down browsers; the
 * tile then shows a neutral icon, which is all the artboard draws anyway.
 */
function useObjectUrl(file: File): string | null {
  const url = useMemo(
    () =>
      typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null,
    [file],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

interface MediaPendingTileProps {
  item: UploadQueueItem;
  /** Percent of this file sent so far; `null` = not reported yet. */
  percent: number | null;
}

/**
 * A file on its way into the library, drawn where it is going to land — at the
 * top of the grid (wave 198, МТ4).
 *
 * The old screen listed uploads in a separate box above the grid, so a new
 * picture appeared in two places a second apart and the operator had to look
 * for it twice. The tile keeps the same shape as a card so the grid does not
 * reflow when the real card replaces it.
 *
 * Not a button: there is nothing to open until the server has made an asset of
 * the file. The file's own name is the only label it has, and the one place the
 * operator's chosen name is visible at all (the API does not store it yet).
 */
export function MediaPendingTile({ item, percent }: MediaPendingTileProps) {
  const preview = useObjectUrl(item.file);
  const uploading = item.status === "uploading";

  return (
    <li className="flex" aria-busy="true">
      <div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card">
        <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="h-full w-full object-cover opacity-60"
            />
          ) : (
            <ImageIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          {/* An opaque pill under the tinted badge, so it reads over any photo. */}
          <span className="absolute top-2 left-2 rounded-full bg-background">
            <Badge variant="new">{t.newBadge}</Badge>
          </span>
        </span>

        <span className="flex flex-1 flex-col gap-0.5 p-2.5">
          <span className="truncate text-sm font-medium text-muted-foreground italic">
            {t.noAltAdd}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {item.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {uploading ? t.pendingUploading(percent) : t.pendingQueued}
          </span>
          <span className="mt-1.5 flex">
            <Badge variant="secondary">{t.unusedBadge}</Badge>
          </span>
        </span>

        <span
          className="block h-1 w-full bg-muted"
          role="progressbar"
          aria-label={item.name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uploading && percent !== null ? percent : undefined}
        >
          <span
            className="block h-full bg-primary transition-all motion-reduce:transition-none"
            style={{ width: `${uploading ? (percent ?? 2) : 0}%` }}
          />
        </span>
      </div>
    </li>
  );
}
