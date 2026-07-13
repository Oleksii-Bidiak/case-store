"use client";

/**
 * Admin banners view (TASK-186; drag/keyboard reordering added in TASK-295).
 *
 * Banners are ordered WITHIN a placement, so each placement section is its own
 * `role="grid"` with its own reorder lifecycle — hooks cannot be called in a loop,
 * which is exactly why `BannerPlacementSection` exists as a child component.
 *
 * THE UNFILTERED LIST IS NOT NEGOTIABLE. The reorder payload must name EVERY
 * banner in the placement or the server rejects it as a lost update (409). The
 * `?placement=` deep link therefore narrows which SECTIONS render, never the
 * query, and the free-text search — which hides ROWS — LOCKS reordering instead of
 * silently sending a partial ordering.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  BannerEntityPlacement,
  getAdminBannerControllerFindAllQueryKey,
  useAdminBannerControllerFindAll,
  useAdminBannerControllerPublish,
  useAdminBannerControllerUnpublish,
  useAdminBannerControllerDelete,
  type BannerEntity,
} from "@/entities/banner";
import { bannersToItems, useBannerReorder } from "@/features/list-reorder";
import {
  useRowFocus,
  useSortableListGrid,
  type SortableListRow,
} from "@/shared/lib/list-reorder";
import {
  Badge,
  Button,
  Input,
  LiveAnnouncer,
  ReorderUndoButton,
  SortableTree,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminBannerTableSkeleton } from "./admin-banner-table-skeleton";

/** Placement rendering order — mirrors the storefront top-to-bottom layout. */
const PLACEMENT_ORDER = [
  BannerEntityPlacement.ANNOUNCEMENT_BAR,
  BannerEntityPlacement.HERO_SLIDE,
  BannerEntityPlacement.PROMO_TILE,
  BannerEntityPlacement.PROMO_BANNER,
] as const;

export const BANNER_INSTRUCTIONS_LONG_ID = "banner-grid-instructions-long";
export const BANNER_INSTRUCTIONS_SHORT_ID = "banner-grid-instructions-short";

/**
 * Narrow a raw `?placement=` value to a real placement. An unknown/absent value
 * is rejected so the render loop falls back to the full grouped view (TASK-264-C
 * deep link from the content map).
 */
function isValidPlacement(
  value: string | null,
): value is BannerEntityPlacement {
  return (
    value !== null && (PLACEMENT_ORDER as readonly string[]).includes(value)
  );
}

/**
 * `LiveAnnouncer` MUST wrap the view, not sit inside it: the reorder lifecycle
 * and the grids both call `useAnnouncer()`, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function AdminBannerTable() {
  return (
    <LiveAnnouncer>
      <AdminBannerView />
    </LiveAnnouncer>
  );
}

function AdminBannerView() {
  const queryClient = useQueryClient();

  // Optional `?placement=` deep link (TASK-264-C): when it names a real
  // placement, only that one section renders. The QUERY is never narrowed.
  const searchParams = useSearchParams();
  const placementParam = searchParams.get("placement");
  const visiblePlacements: readonly BannerEntityPlacement[] = isValidPlacement(
    placementParam,
  )
    ? [placementParam]
    : PLACEMENT_ORDER;

  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const searchActive = needle.length > 0;

  const { data, isLoading, isError } = useAdminBannerControllerFindAll();
  const publish = useAdminBannerControllerPublish();
  const unpublish = useAdminBannerControllerUnpublish();
  const remove = useAdminBannerControllerDelete();

  const banners = useMemo(() => data?.data ?? [], [data]);

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminBannerControllerFindAllQueryKey(),
    });

  const handleToggle = (id: string, isPublished: boolean) => {
    const mutation = isPublished ? unpublish : publish;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            isPublished
              ? dict.banners.toastUnpublished
              : dict.banners.toastPublished,
          );
        },
        onError: () => toast.error(dict.banners.toastStatusFailed),
      },
    );
  };

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(dict.banners.deleteConfirm(title))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.banners.toastDeleted);
        },
        onError: () => toast.error(dict.banners.toastDeleteFailed),
      },
    );
  };

  if (isLoading) {
    return <AdminBannerTableSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.banners.loadError}
      </p>
    );
  }

  if (banners.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.banners.empty}
      </div>
    );
  }

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  const matches = (banner: BannerEntity) =>
    !searchActive || banner.title.toLowerCase().includes(needle);

  const anyMatch = banners.some(matches);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={dict.reorderList.searchPlaceholder}
          aria-label={dict.reorderList.searchLabel}
          className="max-w-xs"
        />
      </div>

      {searchActive && (
        <p className="text-sm text-muted-foreground">
          {dict.reorderList.searchLockedHint}
        </p>
      )}

      <div id={BANNER_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={BANNER_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {searchActive && !anyMatch ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.reorderList.emptyMatch(search.trim())}
        </div>
      ) : (
        visiblePlacements.map((placement) => (
          <BannerPlacementSection
            key={placement}
            placement={placement}
            banners={banners}
            locked={searchActive}
            matches={matches}
            isMutating={isMutating}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        ))
      )}
    </div>
  );
}

interface BannerPlacementSectionProps {
  placement: BannerEntityPlacement;
  /** The UNFILTERED admin banner list (all placements). */
  banners: BannerEntity[];
  /** A search is hiding rows — reordering is off. */
  locked: boolean;
  matches: (banner: BannerEntity) => boolean;
  isMutating: boolean;
  onToggle: (id: string, isPublished: boolean) => void;
  onDelete: (id: string, title: string) => void;
}

