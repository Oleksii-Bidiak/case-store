"use client";

/**
 * Admin carousels view (TASK-139/288; drag/keyboard reordering added in TASK-428).
 *
 * A carousel's `sortOrder` is only meaningful WITHIN its placement — the tab order inside
 * the homepage «Популярне» section for HOME_TABS, the rail order for HOME_RAILS — so each
 * placement is its own `role="grid"` with its own reorder lifecycle. Hooks cannot be
 * called in a loop, which is exactly why `CarouselPlacementSection` exists as a child
 * component. Same shape as `widgets/banner-list`.
 *
 * TWO RULES MAKE THAT SAFE, and they are the same two the banner / blog-category /
 * device-brand grids follow:
 *
 * 1. THE LIST IS NOT PAGINATED. TASK-357 gave this table server paging (`?page=`); a page
 *    is a PARTIAL view, and a reorder computed on a partial view is a partial ordering —
 *    the server rejects it as a lost update (409). The endpoint still accepts
 *    `page`/`limit`; this view asks for the complete list and splits it per placement.
 * 2. THE SEARCH IS LOCAL AND LOCKS REORDERING. A needle hides ROWS, so the visible order
 *    is not the real one — dragging inside it would write the wrong `sortOrder`. The
 *    search therefore moved out of the URL (`mode="local"`) and sets `locked`.
 *
 * `LiveAnnouncer` MUST wrap the view, not sit inside it: the reorder lifecycle and the
 * grids both call `useAnnouncer()`, and a hook called in the same component that renders
 * the provider would read the default no-op context.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import { formatDate } from "@/shared/lib";
import {
  CarouselEntityPlacement,
  getAdminCarouselControllerFindAllQueryKey,
  useAdminCarouselControllerFindAll,
  useAdminCarouselControllerPublish,
  useAdminCarouselControllerUnpublish,
  useAdminCarouselControllerDelete,
  type CarouselEntity,
} from "@/entities/carousel";
import { carouselsToItems, useCarouselReorder } from "@/features/list-reorder";
import {
  useRowFocus,
  useSortableListGrid,
  type SortableListRow,
} from "@/shared/lib/list-reorder";
import {
  Badge,
  Button,
  LiveAnnouncer,
  ReorderUndoButton,
  SortableTree,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSearch,
  TableToolbar,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminCarouselTableSkeleton } from "./admin-carousel-table-skeleton";

/** Placement rendering order — mirrors the storefront top-to-bottom layout. */
const PLACEMENT_ORDER = [
  CarouselEntityPlacement.HOME_TABS,
  CarouselEntityPlacement.HOME_RAILS,
] as const;

export const CAROUSEL_INSTRUCTIONS_LONG_ID = "carousel-grid-instructions-long";
export const CAROUSEL_INSTRUCTIONS_SHORT_ID =
  "carousel-grid-instructions-short";

export function AdminCarouselTable() {
  return (
    <LiveAnnouncer>
      <AdminCarouselView />
    </LiveAnnouncer>
  );
}

