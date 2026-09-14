"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ImagePlus,
  Loader2,
  RotateCcw,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  useMediaControllerUpload,
  type MediaAssetDetailEntity,
} from "@/entities/media";
import {
  CONTENT_IMAGE_ACCEPT,
  imageUploadErrorMessage,
} from "@/shared/lib/image-upload-error";
import { Button, useAnnouncer } from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import {
  useImageUploadQueue,
  type UploadDrainSummary,
  type UploadQueueItem,
  type UploadQueueStatus,
} from "@/shared/lib/use-image-upload-queue";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

const t = dict.mediaLibrary;

interface MediaUploadZoneProps {
  /**
   * Called once a whole drain loop has settled, so the grid can refetch exactly
   * once instead of per file. Receives what that loop achieved, which is how
   * the picker knows whether it may close: a batch with a failure in it must
   * stay on screen, because the per-file reason is only in this list.
   */
  onBatchSettled: (summary: UploadDrainSummary) => void | Promise<unknown>;
  /**
   * Called with each asset the server accepted, as it lands (TASK-441).
   *
   * PER FILE and not per batch, because the picker's job is "put this picture
   * where I am" and an operator who drops three of them into a product gallery
   * means all three. For a single-value field (a category tile, a banner) the
   * caller simply overwrites, so the last upload wins — which is what a field
   * holding one URL means anyway.
   *
   * The `/media` screen passes nothing: an upload there belongs to the library,
   * not to anything on screen.
   */
  onAssetUploaded?: (asset: MediaAssetDetailEntity) => void;
}

/**
 * Batch upload into the media library: drop a pile of images in, or pick them.
 *
 * The queue mechanics — one request per file, one drain loop at a time, one
 * summary per loop — are the SHARED `@/shared/lib/use-image-upload-queue`, the
 * same one the product gallery uploads through. Read its docblock before
 * changing anything about ordering, concurrency or the `isUploading` latch. All
 * this component supplies is where a file goes (`POST /api/admin/media`, no
 * target id — a library asset belongs to no entity yet) and whose words explain
 * a refusal.
 *
 * Dropping files is an ADDITION, never the only way in: there is no keyboard
 * equivalent to dragging a file off a desktop, so the picker button inside the
 * zone stays the accessible path, exactly as in `ProductImageManager`. The zone
 * itself is a labelled `role="group"`, not a clickable div — a div with an
 * onClick would be a control a screen-reader user cannot reach.
 *
 * Rendered only for `media:write`. The parent decides that; this component
 * assumes it may upload.
 */
export function MediaUploadZone({
  onBatchSettled,
  onAssetUploaded,
}: MediaUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { announcePolite, announceAssertive } = useAnnouncer();

  /**
   * Kept current without re-capturing the drain loop.
   *
   * A loop outlives many renders and the closure it started with would go on
   * calling a stale callback — the same reason the shared queue holds `send`
   * and `describeError` in refs. See its docblock.
   */
  const onAssetUploadedRef = useRef(onAssetUploaded);
  useEffect(() => {
    onAssetUploadedRef.current = onAssetUploaded;
  });

  const upload = useMediaControllerUpload();
  const queue = useImageUploadQueue<void>({
    send: async (file) => {
      const response = await upload.mutateAsync({ data: { file } });
      // Reported here rather than from `onItemUploaded`, because that hook is
      // handed the QUEUE ITEM (a file) and the caller needs the ASSET the
      // server made of it — the id and the URL only exist in this response.
      onAssetUploadedRef.current?.(response.data);
      return response;
    },
    describeError: (error) => imageUploadErrorMessage(error, t),
  });

  /** Per-file screen-reader reporting, shared by the initial run and retries. */
  const announcers = {
    onItemUploaded: (item: { name: string }) =>
      announcePolite(t.announceUploaded(item.name)),
    onItemFailed: (item: { name: string }, reason: string) =>
      announceAssertive(t.announceFailed(item.name, reason)),
  };

  /**
   * One summary for everything a loop drained — two overlapping drops are a
   * single upload from where the operator sits. A run that only JOINED a loop
   * already in flight resolves to `null` and reports nothing.
   */
  const report = (run: Promise<UploadDrainSummary | null>) => {
    void run.then(async (summary) => {
      if (!summary) return;
      await onBatchSettled(summary);
      if (summary.failed === 0) {
        toast.success(t.toastUploaded);
      } else {
        toast.error(t.toastUploadFailed);
      }
      announcePolite(t.announceAllDone(summary.done, summary.failed));
    });
  };

  const accept = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    report(queue.enqueue(undefined, files, announcers));
  };

  const failedCount = queue.failedItems.length;

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="media-drop-zone"
        role="group"
        aria-label={t.dropZoneAria}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          // No `busy` guard, unlike the picker button: a drop mid-upload joins
          // the queue the running loop is draining rather than starting a second
          // one, so the files are kept instead of silently refused.
          accept(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors",
          isDragging && "border-primary bg-primary/5",
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">
          {isDragging ? t.dropZoneActive : t.dropZone}
        </p>
        <p className="text-xs text-muted-foreground">{t.dropZoneOr}</p>
        <Button
          type="button"
          variant="outline"
          disabled={queue.isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {queue.isUploading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ImagePlus />
          )}
          {t.upload}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={CONTENT_IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            accept(event.target.files);
            // Clear it so re-picking the SAME file after a failure still fires
            // `change` (the value would otherwise be unchanged).
            event.target.value = "";
          }}
        />
        <p className="text-xs text-muted-foreground">{t.hint}</p>
      </div>

      {queue.items.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {t.queueHeading}{" "}
              <span className="font-normal text-muted-foreground">
                {t.queueProgress(queue.doneCount, queue.items.length)}
              </span>
            </h3>
            <div className="flex gap-2">
              {failedCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={queue.isUploading}
                  onClick={() =>
                    report(
                      queue.retry(undefined, queue.failedItems, announcers),
                    )
                  }
                >
                  <RotateCcw />
                  {t.retryAll}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={queue.isUploading}
                onClick={queue.clear}
              >
                {t.clearQueue}
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
                    ? (item.error ?? t.statusFailed)
                    : QUEUE_STATUS_LABEL[item.status]}
                </span>
                {item.status === "failed" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={queue.isUploading}
                    onClick={() =>
                      report(queue.retry(undefined, [item], announcers))
                    }
                  >
                    <RotateCcw />
                    {t.retry}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const QUEUE_STATUS_LABEL: Record<UploadQueueStatus, string> = {
  queued: t.statusQueued,
  uploading: t.statusUploading,
  done: t.statusDone,
  failed: t.statusFailed,
};

/** Per-row status glyph. Decorative — the text next to it carries the meaning. */
function QueueStatusIcon({ status }: { status: UploadQueueItem["status"] }) {
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
