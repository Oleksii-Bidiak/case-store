"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { dict } from "@/shared/config";
import {
  useImageUploadQueue,
  type UploadDrainSummary,
  type UploadQueueItem,
  type UploadQueueStatus,
} from "../model/use-image-upload-queue";

interface ProductImageManagerProps {
  /**
   * The product these photos belong to. LIVE mode.
   *
   * Omitted in STAGED mode (TASK-442), on `/products/new`: the product does not
   * exist yet, so there is no `:id` to upload to and nothing to list. The panel
   * then holds nothing of its own — `value` / `onStage` make it a controlled
   * input over the parent's `File[]`, and `CreateProductView` replays that list
   * through the same queue once `POST /products` has answered.
   */
  productId?: string;
  /** STAGED mode: the files the operator has picked so far. */
  value?: File[];
  /** STAGED mode: the full next list, after a pick / reorder / removal. */
  onStage?: (files: File[]) => void;
}

/** Stable identity so the staged `useMemo` below does not churn in live mode. */
const NO_FILES: File[] = [];

/**
 * Admin product-image manager: drag a batch of photos in (or pick them), reorder
 * them, set the primary (cover) image, and delete them.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the view calls
 * `useAnnouncer()` to report each upload, and a hook called in the same component
 * that renders the provider would read the default no-op context.
 */
export function ProductImageManager(props: ProductImageManagerProps) {
  return (
    <LiveAnnouncer>
      <ProductImageManagerView {...props} />
    </LiveAnnouncer>
  );
}

/**
 * The queue mechanics — one request per file, one drain loop at a time — live in
 * `../model/use-image-upload-queue`, which is also what the create flow replays
 * staged photos through. Read its docblock before changing anything about
 * ordering, concurrency or the `isUploading` latch.
 *
 * Reordering is move-buttons, not drag-and-drop: it is the WCAG 2.2 SC 2.5.7
 * non-dragging path and predates this change. Dragging FILES IN is a different
 * interaction — there is no keyboard equivalent to a file on a desktop — so the
 * picker button remains the accessible path for uploading, and the drop zone is
 * an addition, never the only way in.
 */