function AdminCarouselView() {
  const queryClient = useQueryClient();

  // No arguments: the COMPLETE list. The reorder adapter writes the server's refreshed
  // list into this exact query key, so the two calls must match.
  const { data, isLoading, isFetching, isError, refetch } =
    useAdminCarouselControllerFindAll();
  const publish = useAdminCarouselControllerPublish();
  const unpublish = useAdminCarouselControllerUnpublish();
  const remove = useAdminCarouselControllerDelete();

  const carousels = useMemo(() => data?.data ?? [], [data]);

  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const searchActive = needle.length > 0;

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminCarouselControllerFindAllQueryKey(),
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
              ? dict.carousels.toastUnpublished
              : dict.carousels.toastPublished,
          );
        },
        onError: () => toast.error(dict.carousels.toastStatusFailed),
      },
    );
  };

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(dict.carousels.deleteConfirm(title))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.carousels.toastDeleted);
        },
        onError: () => toast.error(dict.carousels.toastDeleteFailed),
      },
    );
  };

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  const matches = (carousel: CarouselEntity) =>
    !searchActive || carousel.title.toLowerCase().includes(needle);

  const anyMatch = carousels.some(matches);

  return (
    <div className="flex flex-col gap-8">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          // `mode="local"`: the needle hides ROWS, it does not narrow a query — see the
          // header for why this view stays unpaginated and why a search LOCKS reordering
          // instead of PATCHing a partial ordering.
          <TableSearch
            mode="local"
            value={search}
            onChange={(next) => setSearch(next ?? "")}
            placeholder={dict.reorderList.searchPlaceholder}
            label={dict.reorderList.searchLabel}
          />
        }
      />

      <p className="text-sm text-muted-foreground">
        {searchActive
          ? dict.reorderList.searchLockedHint
          : dict.carousels.reorderHint}
      </p>

      <div id={CAROUSEL_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={CAROUSEL_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <AdminCarouselTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.carousels.loadError}
        </p>
      ) : carousels.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.carousels.empty}
        </div>
      ) : searchActive && !anyMatch ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.reorderList.emptyMatch(search.trim())}
        </div>
      ) : (
        PLACEMENT_ORDER.map((placement) => (
          <CarouselPlacementSection
            key={placement}
            placement={placement}
            carousels={carousels}
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

interface CarouselPlacementSectionProps {
  placement: CarouselEntityPlacement;
  /** The UNFILTERED admin carousel list (all placements). */
  carousels: CarouselEntity[];
  /** A search is hiding rows — reordering is off. */
  locked: boolean;
  matches: (carousel: CarouselEntity) => boolean;
  isMutating: boolean;
  onToggle: (id: string, isPublished: boolean) => void;
  onDelete: (id: string, title: string) => void;
}

/**
 * ONE placement = ONE grid = ONE reorder lifecycle. Its items are the placement's
 * COMPLETE bucket (never the filtered rows), because the payload has to name all of them.
 */
function CarouselPlacementSection({
  placement,
  carousels,
  locked,
  matches,
  isMutating,
  onToggle,
  onDelete,
}: CarouselPlacementSectionProps) {
  const items = useMemo(
    () => carouselsToItems(carousels, placement),
    [carousels, placement],
  );
  const byId = useMemo(
    () => new Map(carousels.map((carousel) => [carousel.id, carousel])),
    [carousels],
  );

  const focus = useRowFocus();
  const reorder = useCarouselReorder({
    placement,
    items,
    onFocusRow: focus.focusRow,
  });

  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      const carousel = byId.get(item.id);
      if (carousel && matches(carousel)) ids.add(item.id);
    }
    return ids;
  }, [byId, items, matches]);

  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: "carousel-row-",
    locked,
    visibleIds,
  });

  if (items.length === 0 || grid.rows.length === 0) return null;

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const carousel = byId.get(props.item.id);
    if (!row || !carousel) return null;
    return (
      <CarouselRow
        key={carousel.id}
        carousel={carousel}
        row={row}
        locked={locked}
        isMutating={isMutating}
        onToggle={onToggle}
        onDelete={onDelete}
        registerRef={(node) => {
          focus.registerRow(carousel.id)(node);
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
          {dict.carousels.placementLabels[placement]}
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
          aria-label={dict.carousels.gridLabel(
            dict.carousels.placementLabels[placement],
          )}
          aria-describedby={CAROUSEL_INSTRUCTIONS_LONG_ID}
          aria-busy={reorder.isPending}
        >
          <TableHeader>
            <TableRow aria-rowindex={1}>
              <TableHead>{dict.carousels.colTitle}</TableHead>
              <TableHead>{dict.carousels.colSource}</TableHead>
              <TableHead>{dict.carousels.colStatus}</TableHead>
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

interface CarouselRowProps {
  carousel: CarouselEntity;
  row: SortableListRow;
  locked: boolean;
  isMutating: boolean;
  onToggle: (id: string, isPublished: boolean) => void;
  onDelete: (id: string, title: string) => void;
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function CarouselRow({
  carousel,
  row,
  locked,
  isMutating,
  onToggle,
  onDelete,
  registerRef,
  style,
  handleProps,
}: CarouselRowProps) {
  const isPublished = carousel.status === "PUBLISHED";
  const tabIndex = row.controlTabIndex;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={CAROUSEL_INSTRUCTIONS_SHORT_ID}
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
            aria-label={dict.reorderList.handleLabel(carousel.title)}
            aria-disabled={locked || undefined}
            className="inline-flex size-6 min-h-11 min-w-11 cursor-grab items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <Link
            href={`/carousels/${carousel.id}/edit`}
            tabIndex={tabIndex}
            className="hover:underline"
          >
            {carousel.title}
          </Link>
        </div>
      </TableCell>
      <TableCell role="gridcell">
        <Badge variant="outline">
          {dict.carousels.sourceLabels[carousel.source]}
        </Badge>
      </TableCell>
      <TableCell role="gridcell">
        {/*
         * TASK-430. Carousels were never the defect the badge task was filed for —
         * unlike pages, blog posts and banners, this label already said
         * «Заплановано» rather than «Чернетка», so a scheduled carousel was never
         * mistaken for a forgotten draft. What it lacked was the DATE, which is the
         * half that answers the operator's actual question: scheduled for when?
         * Carried here so all four lists with a PublishStatus read the same.
         */}
        <Badge
          variant={
            carousel.status === "SCHEDULED"
              ? "warning"
              : isPublished
                ? "default"
                : "secondary"
          }
        >
          {carousel.status === "SCHEDULED" && carousel.scheduledAt
            ? dict.carousels.statusScheduledOn(formatDate(carousel.scheduledAt))
            : dict.carousels.statusLabels[carousel.status]}
        </Badge>
      </TableCell>
      <TableCell role="gridcell" className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/carousels/${carousel.id}/edit`} tabIndex={tabIndex}>
              {dict.common.edit}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            tabIndex={tabIndex}
            disabled={isMutating}
            onClick={() => onToggle(carousel.id, isPublished)}
          >
            {isPublished ? dict.carousels.unpublish : dict.carousels.publish}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            tabIndex={tabIndex}
            disabled={isMutating}
            onClick={() => onDelete(carousel.id, carousel.title)}
          >
            {dict.common.delete}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
