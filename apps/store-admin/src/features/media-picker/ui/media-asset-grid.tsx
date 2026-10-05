"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  useMediaControllerFindAll,
  type MediaAssetEntity,
} from "@/entities/media";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { MediaAssetCard } from "./media-asset-card";
import { MediaLibrarySkeleton } from "./media-library-skeleton";

const t = dict.mediaLibrary;

/** The `/media` screen's grid: two columns on a phone, five on a desktop. */
const PAGE_GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

/**
 * The picker's grid (БЛ11): FOUR columns from the dialog's own width, not the
 * window's. A viewport breakpoint inside a fixed-width dialog gave five cramped
 * columns on a wide monitor and the same dialog two columns on a laptop; a
 * container query measures what the grid actually has.
 */
const DIALOG_GRID = "grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4";

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
  /**
   * Tiles drawn BEFORE the first card — the files being uploaded right now
   * (wave 198, МТ4). The grid renders even when the library is still empty
   * while there is something here.
   */
  leading?: ReactNode;
  /** «Нове» on a card. See {@link MediaAssetCard}. */
  isNew?: (asset: MediaAssetEntity) => boolean;
  /** Whether the operator may write alt text. See {@link MediaAssetCard}. */
  canWrite?: boolean;
  /** Which tile is the current choice (picker only). */
  selectedId?: string | null;
  /** Lay the columns out by the container's width (the picker dialog). */
  layout?: "page" | "dialog";
}

/**
 * One page of the media library as a grid of tiles (TASK-441).
 *
 * THE SAME GRID ON BOTH SCREENS, deliberately. It started life inside
 * `widgets/media-library-view`; the picker needed it too, a feature may not
 * import a widget, and a second copy is how the two would drift. So the grid
 * (and the card, the upload zone, the detail dialog) live here in
 * `features/media-picker`, and the `/media` screen is a thin composition over
 * them rather than their owner.
 *
 * WHAT IT DOES NOT OWN: the search box and the pager. Both are pure state plus
 * a place to put it, and the two callers disagree about that place — the URL on
 * the screen, component state in the dialog.
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
  leading,
  isNew,
  canWrite = false,
  selectedId,
  layout = "page",
}: MediaAssetGridProps) {
  const { data, isLoading, isFetching, isError } = useMediaControllerFindAll({
    search: search || undefined,
    page,
    limit: pageSize,
  });

  const assets = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const gridClass = layout === "dialog" ? DIALOG_GRID : PAGE_GRID;

  if (isLoading) return <MediaLibrarySkeleton layout={layout} />;

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t.loadError}
      </p>
    );
  }

  if (assets.length === 0 && !leading) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {search ? dict.common.table.emptyFiltered : t.empty}
      </div>
    );
  }

  return (
    <>
      <div className={cn("relative", layout === "dialog" && "@container")}>
        {isFetching && (
          // A page that is being replaced stays on screen under a veil rather
          // than collapsing to a skeleton: the grid would otherwise jump to
          // full height and back on every keystroke of a debounced search.
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60"
          >
            <Loader2 className="size-6 animate-spin text-primary motion-reduce:animate-none" />
          </div>
        )}
        <ul aria-label={t.gridAria} className={gridClass}>
          {leading}
          {assets.map((asset) => (
            <MediaAssetCard
              key={asset.id}
              asset={asset}
              onOpen={onOpen}
              label={cardLabel}
              isNew={isNew?.(asset) ?? false}
              canWrite={canWrite}
              selected={
                selectedId === undefined ? undefined : selectedId === asset.id
              }
            />
          ))}
        </ul>
      </div>
      {footer?.(totalPages)}
    </>
  );
}
