"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Loader2,
  RotateCcw,
  Star,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  getProductImageControllerListQueryKey,
  useProductImageControllerDelete,
  useProductImageControllerList,
  useProductImageControllerReorder,
  useProductImageControllerUpload,
  type ProductImageEntity,
} from "@/entities/product";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LiveAnnouncer,
  useAnnouncer,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { imageUploadErrorMessage } from "@/features/content-image-upload";
import { dict } from "@/shared/config";

interface ProductImageManagerProps {
  productId: string;
}

/** One queued file and what happened to it. */
type QueueStatus = "queued" | "uploading" | "done" | "failed";

interface QueueItem {
  /** Stable key for React and for `patch()` — a filename is not unique. */
  id: string;
  name: string;
  file: File;
  status: QueueStatus;
  /** Operator-readable failure reason, set when `status === "failed"`. */
  error?: string;
}

let queueSeq = 0;

/**
 * Admin product-image manager: drag a batch of photos in (or pick them), reorder
 * them, set the primary (cover) image, and delete them.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the view calls
 * `useAnnouncer()` to report each upload, and a hook called in the same component
 * that renders the provider would read the default no-op context.
 */
export function ProductImageManager({ productId }: ProductImageManagerProps) {
  return (
    <LiveAnnouncer>
      <ProductImageManagerView productId={productId} />
    </LiveAnnouncer>
  );
}

/**
 * ONE REQUEST PER FILE (TASK-424), even though the endpoint accepts ten.
 *
 * The batch endpoint validates every file before writing any of them, which is
 * right for the API and wrong for this screen: dropping twelve photos of which
 * one is a 9 MB original meant all twelve were refused with a single unexplained
 * toast, and the operator had no way to tell which file was the problem. A
 * request per file buys a per-file outcome, a per-file reason, and a retry that
 * re-sends only what failed. Uploads run strictly in sequence so the images keep
 * the order they were dropped in (`sortOrder` is assigned server-side, per
 * request) and so a drop of thirty photos does not open thirty sockets at once.
 *
 * Reordering is move-buttons, not drag-and-drop: it is the WCAG 2.2 SC 2.5.7
 * non-dragging path and predates this change. Dragging FILES IN is a different
 * interaction — there is no keyboard equivalent to a file on a desktop — so the
 * picker button remains the accessible path for uploading, and the drop zone is
 * an addition, never the only way in.
 */
