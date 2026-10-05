"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Eye, ImagePlus, Loader2, Upload } from "lucide-react";
import { getMediaControllerFindAllQueryKey } from "@/entities/media";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  MediaAssetDialog,
  MediaAssetGrid,
  MediaPendingTile,
  MediaUploadSummary,
  useMediaUploads,
} from "@/features/media-picker";
import { CONTENT_IMAGE_ACCEPT } from "@/shared/lib/image-upload-error";
import { usePageFileDrop } from "@/shared/lib/use-page-file-drop";
import {
  Button,
  Callout,
  LiveAnnouncer,
  TablePagination,
  TableSearch,
  TableToolbar,
  pageSizeFrom,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.mediaLibrary;

/**
 * The media library screen (TASK-441, plan 177; wave 198 МТ1–МТ12) — `/media`.
 *
 * One place where every uploaded image lives, searchable by alt text or tag,
 * with batch upload, per-asset metadata editing and a delete that refuses while
 * anything still points at the file.
 *
 * WHAT IS ACTUALLY HERE. Composition, plus this screen's own decisions: the
 * URL-backed search and paging (a filtered library is a link an operator can
 * send), the permission gate, and — since wave 198 — where the upload queue is
 * DRAWN. The queue itself is `useMediaUploads` in the feature (the picker's
 * upload tab runs the very same one); this screen lays it out as tiles at the
 * top of the grid, one summary line above it and a button in the page header,
 * and makes the whole window a drop target.
 *
 * WHAT GATES WHAT. `media:read` gates the nav entry and the route (server-side,
 * on every endpoint); it is deliberately NOT enough to change anything.
 * `media:write` decides whether the header button, the hint strip and the
 * page-wide drop target exist at all, and whether the dialog offers a delete —
 * so a content manager granted the read key alone gets a library they can
 * browse rather than a screen of controls that answer 403.
 *
 * NOT DRAWN, because the API cannot answer them yet (wave 198 tails): the
 * views «Усі · Не використовуються · Без опису» and their counts (no usage/alt
 * filter on `GET /admin/media`), sorting (no sort parameter — the list is
 * always newest first), search by file name and the original file name on the
 * card (MediaAsset stores no original name).
 *
 * `LiveAnnouncer` wraps the body rather than sitting inside it: the uploads
 * hook and the toolbar call `useAnnouncer()`, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function MediaLibraryView() {
  return (
    <LiveAnnouncer>
      <MediaLibraryBody />
    </LiveAnnouncer>
  );
}

function MediaLibraryBody() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.mediaWrite);

  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const listKey = getMediaControllerFindAllQueryKey();

  /**
   * Refetch the grid.
   *
   * Invalidating the whole `findAll` key rather than this page's exact params:
   * an upload lands on page 1 (newest first) and a delete shifts every page
   * after it, so any cached page other than the one on screen is wrong too.
   */
  const invalidateGrid = () =>
    queryClient.invalidateQueries({ queryKey: listKey });

  const uploads = useMediaUploads({
    // Per file, not per batch (МТ4): the tile that was uploading is replaced
    // by the real card as soon as the server has made one, rather than a whole
    // batch landing at once at the end.
    onAssetUploaded: () => void invalidateGrid(),
    onBatchSettled: invalidateGrid,
  });

  const drop = usePageFileDrop({ enabled: canWrite, onFiles: uploads.accept });

  // Counts observers of ANY page of the library — which is exactly right for a
  // spinner that means "the library is being re-read".
  const isFetching = useIsFetching({ queryKey: listKey }) > 0;

  const pending = uploads.items.filter(
    (item) => item.status === "queued" || item.status === "uploading",
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {t.heading}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t.subheading}
          </p>
        </div>
        {canWrite && (
          <>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={uploads.isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploads.isUploading ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
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
                uploads.accept(Array.from(event.target.files ?? []));
                // Clear it so re-picking the SAME file after a failure still
                // fires `change`.
                event.target.value = "";
              }}
            />
          </>
        )}
      </header>

      {!canWrite && (
        <Callout
          variant="primary"
          icon={<Eye className="mt-0.5 size-4 shrink-0 text-primary" />}
        >
          {t.readOnlyHint}
        </Callout>
      )}

      <TableToolbar
        className="mb-0"
        onRefresh={() => void invalidateGrid()}
        isRefreshing={isFetching}
        search={
          <TableSearch
            value={search}
            placeholder={t.searchPlaceholder}
            label={t.searchAria}
          />
        }
      />

      {canWrite && (
        // The old drop box, reduced to a hint (МТ1): the whole window takes
        // the drop now, and the header button is the keyboard path. Hidden on
        // a phone (МТ2), where nobody drags files and the button stays.
        <div
          data-testid="media-drop-zone"
          role="group"
          aria-label={t.dropZoneAria}
          className="hidden items-center gap-2.5 rounded-lg border border-dashed border-border px-3.5 py-2.5 text-xs text-muted-foreground sm:flex"
        >
          <Upload className="size-4 shrink-0" aria-hidden="true" />
          <span>
            {t.dropStrip} {t.hint}
          </span>
        </div>
      )}

      <MediaUploadSummary uploads={uploads} />

      <MediaAssetGrid
        search={search}
        page={page}
        pageSize={pageSize}
        canWrite={canWrite}
        isNew={(asset) => uploads.newAssetIds.has(asset.id)}
        leading={
          pending.length > 0
            ? pending.map((item) => (
                <MediaPendingTile
                  key={item.id}
                  item={item}
                  percent={uploads.progressOf(item)}
                />
              ))
            : undefined
        }
        onOpen={(asset) => setOpenAssetId(asset.id)}
        footer={(totalPages) => (
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
          />
        )}
      />

      <MediaAssetDialog
        assetId={openAssetId}
        canWrite={canWrite}
        onClose={() => setOpenAssetId(null)}
        onUpdated={() => void invalidateGrid()}
        onDeleted={() => {
          setOpenAssetId(null);
          void invalidateGrid();
        }}
      />

      {drop.isDragging && (
        // МТ3: the whole page says what a drop will do. `pointer-events-none`
        // so the drop still lands on the window listener, not on this layer.
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-2 z-50 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/5 text-center"
        >
          <Upload className="size-5 text-primary" />
          <p className="text-base font-semibold text-foreground">
            {t.dropZoneActive}
          </p>
          <p className="text-xs text-muted-foreground">
            {drop.count > 0
              ? `${t.dropOverlayCount(drop.count)} · ${t.dropOverlayHint}`
              : t.dropOverlayHint}
          </p>
        </div>
      )}
    </div>
  );
}
