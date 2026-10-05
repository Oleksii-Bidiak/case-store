"use client";

/**
 * Admin carousels view (TASK-139/288; drag/keyboard reordering added in TASK-428;
 * CarouselsProposal КР1–КР4 in wave 198, TASK-1074).
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
 * Without `carousels:write` the screen is view-only (КР3). Every route of the admin
 * carousel API asks for that key today, the list included, so this state becomes
 * reachable only once a read key exists (an API tail); the gate is drawn now.
 *
 * `LiveAnnouncer` MUST wrap the view, not sit inside it: the reorder lifecycle and the
 * grids both call `useAnnouncer()`, and a hook called in the same component that renders
 * the provider would read the default no-op context.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, LockIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import { formatDate } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  CarouselEntityPlacement,
  getAdminCarouselControllerFindAllQueryKey,
  useAdminCarouselControllerFindAll,
  useAdminCarouselControllerPublish,
  useAdminCarouselControllerUnpublish,
  useAdminCarouselControllerDelete,
  DuplicateCarouselItemsError,
  useDuplicateCarousel,
  type CarouselEntity,
} from "@/entities/carousel";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
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
  RowActionsMenu,
  SortableTree,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSearch,
  TableToolbar,
  useConfirmDialog,
  type RowActionItem,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import type { CategoryTreeNodeEntity } from "@/shared/api";
import { dict } from "@/shared/config";
import { AdminCarouselTableSkeleton } from "./admin-carousel-table-skeleton";

const d = dict.carousels;

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

/** Category id → name, from the PUBLIC tree (no catalogue permission needed). */
function categoryNames(
  nodes: readonly CategoryTreeNodeEntity[] | undefined,
): Map<string, string> {
  const names = new Map<string, string>();
  const visit = (node: CategoryTreeNodeEntity) => {
    names.set(node.id, node.name);
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of nodes ?? []) visit(node);
  return names;
}

/** «Хіти продажів · автоматично», «Категорія «Чохли»», «Вибрані вручну». */
function sourceInWords(
  carousel: CarouselEntity,
  names: ReadonlyMap<string, string>,
): string {
  if (carousel.source === "MANUAL") return d.sourceLabels.MANUAL;
  if (carousel.source === "CATEGORY") {
    const name = carousel.categoryId
      ? names.get(carousel.categoryId)
      : undefined;
    return name ? d.sourceCategory(name) : d.sourceLabels.CATEGORY;
  }
  return d.sourceAuto(d.sourceLabels[carousel.source]);
}

