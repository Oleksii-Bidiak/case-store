"use client";

import { useRef, useState } from "react";
import { useProductImageControllerUpload } from "@/entities/product";
import { imageUploadErrorMessage } from "@/features/content-image-upload";
import { dict } from "@/shared/config";

/** One queued file and what happened to it. */
export type UploadQueueStatus = "queued" | "uploading" | "done" | "failed";

export interface UploadQueueItem {
  /** Stable key for React and for `patch()` — a filename is not unique. */
  id: string;
  name: string;
  file: File;
  status: UploadQueueStatus;
  /** Operator-readable failure reason, set when `status === "failed"`. */
  error?: string;
}

/** What one drain loop achieved, reported once the LAST file has settled. */
export interface UploadDrainSummary {
  done: number;
  failed: number;
  failedItems: UploadQueueItem[];
}

/** Per-file reporting hooks, supplied by whoever starts a run. */
export interface UploadQueueHandlers {
  onItemUploaded?: (item: UploadQueueItem) => void;
  onItemFailed?: (item: UploadQueueItem, reason: string) => void;
}

let queueSeq = 0;

const toQueueItems = (files: File[]): UploadQueueItem[] =>
  files.map((file) => ({
    id: `q${(queueSeq += 1)}`,
    name: file.name,
    file,
    status: "queued" as const,
  }));

/**
 * The product-photo upload queue: ONE REQUEST PER FILE (TASK-424), strictly in
 * sequence, drained by ONE loop at a time.
 *
 * Extracted out of `ProductImageManager` by TASK-442 so the create flow can
 * replay the photos an operator staged before the product existed through the
 * very same mechanism, instead of a second, subtly different loop next to it.
 * The queue is product-agnostic: the target id is an argument to
 * `enqueue`/`retry`, because the create flow only learns it from the
 * `POST /products` response.
 *
 * ONE REQUEST PER FILE. The endpoint accepts ten, and validates every file
 * before writing any of them — right for the API, wrong for this screen:
 * dropping twelve photos of which one is over the size cap meant all twelve were
 * refused with a single unexplained toast, and the operator had no way to tell
 * which file was the problem. A request per file buys a per-file outcome, a
 * per-file reason, and a retry that re-sends only what failed. Sequential, so
 * the images keep the order they were dropped in (`sortOrder` is assigned
 * server-side, per request) and so a drop of thirty photos does not open thirty
 * sockets at once.
 *
 * ONE DRAIN LOOP AT A TIME — this is the whole reason `pendingRef` exists.
 * The drop zone cannot be disabled the way the picker button is (a browser drops
 * files on whatever is under the cursor), so a second drop lands here while the
 * first batch is still going. When each call looped over its OWN argument, that
 * second drop started a SECOND loop, and whichever finished first cleared
 * `isUploading` — re-enabling «Очистити список», «Повторити невдалі» and every
 * per-image move/primary/delete control while the other loop was still
 * uploading. Drop 20 photos, then 2 more: the 2-file loop wins, the operator
 * presses «Очистити список», the queue is wiped and the remaining 18 uploads go
 * invisible (`patch()` matches no row any more); or they reorder/delete, and the
 * `reorder` payload is computed from a gallery the server is still appending to.
 * Appending to one queue that one loop drains keeps `isUploading` true until the
 * LAST file has settled AND keeps the second batch — refusing it (an
 * `if (busy) return`) would silently lose photos the operator watched land in
 * the zone. Do not "simplify" this back into a loop over the argument.
 *
 * A run that merely JOINED a loop already in flight resolves to `null`: the
 * summary — and the single toast built from it — belongs to the loop that
 * drained the files, because two overlapping drops are one upload to the
 * operator.
 */
export function useImageUploadQueue() {
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  /**
   * Files accepted but not yet sent, and whether a loop is draining them.
   *
   * Refs, not state: the loop below reads both after every `await`, and a state
   * snapshot captured when the loop started would never see a batch enqueued
   * while it was running.
   */
  const pendingRef = useRef<UploadQueueItem[]>([]);
  const isDrainingRef = useRef(false);

  const upload = useProductImageControllerUpload();

  const patch = (id: string, changes: Partial<UploadQueueItem>) =>
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );

  const drain = async (
    productId: string,
    queued: UploadQueueItem[],
    handlers: UploadQueueHandlers = {},
  ): Promise<UploadDrainSummary | null> => {
    if (queued.length === 0) return null;
    pendingRef.current = [...pendingRef.current, ...queued];
    // A loop is already running — it will pick these up on its next turn, and
    // it owns the summary.
    if (isDrainingRef.current) return null;

    isDrainingRef.current = true;
    setIsUploading(true);
    let done = 0;
    const failedItems: UploadQueueItem[] = [];

    for (;;) {
      const item = pendingRef.current.shift();
      if (!item) break;
      patch(item.id, { status: "uploading", error: undefined });
      try {
        await upload.mutateAsync({ productId, data: { files: [item.file] } });
        patch(item.id, { status: "done" });
        done += 1;
        handlers.onItemUploaded?.(item);
      } catch (error) {
        const message = imageUploadErrorMessage(error, dict.productImages);
        patch(item.id, { status: "failed", error: message });
        failedItems.push({ ...item, status: "failed", error: message });
        handlers.onItemFailed?.(item, message);
      }
    }

    // Released together, and only once `pendingRef` is empty: any batch that
    // arrives from here on starts a fresh loop, which re-disables the controls
    // synchronously in the same handler — there is no window in which a file is
    // in flight and the gallery is live.
    isDrainingRef.current = false;
    setIsUploading(false);
    return { done, failed: failedItems.length, failedItems };
  };

  /** Add files to the visible queue and upload them to `productId`. */
  const enqueue = (
    productId: string,
    files: File[],
    handlers?: UploadQueueHandlers,
  ): Promise<UploadDrainSummary | null> => {
    const queued = toQueueItems(files);
    if (queued.length === 0) return Promise.resolve(null);
    // Keep finished rows visible alongside the new ones: an operator who drops a
    // second batch should still see which file from the first one failed.
    setItems((prev) => [...prev, ...queued]);
    return drain(productId, queued, handlers);
  };

  /** Re-send rows that already live in the queue (a retry). */
  const retry = (
    productId: string,
    targets: UploadQueueItem[],
    handlers?: UploadQueueHandlers,
  ): Promise<UploadDrainSummary | null> => drain(productId, targets, handlers);

  const clear = () => setItems([]);

  return {
    items,
    isUploading,
    doneCount: items.filter((item) => item.status === "done").length,
    failedItems: items.filter((item) => item.status === "failed"),
    enqueue,
    retry,
    clear,
  };
}
