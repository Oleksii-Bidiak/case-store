"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getMediaControllerFindAllQueryKey,
  useMediaControllerFindAll,
} from "@/entities/media";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  LiveAnnouncer,
  TablePagination,
  TableSearch,
  TableToolbar,
  pageSizeFrom,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { MediaAssetCard } from "./media-asset-card";
import { MediaAssetDialog } from "./media-asset-dialog";
import { MediaLibrarySkeleton } from "./media-library-skeleton";
import { MediaUploadZone } from "./media-upload-zone";

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
 * WHAT GATES WHAT. `media:read` gates the nav entry and the route (server-side,
 * on every endpoint); it is deliberately NOT enough to change anything.
 * `media:write` decides, right here, whether the upload zone renders at all and
 * whether the card offers a delete — so a content manager granted the read key
 * alone gets a library they can browse and search rather than a screen of
 * controls that answer 403.
 *
 * Search, page and page size live in the URL through the shared table controls,
 * which is what makes a filtered library a link an operator can send to someone
 * else. `LiveAnnouncer` wraps the body rather than sitting inside it: the upload
 * zone and the toolbar call `useAnnouncer()`, and a hook called in the same
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

  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const { data, isLoading, isFetching, isError, refetch } =
    useMediaControllerFindAll({
      search: search || undefined,
      page,
      limit: pageSize,
    });

  const assets = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  /**
   * Refetch the grid.
   *
   * Invalidating the whole `findAll` key rather than this page's exact params:
   * an upload lands on page 1 (newest first) and a delete shifts every page
   * after it, so any cached page other than the one on screen is wrong too, and
   * leaving it cached is how an operator pages back and sees a thumbnail whose
   * file is gone.
   */
  const invalidateGrid = () =>
    queryClient.invalidateQueries({
      queryKey: getMediaControllerFindAllQueryKey(),
    });

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
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

      {isLoading ? (
        <MediaLibrarySkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t.loadError}
        </p>
      ) : assets.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {/* "Nothing uploaded yet" and "your search matched nothing" are
              different answers, and only the first has an obvious next step. */}
          {search ? dict.common.table.emptyFiltered : t.empty}
        </div>
      ) : (
        <div className="relative">
          {isFetching && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60"
            >
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {assets.map((asset) => (
              <MediaAssetCard
                key={asset.id}
                asset={asset}
                onOpen={setOpenAssetId}
              />
            ))}
          </ul>
        </div>
      )}

      {!isLoading && !isError && assets.length > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
        />
      )}

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