function ProductImageManagerView({ productId }: ProductImageManagerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { announcePolite, announceAssertive } = useAnnouncer();

  /**
   * Files accepted but not yet sent, and whether a loop is draining them.
   *
   * Refs, not state: `runQueue` below reads both after every `await`, and a
   * state snapshot captured when the loop started would never see a batch
   * dropped while it was running.
   */
  const pendingRef = useRef<QueueItem[]>([]);
  const isDrainingRef = useRef(false);

  const listQueryKey = getProductImageControllerListQueryKey(productId);
  const { data, isLoading, isError } = useProductImageControllerList(productId);
  const images = [...(data?.data ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listQueryKey });

  const upload = useProductImageControllerUpload();
  const reorder = useProductImageControllerReorder();
  const remove = useProductImageControllerDelete();
  const busy = isUploading || reorder.isPending || remove.isPending;

  const patch = (id: string, changes: Partial<QueueItem>) =>
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );

  /**
   * Queue the given items and upload them one after another, reporting each one.
   *
   * ONE DRAIN LOOP AT A TIME — this is the whole reason `pendingRef` exists.
   * The drop zone cannot be disabled the way the picker button is (a browser
   * drops files on whatever is under the cursor), so a second drop lands here
   * while the first batch is still going. When each call looped over its OWN
   * argument, that second drop started a SECOND loop, and whichever finished
   * first called `setIsUploading(false)` — re-enabling «Очистити список»,
   * «Повторити невдалі» and every per-image move/primary/delete control while
   * the other loop was still uploading. Drop 20 photos, then 2 more: the 2-file
   * loop wins, the operator presses «Очистити список», `setQueue([])` runs and
   * the remaining 18 uploads go invisible (`patch()` matches no row any more);
   * or they reorder/delete, and the `reorder` payload is computed from a gallery
   * the server is still appending to. Appending to one queue that one loop
   * drains keeps `isUploading` true until the LAST file has settled AND keeps
   * the second drop — refusing it (an `if (busy) return`) would silently lose
   * photos the operator watched land in the zone. Do not "simplify" this back
   * into a loop over `items`.
   */
  const runQueue = async (items: QueueItem[]) => {
    if (items.length === 0) return;
    pendingRef.current = [...pendingRef.current, ...items];
    // A loop is already running — it will pick these up on its next turn.
    if (isDrainingRef.current) return;

    isDrainingRef.current = true;
    setIsUploading(true);
    let done = 0;
    let failed = 0;

    for (;;) {
      const item = pendingRef.current.shift();
      if (!item) break;
      patch(item.id, { status: "uploading", error: undefined });
      try {
        await upload.mutateAsync({
          productId,
          data: { files: [item.file] },
        });
        patch(item.id, { status: "done" });
        done += 1;
        announcePolite(dict.productImages.announceUploaded(item.name));
      } catch (error) {
        const message = imageUploadErrorMessage(error, dict.productImages);
        patch(item.id, { status: "failed", error: message });
        failed += 1;
        announceAssertive(
          dict.productImages.announceFailed(item.name, message),
        );
      }
    }

    // Released together, and only once `pendingRef` is empty: any drop that
    // arrives from here on starts a fresh loop, which re-disables the controls
    // synchronously in the same drop handler — there is no window in which a
    // file is in flight and the gallery is live.
    isDrainingRef.current = false;
    setIsUploading(false);
    // Refetch once, at the end: the grid below is the same list every request
    // appended to, and invalidating per file would re-render it N times.
    await invalidate();

    // One summary for everything this loop drained: two overlapping drops were
    // a single upload from the operator's point of view, and two toasts (one of
    // them counting only half the files) is how the old double loop announced
    // "Завантаження завершено: 2" with 18 files still to go.
    if (failed === 0) {
      toast.success(dict.productImages.toastUploaded);
    } else {
      toast.error(dict.productImages.toastUploadFailed);
    }
    announcePolite(dict.productImages.announceAllDone(done, failed));
  };

  const enqueue = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    const items: QueueItem[] = files.map((file) => ({
      id: `q${(queueSeq += 1)}`,
      name: file.name,
      file,
      status: "queued",
    }));
    // Keep finished rows visible alongside the new ones: an operator who drops a
    // second batch should still see which file from the first one failed.
    setQueue((prev) => [...prev, ...items]);
    void runQueue(items);
  };

  const retryFailed = () => {
    const failed = queue.filter((item) => item.status === "failed");
    void runQueue(failed);
  };

  const retryOne = (item: QueueItem) => void runQueue([item]);

  const failedCount = queue.filter((item) => item.status === "failed").length;
  const doneCount = queue.filter((item) => item.status === "done").length;

  /** Persist a full ordering + primary flag for the current image set. */
  const persistOrder = (ordered: ProductImageEntity[], primaryId: string) => {
    reorder.mutate(
      {
        productId,
        data: {
          items: ordered.map((img, index) => ({
            id: img.id,
            sortOrder: index,
            isPrimary: img.id === primaryId,
          })),
        },
      },
      {
        onSuccess: () => void invalidate(),
        onError: () => toast.error(dict.productImages.toastReorderFailed),
      },
    );
  };

  const currentPrimaryId =
    images.find((img) => img.isPrimary)?.id ?? images[0]?.id ?? "";

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next, currentPrimaryId);
  };

  const setPrimary = (id: string) => persistOrder(images, id);

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    remove.mutate(
      { productId, imageId: pendingDeleteId },
      {
        onSuccess: () => {
          void invalidate();
          toast.success(dict.productImages.toastDeleted);
        },
        onError: () => toast.error(dict.productImages.toastDeleteFailed),
        onSettled: () => setPendingDeleteId(null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone. `role="group"` + a label rather than a clickable div: the
          keyboard path is the button inside it, and a div with an onClick would
          be a control screen-reader users cannot reach. */}
      <div
        data-testid="image-drop-zone"
        role="group"
        aria-label={dict.productImages.dropZoneAria}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          // No `busy` guard here, unlike the picker button: a drop mid-upload
          // joins the queue the running `runQueue` loop is draining (see its
          // docblock) instead of starting a second one, so the photos are kept
          // rather than silently refused.
          enqueue(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors",
          isDragging && "border-primary bg-primary/5",
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">
          {isDragging
            ? dict.productImages.dropZoneActive
            : dict.productImages.dropZone}
        </p>
        <p className="text-xs text-muted-foreground">
          {dict.productImages.dropZoneOr}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          {dict.productImages.upload}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            enqueue(event.target.files);
            // Clear it so re-picking the SAME file after a failure still fires
            // `change` (the value would otherwise be unchanged).
            event.target.value = "";
          }}
        />
        <p className="text-xs text-muted-foreground">
          {dict.productImages.hint}
        </p>
      </div>

      {queue.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {dict.productImages.queueHeading}{" "}
              <span className="font-normal text-muted-foreground">
                {dict.productImages.queueProgress(doneCount, queue.length)}
              </span>
            </h3>
            <div className="flex gap-2">
              {failedCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={retryFailed}
                >
                  <RotateCcw />
                  {dict.productImages.retryAll}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isUploading}
                onClick={() => setQueue([])}
              >
                {dict.productImages.clearQueue}
              </Button>
            </div>
          </div>

          <ul className="flex flex-col gap-1">
            {queue.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <QueueStatusIcon status={item.status} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span
                  className={cn(
                    "text-xs",
                    item.status === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {item.status === "failed"
                    ? (item.error ?? dict.productImages.statusFailed)
                    : QUEUE_STATUS_LABEL[item.status]}
                </span>
                {item.status === "failed" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isUploading}
                    onClick={() => retryOne(item)}
                  >
                    <RotateCcw />
                    {dict.productImages.retry}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.productImages.loadError}
        </p>
      ) : images.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {dict.productImages.empty}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="aspect-square w-full overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.alt ?? dict.productImages.alt}
                  className="h-full w-full object-cover"
                />
              </div>

              {image.isPrimary && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                  <Star className="size-3 fill-current" />{" "}
                  {dict.productImages.primary}
                </span>
              )}

              <div className="flex items-center justify-between gap-1 p-1.5">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={dict.productImages.moveLeft}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={dict.productImages.moveRight}
                    disabled={busy || index === images.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowRight />
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={dict.productImages.setPrimary}
                    disabled={busy || image.isPrimary}
                    onClick={() => setPrimary(image.id)}
                  >
                    <Star className={image.isPrimary ? "fill-current" : ""} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={dict.productImages.deleteImage}
                    disabled={busy}
                    onClick={() => setPendingDeleteId(image.id)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.productImages.deleteTitle}</DialogTitle>
            <DialogDescription>
              {dict.productImages.deleteDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {dict.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={confirmDelete}
            >
              {remove.isPending && <Loader2 className="animate-spin" />}
              {dict.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  queued: dict.productImages.statusQueued,
  uploading: dict.productImages.statusUploading,
  done: dict.productImages.statusDone,
  failed: dict.productImages.statusFailed,
};

/** Per-row status glyph. Decorative — the text next to it carries the meaning. */
function QueueStatusIcon({ status }: { status: QueueStatus }) {
  if (status === "uploading") {
    return (
      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
    );
  }
  if (status === "done") {
    return (
      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
    );
  }
  if (status === "failed") {
    return (
      <TriangleAlert
        className="size-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
    );
  }
  return (
    <Upload
      className="size-4 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  );
}
