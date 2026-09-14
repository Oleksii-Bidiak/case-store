"use client";

import { useEffect, useRef, useState } from "react";

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

/**
 * Send exactly ONE file wherever it belongs, and reject when the server refuses
 * it.
 *
 * This is the only thing that differs between the callers, which is why it is
 * injected rather than imported: this module lives in `shared`, while both the
 * endpoint (`@/entities/product`, `@/entities/media`) and the operator-facing
 * failure copy (`@/features/content-image-upload`) live above it. A queue that
 * reached for either would be an upward import, and there would be no way to add
 * a third caller without editing the queue.
 */
export type UploadQueueSender<TTarget> = (
  file: File,
  target: TTarget,
) => Promise<unknown>;

export interface UploadQueueOptions<TTarget> {
  /** How one file is sent. See {@link UploadQueueSender}. */
  send: UploadQueueSender<TTarget>;
  /**
   * Turn a rejected request into words the operator can act on — normally
   * `imageUploadErrorMessage(error, <this screen's dictionary block>)`.
   */
  describeError: (error: unknown) => string;
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
 * The image upload queue: ONE REQUEST PER FILE (TASK-424), strictly in sequence,
 * drained by ONE loop at a time.
 *
 * Extracted out of `ProductImageManager` by TASK-442 so the create flow could
 * replay the photos an operator staged before the product existed through the
 * very same mechanism, instead of a second, subtly different loop next to it;
 * moved down here from `features/product-image-manager` by TASK-441, when the
 * media library became its third caller. A feature importing another feature is
 * an FSD violation and copying the loop is worse, so the mechanism belongs in
 * `shared` — which is also what forced the endpoint and the failure copy to
 * become arguments (see {@link UploadQueueSender}).
 *
 * The target id stays an argument to `enqueue`/`retry` rather than something the
 * hook is constructed with, because the create flow only learns it from the
 * `POST /products` response — long after this hook was called. Callers with no
 * target at all (the media library uploads into no entity) instantiate it as
 * `useImageUploadQueue<void>` and pass `undefined`.
 *
 * ONE REQUEST PER FILE. The product endpoint accepts ten, and validates every
 * file before writing any of them — right for the API, wrong for this screen:
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
export function useImageUploadQueue<TTarget = void>({
  send,
  describeError,
}: UploadQueueOptions<TTarget>) {
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

  /**
   * The two injected callbacks, kept current without being re-captured per loop.
   *
   * A running loop outlives many renders, and the closure it started with would
   * otherwise go on calling the mutation object built by the render that kicked
   * it off. Reading through a ref on every turn is what `useDebouncedCallback`
   * next door does, for the same reason.
   */
  const sendRef = useRef(send);
  const describeErrorRef = useRef(describeError);
  useEffect(() => {
    sendRef.current = send;
    describeErrorRef.current = describeError;
  });

  const patch = (id: string, changes: Partial<UploadQueueItem>) =>
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );

  const drain = async (
    target: TTarget,
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
        await sendRef.current(item.file, target);
        patch(item.id, { status: "done" });
        done += 1;
        handlers.onItemUploaded?.(item);
      } catch (error) {
        const message = describeErrorRef.current(error);
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

  /** Add files to the visible queue and upload them to `target`. */
  const enqueue = (
    target: TTarget,
    files: File[],
    handlers?: UploadQueueHandlers,
  ): Promise<UploadDrainSummary | null> => {
    const queued = toQueueItems(files);
    if (queued.length === 0) return Promise.resolve(null);
    // Keep finished rows visible alongside the new ones: an operator who drops a
    // second batch should still see which file from the first one failed.
    setItems((prev) => [...prev, ...queued]);
    return drain(target, queued, handlers);
  };

  /** Re-send rows that already live in the queue (a retry). */
  const retry = (
    target: TTarget,
    targets: UploadQueueItem[],
    handlers?: UploadQueueHandlers,
  ): Promise<UploadDrainSummary | null> => drain(target, targets, handlers);

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
