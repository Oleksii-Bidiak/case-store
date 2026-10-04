"use client";

import { useEffect, useRef, useState } from "react";
import type { AxiosProgressEvent } from "axios";
import {
  useMediaControllerUpload,
  type MediaAssetDetailEntity,
} from "@/entities/media";
import { imageUploadErrorMessage } from "@/shared/lib/image-upload-error";
import { useAnnouncer } from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import {
  useImageUploadQueue,
  type UploadDrainSummary,
  type UploadQueueItem,
} from "@/shared/lib/use-image-upload-queue";
import { dict } from "@/shared/config";

const t = dict.mediaLibrary;

export interface MediaUploadsOptions {
  /**
   * Called once a whole drain loop has settled — see `MediaUploadZone`. The
   * picker uses the summary to decide whether it may close.
   */
  onBatchSettled: (summary: UploadDrainSummary) => void | Promise<unknown>;
  /** Called with each asset the server accepted, as it lands. */
  onAssetUploaded?: (asset: MediaAssetDetailEntity) => void;
}

export interface MediaUploads {
  /** Every file this screen has been handed, with its outcome. */
  items: UploadQueueItem[];
  failedItems: UploadQueueItem[];
  doneCount: number;
  isUploading: boolean;
  /**
   * Upload percentage of the file being sent right now, by queue item id.
   * `null` until the browser reports the first byte — never a made-up 0 %.
   */
  progressOf: (item: UploadQueueItem) => number | null;
  /** Ids of assets uploaded since this screen opened — the «Нове» badge. */
  newAssetIds: ReadonlySet<string>;
  /** Hand files over; they join the running loop if there is one. */
  accept: (files: File[]) => void;
  retry: (items: UploadQueueItem[]) => void;
  clear: () => void;
}

/**
 * Upload images into the media library, one request per file (TASK-441), with
 * per-file progress and a memory of what arrived (wave 198, МТ4).
 *
 * Pulled out of `MediaUploadZone` so the `/media` screen could take the same
 * queue apart and lay it out differently — tiles inside the grid, a summary
 * above it, a button in the page header — while the picker's «Завантажити
 * нове» tab keeps its zone. One queue, two layouts; never two queues.
 *
 * ── Progress without a second request path ───────────────────────────────
 * The upload still goes through the Orval hook. Its `request` option is the
 * axios config, so `onUploadProgress` rides along with it. One callback serves
 * every file because the queue is STRICTLY SEQUENTIAL (see
 * `useImageUploadQueue`): at any moment exactly one file is in flight, and the
 * ref below says which.
 */
export function useMediaUploads({
  onBatchSettled,
  onAssetUploaded,
}: MediaUploadsOptions): MediaUploads {
  const { announcePolite, announceAssertive } = useAnnouncer();

  const [progress, setProgress] = useState<{
    file: File;
    percent: number;
  } | null>(null);
  const [newAssetIds, setNewAssetIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /** The file the current request is carrying. */
  const sendingRef = useRef<File | null>(null);

  /** Current callbacks for a loop that outlives the render that started it. */
  const onAssetUploadedRef = useRef(onAssetUploaded);
  const onBatchSettledRef = useRef(onBatchSettled);
  useEffect(() => {
    onAssetUploadedRef.current = onAssetUploaded;
    onBatchSettledRef.current = onBatchSettled;
  });

  const upload = useMediaControllerUpload({
    request: {
      onUploadProgress: (event: AxiosProgressEvent) => {
        const file = sendingRef.current;
        if (!file || !event.total) return;
        setProgress({
          file,
          percent: Math.min(
            100,
            Math.round((event.loaded / event.total) * 100),
          ),
        });
      },
    },
  });

  const queue = useImageUploadQueue<void>({
    send: async (file) => {
      sendingRef.current = file;
      try {
        const response = await upload.mutateAsync({ data: { file } });
        setNewAssetIds((prev) => new Set(prev).add(response.data.id));
        // Reported here rather than from `onItemUploaded`: that hook gets the
        // queue item (a file), the caller needs the ASSET the server made of it.
        onAssetUploadedRef.current?.(response.data);
        return response;
      } finally {
        sendingRef.current = null;
      }
    },
    describeError: (error) => imageUploadErrorMessage(error, t),
  });

  const announcers = {
    onItemUploaded: (item: { name: string }) =>
      announcePolite(t.announceUploaded(item.name)),
    onItemFailed: (item: { name: string }, reason: string) =>
      announceAssertive(t.announceFailed(item.name, reason)),
  };

  /**
   * One summary per drain loop — two overlapping drops are one upload from
   * where the operator sits. A run that only joined a loop resolves to `null`.
   */
  const report = (run: Promise<UploadDrainSummary | null>) => {
    void run.then(async (summary) => {
      if (!summary) return;
      setProgress(null);
      await onBatchSettledRef.current(summary);
      if (summary.failed === 0) {
        toast.success(t.toastUploaded);
      } else {
        toast.error(t.toastUploadFailed);
      }
      announcePolite(t.announceAllDone(summary.done, summary.failed));
    });
  };

  return {
    items: queue.items,
    failedItems: queue.failedItems,
    doneCount: queue.doneCount,
    isUploading: queue.isUploading,
    progressOf: (item) =>
      item.status === "uploading" && progress?.file === item.file
        ? progress.percent
        : null,
    newAssetIds,
    accept: (files) => {
      if (files.length === 0) return;
      report(queue.enqueue(undefined, files, announcers));
    },
    retry: (items) => report(queue.retry(undefined, items, announcers)),
    clear: queue.clear,
  };
}