/**
 * ONE placement = ONE grid = ONE reorder lifecycle. Its items are the placement's
 * COMPLETE bucket (never the filtered rows), because the payload has to name all
 * of them.
 */
function BannerPlacementSection({
  placement,
  banners,
  locked,
  matches,
  isMutating,
  onToggle,
  onDelete,
}: BannerPlacementSectionProps) {
  const items = useMemo(
    () => bannersToItems(banners, placement),
    [banners, placement],
  );
  const byId = useMemo(
    () => new Map(banners.map((banner) => [banner.id, banner])),
    [banners],
  );

  const focus = useRowFocus();
  const reorder = useBannerReorder({
    placement,
    items,
    onFocusRow: focus.focusRow,
  });

  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      const banner = byId.get(item.id);
      if (banner && matches(banner)) ids.add(item.id);
    }
    return ids;
  }, [byId, items, matches]);

  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: `banner-row-`,
    locked,
    visibleIds,
  });

  if (items.length === 0 || grid.rows.length === 0) return null;

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const banner = byId.get(props.item.id);
    if (!row || !banner) return null;
    return (
      <BannerRow
        key={banner.id}
        banner={banner}
        row={row}
        locked={locked}
        isMutating={isMutating}
        onToggle={onToggle}
        onDelete={onDelete}
        registerRef={(node) => {
          focus.registerRow(banner.id)(node);
          props.setNodeRef(node);
        }}
        style={props.style}
        handleProps={props.handleProps}
      />
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-foreground">
          {dict.banners.placements[placement]}
        </h3>
        <ReorderUndoButton
          canUndo={reorder.canUndo}
          onUndo={reorder.undo}
          label={dict.reorderList.undo}
        />
      </div>
      <div className="rounded-lg border border-border shadow-card overflow-hidden">
        <Table
          role="grid"
          aria-label={dict.banners.gridLabel(
            dict.banners.placements[placement],
          )}
          aria-describedby={BANNER_INSTRUCTIONS_LONG_ID}
          aria-busy={reorder.isPending}
        >
          <TableHeader>
            <TableRow aria-rowindex={1}>
              <TableHead>{dict.banners.colTitle}</TableHead>
              <TableHead>{dict.banners.colStatus}</TableHead>
              <TableHead className="text-right">
                {dict.common.actions}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SortableTree
              items={grid.sortableItems}
              maxDepth={1}
              disabled={grid.dragDisabled}
              renderRow={renderRow}
              onMove={grid.onPointerMove}
              announcements={grid.pointerAnnouncements}
            />
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

interface BannerRowProps {
  banner: BannerEntity;
  row: SortableListRow;
  locked: boolean;
  isMutating: boolean;
  onToggle: (id: string, isPublished: boolean) => void;
  onDelete: (id: string, title: string) => void;
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function BannerRow({
  banner,
  row,
  locked,
  isMutating,
  onToggle,
  onDelete,
  registerRef,
  style,
  handleProps,
}: BannerRowProps) {
  const isPublished = banner.status === "PUBLISHED";
  const tabIndex = row.controlTabIndex;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={BANNER_INSTRUCTIONS_SHORT_ID}
      style={style}
      className={
        row.grabbed
          ? "outline outline-2 outline-ring"
          : row.conflict
            ? "bg-accent"
            : undefined
      }
    >
      <TableCell role="gridcell" className="font-medium">
        <div className="flex items-center gap-1">
          <button
            type="button"
            {...handleProps}
            tabIndex={tabIndex}
            aria-label={dict.reorderList.handleLabel(banner.title)}
            aria-disabled={locked || undefined}
            className="inline-flex size-6 min-h-11 min-w-11 cursor-grab items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <Link
            href={`/banners/${banner.id}/edit`}
            tabIndex={tabIndex}
            className="hover:underline"
          >
            {banner.title}
          </Link>
        </div>
      </TableCell>
      <TableCell role="gridcell">
        <Badge variant={isPublished ? "default" : "secondary"}>
          {dict.banners.statusLabels[banner.status]}
        </Badge>
      </TableCell>
      <TableCell role="gridcell" className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/banners/${banner.id}/edit`} tabIndex={tabIndex}>
              {dict.common.edit}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            tabIndex={tabIndex}
            disabled={isMutating}
            onClick={() => onToggle(banner.id, isPublished)}
          >
            {isPublished ? dict.banners.unpublish : dict.banners.publish}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            tabIndex={tabIndex}
            disabled={isMutating}
            onClick={() => onDelete(banner.id, banner.title)}
          >
            {dict.common.delete}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