function ProductImageManagerView({
  productId,
  value,
  onStage,
}: ProductImageManagerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { announcePolite, announceAssertive } = useAnnouncer();

  const isStaged = !productId;
  const staged = value ?? NO_FILES;

  const listQueryKey = getProductImageControllerListQueryKey(productId ?? "");
  const { data, isLoading, isError } = useProductImageControllerList(
    productId ?? "",
    // Nothing to list before the product exists. The hook is still called —
    // rules of hooks — it just never reaches the network (TASK-442).
    { query: { enabled: !isStaged } },
  );
  const images = [...(data?.data ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listQueryKey });

  const queue = useImageUploadQueue();
  const reorder = useProductImageControllerReorder();
  const remove = useProductImageControllerDelete();
  const busy = queue.isUploading || reorder.isPending || remove.isPending;

  /** Per-file screen-reader reporting, shared by the initial run and retries. */
  const announcers = {
    onItemUploaded: (item: { name: string }) =>
      announcePolite(dict.productImages.announceUploaded(item.name)),
    onItemFailed: (item: { name: string }, reason: string) =>
      announceAssertive(dict.productImages.announceFailed(item.name, reason)),
  };

  /**
   * One summary for everything a loop drained: two overlapping drops are a
   * single upload from the operator's point of view, and two toasts (one of them
   * counting only half the files) is how the old double loop announced
   * "Завантаження завершено: 2" with 18 files still to go. A run that only
   * JOINED a running loop resolves to `null` and reports nothing.
   */
  const report = (run: Promise<UploadDrainSummary | null>) => {
    void run.then(async (summary) => {
      if (!summary) return;
      // Refetch once, at the end: the grid below is the same list every request
      // appended to, and invalidating per file would re-render it N times.
      await invalidate();
      if (summary.failed === 0) {
        toast.success(dict.productImages.toastUploaded);
      } else {
        toast.error(dict.productImages.toastUploadFailed);
      }
      announcePolite(
        dict.productImages.announceAllDone(summary.done, summary.failed),
      );
    });
  };

  const accept = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    if (!productId) {
      onStage?.([...staged, ...files]);
      return;
    }
    report(queue.enqueue(productId, files, announcers));
  };

  const retryFailed = () => {
    if (!productId) return;
    report(queue.retry(productId, queue.failedItems, announcers));
  };

  const retryOne = (item: UploadQueueItem) => {
    if (!productId) return;
    report(queue.retry(productId, [item], announcers));
  };

  const failedCount = queue.failedItems.length;

  /** Persist a full ordering + primary flag for the current image set. */
  const persistOrder = (ordered: ProductImageEntity[], primaryId: string) => {
    if (!productId) return;
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
    if (!pendingDeleteId || !productId) return;
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

  // ── Staged-mode editing: pure array moves on the parent's list ─────────────
  const stagedMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= staged.length) return;
    const next = [...staged];
    [next[index], next[target]] = [next[target], next[index]];
    onStage?.(next);
  };

  /** The first staged photo becomes the cover, so "make primary" is "move to front". */
  const stagedSetPrimary = (index: number) => {
    if (index === 0) return;
    const next = [...staged];
    const [picked] = next.splice(index, 1);
    onStage?.([picked, ...next]);
  };

  const stagedRemove = (index: number) =>
    onStage?.(staged.filter((_, i) => i !== index));

  /**
   * Object URLs for the staged thumbnails, revoked when the list changes or the
   * panel unmounts. Guarded: jsdom ships no `createObjectURL`, and a staged
   * photo with no preview is a degraded row, not a crashed panel.
   */
  const previews = useMemo(
    () =>
      staged.map((file) => ({
        file,
        url:
          typeof URL !== "undefined" &&
          typeof URL.createObjectURL === "function"
            ? URL.createObjectURL(file)
            : null,
      })),
    [staged],
  );
  useEffect(
    () => () => {
      for (const preview of previews) {
        if (preview.url) URL.revokeObjectURL(preview.url);
      }
    },
    [previews],
  );

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
          // joins the queue the running loop is draining (see the hook's
          // docblock) instead of starting a second one, so the photos are kept
          // rather than silently refused.
          accept(event.dataTransfer.files);
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
          {queue.isUploading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ImagePlus />
          )}
          {dict.productImages.upload}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            accept(event.target.files);
            // Clear it so re-picking the SAME file after a failure still fires
            // `change` (the value would otherwise be unchanged).
            event.target.value = "";
          }}
        />
        <p className="text-xs text-muted-foreground">
          {dict.productImages.hint}
        </p>
        {isStaged && (
          <p className="text-xs text-muted-foreground">
            {dict.productImages.stagedHint}
          </p>
        )}
      </div>

      {!isStaged && queue.items.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {dict.productImages.queueHeading}{" "}
              <span className="font-normal text-muted-foreground">
                {dict.productImages.queueProgress(
                  queue.doneCount,
                  queue.items.length,
                )}
              </span>
            </h3>
            <div className="flex gap-2">
              {failedCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={queue.isUploading}
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
                disabled={queue.isUploading}
                onClick={queue.clear}
              >
                {dict.productImages.clearQueue}
              </Button>
            </div>
          </div>

          <ul className="flex flex-col gap-1">
            {queue.items.map((item) => (
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
                    disabled={queue.isUploading}
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

      {isStaged ? (
        previews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {dict.productImages.stagedEmpty}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {dict.productImages.stagedCount(previews.length)}
            </p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {previews.map((preview, index) => (
                <li
                  key={`${preview.file.name}-${index}`}
                  className="relative overflow-hidden rounded-lg border border-border bg-card"
                >
                  <div className="aspect-square w-full overflow-hidden bg-muted">
                    {preview.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={preview.url}
                        alt={preview.file.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>

                  {index === 0 && (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                      <Star className="size-3 fill-current" />{" "}
                      {dict.productImages.primary}
                    </span>
                  )}

                  <p className="truncate px-1.5 pt-1.5 text-xs text-muted-foreground">
                    {preview.file.name}
                  </p>

                  <div className="flex items-center justify-between gap-1 p-1.5">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={dict.productImages.moveLeft}
                        disabled={index === 0}
                        onClick={() => stagedMove(index, -1)}
                      >
                        <ArrowLeft />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={dict.productImages.moveRight}
                        disabled={index === previews.length - 1}
                        onClick={() => stagedMove(index, 1)}
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
                        disabled={index === 0}
                        onClick={() => stagedSetPrimary(index)}
                      >
                        <Star />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={dict.productImages.removeStaged(
                          preview.file.name,
                        )}
                        onClick={() => stagedRemove(index)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      ) : isLoading ? (
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

const QUEUE_STATUS_LABEL: Record<UploadQueueStatus, string> = {
  queued: dict.productImages.statusQueued,
  uploading: dict.productImages.statusUploading,
  done: dict.productImages.statusDone,
  failed: dict.productImages.statusFailed,
};

/** Per-row status glyph. Decorative — the text next to it carries the meaning. */
function QueueStatusIcon({ status }: { status: UploadQueueStatus }) {
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
