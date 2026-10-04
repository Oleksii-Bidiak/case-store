"use client";

import { Check, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import type { MediaUploads } from "../model/use-media-uploads";

const t = dict.mediaLibrary;

/**
 * One line above the grid while uploads exist (wave 198, МТ4): how far the
 * queue got, which file was refused and why, and the two queue actions.
 *
 * The files themselves are tiles INSIDE the grid now; this line keeps only
 * what has no tile — the failures. Each failed file keeps its own «Повторити»
 * next to its reason, as it had in the old list: retrying everything is not
 * always what an operator wants after fixing one file.
 */
export function MediaUploadSummary({ uploads }: { uploads: MediaUploads }) {
  const { items, failedItems, doneCount, isUploading } = uploads;
  if (items.length === 0) return null;

  const StatusIcon = isUploading
    ? Loader2
    : failedItems.length > 0
      ? TriangleAlert
      : Check;

  return (
    <section
      aria-label={t.queueHeading}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusIcon
          aria-hidden="true"
          className={
            isUploading
              ? "size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
              : failedItems.length > 0
                ? "size-4 shrink-0 text-destructive"
                : "size-4 shrink-0 text-success"
          }
        />
        <h3 className="text-sm font-semibold">
          {t.queueHeading}:{" "}
          <span>{t.queueProgress(doneCount, items.length)}</span>
        </h3>

        <div className="ml-auto flex flex-wrap gap-2">
          {failedItems.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => uploads.retry(failedItems)}
            >
              <RotateCcw />
              {t.retryAll}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isUploading}
            onClick={uploads.clear}
          >
            {t.clearQueue}
          </Button>
        </div>
      </div>

      {failedItems.length > 0 && (
        <ul className="flex flex-col gap-1">
          {failedItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <span className="min-w-0 flex-1 text-destructive">
                {t.announceFailed(item.name, item.error ?? t.statusFailed)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isUploading}
                onClick={() => uploads.retry([item])}
              >
                <RotateCcw />
                {t.retry}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
