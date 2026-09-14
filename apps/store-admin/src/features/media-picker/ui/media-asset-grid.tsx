"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  useMediaControllerFindAll,
  type MediaAssetEntity,
} from "@/entities/media";
import { dict } from "@/shared/config";
import { MediaAssetCard } from "./media-asset-card";
import { MediaLibrarySkeleton } from "./media-library-skeleton";

const t = dict.mediaLibrary;

export interface MediaAssetGridProps {
  /** Needle matched against alt text and tags. `""` = unfiltered. */
  search: string;
  /** 1-based page. */
  page: number;
  pageSize: number;
  /** What activating a tile does — open its card, or pick it. */
  onOpen: (asset: MediaAssetEntity) => void;
  /** Accessible name for a tile. See {@link MediaAssetCard}. */
  cardLabel?: (name: string) => string;
  /**
   * Rendered under the grid, given the page count the server reported. A slot
   * and not a built-in pager because the two callers page differently: the
   * `/media` screen puts the page in the URL (so a filtered library is a link
   * someone can send), while the picker must not touch the URL of the form it
   * is floating above.
   */
  footer?: (totalPages: number) => ReactNode;
}

/**
 * One page of the media library as a grid of tiles (TASK-441).
 *
 * THE SAME GRID ON BOTH SCREENS, deliberately. It started life inside
 * `widgets/media-library-view`; the picker needed it too, a feature may not
 * import a widget, and a second copy is how the two would drift — one of them
 * gaining the "0 means unknown" handling, the tag badges or the lazy-loading
 * and the other not. So the grid (and the card, the upload zone, the detail
 * dialog) live here in `features/media-picker`, and the `/media` screen is now
 * a thin composition over them rather than their owner.
 *
 * WHAT IT DOES NOT OWN: the search box and the pager. Both are pure state plus
 * a place to put it, and the two callers disagree about that place — the URL on
 * the screen, component state in the dialog. Passing `search`/`page` in keeps
 * that decision where it belongs and keeps this component free of the router
 * entirely.
 *
 * Loading / error / empty are all here, though, because they are answers ABOUT
 * THE QUERY and the query is here. Empty has two different wordings on purpose:
 * "nothing uploaded yet" and "your search matched nothing" call for different
 * next steps, and only the first is about the library at all.
 */
export function MediaAssetGrid({
  search,
  page,
  pageSize,
  onOpen,
  cardLabel,
  footer,
}: MediaAssetGridProps) {
  const { data, isLoading, isFetching, isError } = useMediaControllerFindAll({
    search: search || undefined,
    page,
    limit: pageSize,
  });

  const assets = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  if (isLoading) return <MediaLibrarySkeleton />;

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t.loadError}
      </p>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {search ? dict.common.table.emptyFiltered : t.empty}
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {isFetching && (
          // A page that is being replaced stays on screen under a veil rather
          // than collapsing to a skeleton: the grid would otherwise jump to
          // full height and back on every keystroke of a debounced search.
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
              onOpen={onOpen}
              label={cardLabel}
            />
          ))}
        </ul>
      </div>
      {footer?.(totalPages)}
    </>
  );
}
