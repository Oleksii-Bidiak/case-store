"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { getMediaControllerFindAllQueryKey } from "@/entities/media";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  MediaAssetDialog,
  MediaAssetGrid,
  MediaUploadZone,
} from "@/features/media-picker";
import {
  LiveAnnouncer,
  TablePagination,
  TableSearch,
  TableToolbar,
  pageSizeFrom,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.mediaLibrary;

/**
 * The media library screen (TASK-441, plan 177) — `/media`.
 *
 * One place where every uploaded image lives, searchable by alt text or tag,
 * with batch upload, per-asset metadata editing and a delete that refuses while
 * anything still points at the file. Until this screen existed, the only way to
 * get an image into the shop was to upload it INTO a product, and the same
 * picture needed re-uploading for a category tile, a banner and an article.
 *
 * WHAT IS ACTUALLY HERE, since step e. Nothing but composition: the grid, the
 * card, the upload zone and the asset dialog all moved into
 * `features/media-picker`, because the picker that appears inside every content
 * form needs exactly the same parts and a feature may not import a widget. What
 * is left is this screen's own decisions — the URL-backed search and paging
 * (which is what makes a filtered library a link an operator can send), the
 * permission gate, and the fact that a card opens the detail dialog here rather
 * than picking.
 *
 * WHAT GATES WHAT. `media:read` gates the nav entry and the route (server-side,
 * on every endpoint); it is deliberately NOT enough to change anything.
 * `media:write` decides, right here, whether the upload zone renders at all and
 * whether the card offers a delete — so a content manager granted the read key
 * alone gets a library they can browse and search rather than a screen of
 * controls that answer 403.
 *
 * `LiveAnnouncer` wraps the body rather than sitting inside it: the upload zone
 * and the toolbar call `useAnnouncer()`, and a hook called in the same component
 * that renders the provider would read the default no-op context.
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

  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const listKey = getMediaControllerFindAllQueryKey();

  /**
   * Refetch the grid.
   *
   * Invalidating the whole `findAll` key rather than this page's exact params:
   * an upload lands on page 1 (newest first) and a delete shifts every page
   * after it, so any cached page other than the one on screen is wrong too, and
   * leaving it cached is how an operator pages back and sees a thumbnail whose
   * file is gone.
   *
   * It is also what the toolbar's «Оновити» does, now that the query itself
   * lives one layer down in `MediaAssetGrid`: invalidating the key and calling
   * `refetch()` on the observer have the same effect here, and only one of them
   * needs the query handle.
   */
  const invalidateGrid = () =>
    queryClient.invalidateQueries({ queryKey: listKey });

  // Counts observers of ANY page of the library — which is exactly right for a
  // spinner that means "the library is being re-read".
  const isFetching = useIsFetching({ queryKey: listKey }) > 0;

  return (
    <div className="flex flex-col gap-4">
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

      {canWrite ? (
        <MediaUploadZone onBatchSettled={invalidateGrid} />
      ) : (
        <p className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          {t.readOnlyHint}
        </p>
      )}

      <MediaAssetGrid
        search={search}
        page={page}
        pageSize={pageSize}
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
    </div>
  );
}