function AdminCarouselView() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.carouselsWrite);

  // No arguments: the COMPLETE list. The reorder adapter writes the server's refreshed
  // list into this exact query key, so the two calls must match.
  const { data, isLoading, isFetching, isError, refetch } =
    useAdminCarouselControllerFindAll();
  const publish = useAdminCarouselControllerPublish();
  const unpublish = useAdminCarouselControllerUnpublish();
  const remove = useAdminCarouselControllerDelete();
  const { duplicate, isPending: isDuplicating } = useDuplicateCarousel();
  const { confirm, confirmDialog } = useConfirmDialog();

  const carousels = useMemo(() => data?.data ?? [], [data]);

  // Only a CATEGORY carousel needs a category name.
  const needsCategories = carousels.some(
    (carousel) => carousel.source === "CATEGORY",
  );
  const categoriesQuery = useCategoryControllerGetCategoryTree({
    query: { enabled: needsCategories },
  });
  const names = useMemo(
    () => categoryNames(categoriesQuery.data?.data),
    [categoriesQuery.data],
  );

  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const searchActive = needle.length > 0;

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminCarouselControllerFindAllQueryKey(),
    });

  const handleToggle = (carousel: CarouselEntity) => {
    const isPublished = carousel.status === "PUBLISHED";
    const mutation = isPublished ? unpublish : publish;
    mutation.mutate(
      { id: carousel.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(isPublished ? d.toastUnpublished : d.toastPublished);
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );
  };

  const handleDuplicate = async (carousel: CarouselEntity) => {
    try {
      await duplicate(carousel);
      toast.success(d.toastDuplicated);
    } catch (error) {
      toast.error(
        error instanceof DuplicateCarouselItemsError
          ? d.toastDuplicateItemsFailed
          : d.toastDuplicateFailed,
      );
    }
  };

  const handleDelete = async (carousel: CarouselEntity) => {
    const confirmed = await confirm({
      title: d.deleteTitle(carousel.title),
      description:
        carousel.placement === "HOME_TABS"
          ? d.deleteDescriptionTab(carousel.title)
          : d.deleteDescriptionRail(carousel.title),
      confirmLabel: d.deleteConfirmLabel,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: carousel.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(d.toastDeleted);
        },
        onError: () => toast.error(d.toastDeleteFailed),
      },
    );
  };

  const isMutating =
    publish.isPending ||
    unpublish.isPending ||
    remove.isPending ||
    isDuplicating;

  const rowActions = (carousel: CarouselEntity): RowActionItem[] => {
    const isPublished = carousel.status === "PUBLISHED";
    return [
      { label: dict.common.edit, href: `/carousels/${carousel.id}/edit` },
      {
        label: isPublished ? d.unpublish : d.publish,
        onSelect: () => handleToggle(carousel),
        disabled: isMutating,
      },
      {
        label: d.duplicate,
        onSelect: () => void handleDuplicate(carousel),
        disabled: isMutating,
      },
      {
        label: d.deleteAction,
        onSelect: () => void handleDelete(carousel),
        destructive: true,
        separatorBefore: true,
        disabled: isMutating,
      },
    ];
  };

  const matches = (carousel: CarouselEntity) =>
    !searchActive || carousel.title.toLowerCase().includes(needle);

  const anyMatch = carousels.some(matches);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {d.heading}
        </h2>
        {canWrite && (
          <Button asChild>
            <Link href="/carousels/new">{d.add}</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <TableToolbar
          className="mb-0"
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
          search={
            // `mode="local"`: the needle hides ROWS, it does not narrow a query — see
            // the header for why this view stays unpaginated and why a search LOCKS
            // reordering instead of PATCHing a partial ordering.
            <TableSearch
              mode="local"
              value={search}
              onChange={(next) => setSearch(next ?? "")}
              placeholder={d.searchPlaceholder}
              label={dict.reorderList.searchLabel}
            />
          }
        />

        {!canWrite ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LockIcon aria-hidden="true" className="size-3.5" />
            {dict.common.viewOnly}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {!searchActive && (
              <GripVertical aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            {searchActive ? dict.reorderList.searchLockedHint : d.reorderHint}
          </p>
        )}
      </div>

      <div id={CAROUSEL_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={CAROUSEL_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <AdminCarouselTableSkeleton withHeading={false} />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      ) : carousels.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {d.empty}
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
            names={names}
            canWrite={canWrite}
            rowActions={rowActions}
          />
        ))
      )}

      {confirmDialog}
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
  names: ReadonlyMap<string, string>;
  canWrite: boolean;
  rowActions: (carousel: CarouselEntity) => RowActionItem[];
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
  names,
  canWrite,
  rowActions,
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
    // Without the write key nothing can be reordered — the grid stays a list.
    locked: locked || !canWrite,
    visibleIds,
  });

  if (items.length === 0 || grid.rows.length === 0) return null;

  const placementName = d.placementLabels[placement];
  const headingId = `carousel-section-${placement}`;

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const carousel = byId.get(props.item.id);
    if (!row || !carousel) return null;
    return (
      <CarouselRow
        key={carousel.id}
        carousel={carousel}
        source={sourceInWords(carousel, names)}
        row={row}
        locked={locked}
        canWrite={canWrite}
        actions={canWrite ? rowActions(carousel) : []}
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
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h3
              id={headingId}
              className="text-base font-semibold text-foreground"
            >
              {placementName}
            </h3>
            <span
              aria-hidden="true"
              className="inline-flex min-w-5 justify-center rounded-full bg-muted px-1.5 text-xs leading-4.5 tabular-nums text-foreground"
            >
              {items.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {d.placementWhere[placement]}
          </p>
        </div>
        {canWrite && (
          <ReorderUndoButton
            canUndo={reorder.canUndo}
            onUndo={reorder.undo}
            label={dict.reorderList.undo}
            iconOnly
          />
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <Table
          role="grid"
          aria-label={d.gridLabel(placementName)}
          aria-describedby={CAROUSEL_INSTRUCTIONS_LONG_ID}
          aria-busy={reorder.isPending}
          className="max-md:block"
        >
          {/* Columns named for assistive tech only: the row reads without a
              header strip, and the header row stays row 1 of the grid. */}
          <TableHeader className="sr-only">
            <TableRow aria-rowindex={1}>
              <TableHead>{d.colTitle}</TableHead>
              <TableHead>{d.colShows}</TableHead>
              <TableHead>{d.colStatus}</TableHead>
              <TableHead>{dict.common.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-md:block">
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
  /** The source in words — see `sourceInWords`. */
  source: string;
  row: SortableListRow;
  locked: boolean;
  canWrite: boolean;
  actions: RowActionItem[];
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function CarouselRow({
  carousel,
  source,
  row,
  locked,
  canWrite,
  actions,
  registerRef,
  style,
  handleProps,
}: CarouselRowProps) {
  const tabIndex = row.controlTabIndex;
  // «показує 12» — an automatic source shows `itemLimit` products; a hand-picked
  // one shows every item, and the list payload carries no item count (an API tail).
  const shows =
    carousel.source === "MANUAL" ? null : d.shows(carousel.itemLimit);
  const badge = <StatusBadge carousel={carousel} />;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={CAROUSEL_INSTRUCTIONS_SHORT_ID}
      style={style}
      className={cn(
        // Below md the row is a card (КР2): grip · text · «⋯», with the status
        // and the count folded under the title.
        "max-md:flex max-md:items-start max-md:gap-2 max-md:px-1 max-md:py-2.5",
        row.grabbed
          ? "outline outline-2 outline-ring"
          : row.conflict
            ? "bg-accent"
            : undefined,
      )}
    >
      <TableCell
        role="gridcell"
        className="min-w-0 py-2.5 whitespace-normal max-md:flex-1 max-md:p-0 md:w-full md:max-w-0"
      >
        <div className="flex min-w-0 items-start gap-2 md:items-center">
          {canWrite ? (
            <button
              type="button"
              {...handleProps}
              tabIndex={tabIndex}
              aria-label={dict.reorderList.handleLabel(carousel.title)}
              aria-disabled={locked || undefined}
              className="inline-flex size-6 min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <span className="inline-flex size-6 min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0">
              <LockIcon aria-hidden="true" className="size-4" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            {canWrite ? (
              <Link
                href={`/carousels/${carousel.id}/edit`}
                tabIndex={tabIndex}
                className="font-medium text-foreground hover:underline md:truncate"
              >
                {carousel.title}
              </Link>
            ) : (
              <span className="font-medium text-foreground md:truncate">
                {carousel.title}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{source}</span>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden">
              {badge}
              {shows && (
                <span className="text-xs text-muted-foreground">{shows}</span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell
        role="gridcell"
        className="py-2.5 text-sm whitespace-nowrap text-muted-foreground max-md:hidden"
      >
        {shows ?? "—"}
      </TableCell>
      <TableCell role="gridcell" className="py-2.5 max-md:hidden">
        {badge}
      </TableCell>
      <TableCell
        role="gridcell"
        className="w-12 py-2.5 text-right max-md:w-auto max-md:p-0"
      >
        <RowActionsMenu
          label={dict.common.registry.rowActionsAria(carousel.title)}
          items={actions}
          className="max-md:size-11"
        />
      </TableCell>
    </TableRow>
  );
}

/**
 * TASK-430: a scheduled carousel says WHEN — «Заплановано на 19.09.2026» — so
 * all four lists with a PublishStatus read the same. Canon 1.6: published =
 * default, scheduled = outline, draft = secondary.
 */
function StatusBadge({ carousel }: { carousel: CarouselEntity }) {
  if (carousel.status === "SCHEDULED") {
    return (
      <Badge variant="outline">
        {carousel.scheduledAt
          ? d.statusScheduledOn(formatDate(carousel.scheduledAt))
          : d.statusLabels.SCHEDULED}
      </Badge>
    );
  }
  return (
    <Badge variant={carousel.status === "PUBLISHED" ? "default" : "secondary"}>
      {d.statusLabels[carousel.status]}
    </Badge>
  );
}
