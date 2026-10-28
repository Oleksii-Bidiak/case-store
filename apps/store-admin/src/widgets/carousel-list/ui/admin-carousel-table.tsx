"use client";

/**
 * Admin carousels view (TASK-139/288; drag/keyboard reordering added in TASK-428;
 * CarouselsProposal КР1–КР4 in wave 198, TASK-1074).
 *
 * ONE list since TASK-660 (plan 186): `Carousel.placement` is gone — where a carousel
 * shows on the homepage belongs to the homepage blocks — so the two placement sections
 * collapsed into a single `role="grid"` with one reorder lifecycle. This order is the
 * admin list's only.
 *
 * «НА ГОЛОВНІЙ» (TASK-664, ДН-4.11–4.14) — where each carousel stands, read from the
 * homepage blocks (`GET /admin/home-blocks`, behind `home:read`/`home:write`): links to
 * `/home`, or «ні» with «Додати на головну» (`home:write`). A PUBLISHED carousel that
 * stands nowhere is the trap «створив, опублікував, не видно», so its row is
 * highlighted. Without a home key the column is not drawn at all — an unknown is not
 * «ні», and neither is a list that failed to load («—»).
 *
 * TWO RULES MAKE THAT SAFE, and they are the same two the banner / blog-category /
 * device-brand grids follow:
 *
 * 1. THE LIST IS NOT PAGINATED. TASK-357 gave this table server paging (`?page=`); a page
 *    is a PARTIAL view, and a reorder computed on a partial view is a partial ordering —
 *    the server rejects it as a lost update (409). The endpoint still accepts
 *    `page`/`limit`; this view asks for the complete list.
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
import {
  GripVertical,
  LockIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "@/shared/ui/toast";
import { formatDate } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
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
import {
  describeHomePlacement,
  getAdminHomeBlockControllerFindAllQueryKey,
  homePlacementsByCarousel,
  useAdminHomeBlockControllerFindAll,
  type CarouselHomePlacement,
} from "@/entities/home-block";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { carouselsToItems, useCarouselReorder } from "@/features/list-reorder";
import {
  AddCarouselToHomeDialog,
  type CarouselToHomeTarget,
} from "@/features/carousel-to-home";
import {
  useRowFocus,
  useSortableListGrid,
  type SortableListRow,
} from "@/shared/lib/list-reorder";
import {
  Badge,
  Button,
  Callout,
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

  // TASK-664: where each carousel stands on the homepage.
  const canReadHome = can(PERM.homeRead) || can(PERM.homeWrite);
  const canAddHome = can(PERM.homeWrite);
  const homeBlocks = useAdminHomeBlockControllerFindAll({
    query: { enabled: canReadHome },
  });
  const placements = useMemo(
    () =>
      homeBlocks.data
        ? homePlacementsByCarousel(homeBlocks.data.data)
        : undefined,
    [homeBlocks.data],
  );
  const [toHome, setToHome] = useState<CarouselToHomeTarget | null>(null);
  const home: HomeColumn | null = canReadHome
    ? {
        placements,
        canAdd: canAddHome,
        onAdd: (carousel) =>
          setToHome({
            id: carousel.id,
            title: carousel.title,
            status: carousel.status,
          }),
      }
    : null;

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
      description: d.deleteDescription(carousel.title),
      confirmLabel: d.deleteConfirmLabel,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: carousel.id },
      {
        onSuccess: () => {
          void invalidateList();
          // The blocks that pointed at it changed with it (tabs dropped,
          // a rail block orphaned).
          if (canReadHome) {
            void queryClient.invalidateQueries({
              queryKey: getAdminHomeBlockControllerFindAllQueryKey(),
            });
          }
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

        {/* ДН-4.11: where a carousel shows is decided on «Головна» — said once,
            above the column that answers it. */}
        {home && <Callout>{d.homeIntro}</Callout>}
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
        <CarouselListSection
          carousels={carousels}
          locked={searchActive}
          matches={matches}
          names={names}
          canWrite={canWrite}
          rowActions={rowActions}
          home={home}
        />
      )}

      {confirmDialog}
      {canAddHome && (
        <AddCarouselToHomeDialog
          carousel={toHome}
          onOpenChange={(open) => {
            if (!open) setToHome(null);
          }}
        />
      )}
    </div>
  );
}

interface CarouselListSectionProps {
  /** The UNFILTERED admin carousel list. */
  carousels: CarouselEntity[];
  /** A search is hiding rows — reordering is off. */
  locked: boolean;
  matches: (carousel: CarouselEntity) => boolean;
  names: ReadonlyMap<string, string>;
  canWrite: boolean;
  rowActions: (carousel: CarouselEntity) => RowActionItem[];
  /** The «На головній» column; `null` = the session may not read the blocks. */
  home: HomeColumn | null;
}

/** What the «На головній» column knows (TASK-664). */
interface HomeColumn {
  /** Carousel id → placements; `undefined` while loading or after an error. */
  placements: ReadonlyMap<string, CarouselHomePlacement[]> | undefined;
  /** `home:write` — «Додати на головну» is offered. */
  canAdd: boolean;
  onAdd: (carousel: CarouselEntity) => void;
}

/**
 * ONE grid = ONE reorder lifecycle. Its items are the COMPLETE list (never the filtered
 * rows), because the payload has to name all of them.
 */
function CarouselListSection({
  carousels,
  locked,
  matches,
  names,
  canWrite,
  rowActions,
  home,
}: CarouselListSectionProps) {
  const items = useMemo(() => carouselsToItems(carousels), [carousels]);
  const byId = useMemo(
    () => new Map(carousels.map((carousel) => [carousel.id, carousel])),
    [carousels],
  );

  const focus = useRowFocus();
  const reorder = useCarouselReorder({
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
        home={home}
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
    <section className="flex flex-col gap-2">
      {canWrite && (
        <div className="flex justify-end">
          <ReorderUndoButton
            canUndo={reorder.canUndo}
            onUndo={reorder.undo}
            label={dict.reorderList.undo}
            iconOnly
          />
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <Table
          role="grid"
          aria-label={d.gridLabel}
          aria-describedby={CAROUSEL_INSTRUCTIONS_LONG_ID}
          aria-busy={reorder.isPending}
          className="max-md:block"
        >
          {/* ДН-4.11: a visible header strip from md (a column of buttons and
              links needs its name); below md the rows are cards and the
              header is for assistive tech only. It stays row 1 of the grid. */}
          <TableHeader className="max-md:sr-only">
            <TableRow aria-rowindex={1}>
              <TableHead>{d.colTitle}</TableHead>
              <TableHead>{d.colShows}</TableHead>
              {home && <TableHead>{d.colHome}</TableHead>}
              <TableHead>{d.colStatus}</TableHead>
              <TableHead>
                <span className="sr-only">{dict.common.actions}</span>
              </TableHead>
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
  home: HomeColumn | null;
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
  home,
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
  // `undefined` = not known (no key, loading, error) — never drawn as «ні».
  const placements = home?.placements
    ? (home.placements.get(carousel.id) ?? [])
    : undefined;
  // The trap (ДН-4.11): published, and no block anywhere points at it.
  const trap = carousel.status === "PUBLISHED" && placements?.length === 0;
  const addButton =
    home?.canAdd && placements?.length === 0 ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        tabIndex={tabIndex}
        onClick={() => home.onAdd(carousel)}
        className="w-fit max-md:min-h-11"
      >
        <PlusIcon aria-hidden="true" />
        {d.addToHome}
        <span className="sr-only">{` — ${carousel.title}`}</span>
      </Button>
    ) : null;

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
            : trap
              ? "bg-warning/8 hover:bg-warning/12"
              : undefined,
      )}
      data-home-trap={trap || undefined}
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
            {placements && (
              <span className="text-xs text-muted-foreground md:hidden">
                {d.homeMobile(
                  placements.length > 0
                    ? placements
                        .map((p) => describeHomePlacement(p).where)
                        .join(", ")
                    : d.homeNone,
                )}
              </span>
            )}
            {trap && (
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                <TriangleAlertIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-warning"
                />
                {d.homeTrap}
              </span>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden">
              {badge}
              {shows && (
                <span className="text-xs text-muted-foreground">{shows}</span>
              )}
            </div>
            {addButton && <div className="mt-1.5 md:hidden">{addButton}</div>}
          </div>
        </div>
      </TableCell>
      <TableCell
        role="gridcell"
        className="py-2.5 text-sm whitespace-nowrap text-muted-foreground max-md:hidden"
      >
        {shows ?? "—"}
      </TableCell>
      {home && (
        <TableCell
          role="gridcell"
          className="w-60 py-2.5 text-sm whitespace-normal max-md:hidden"
        >
          <HomeCell
            placements={placements}
            addButton={addButton}
            tabIndex={tabIndex}
          />
        </TableCell>
      )}
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
 * «На головній» (ДН-4.11): each place the carousel stands — a link to `/home` with
 * its position under it — or «ні» / «Додати на головну». Unknown (loading, error)
 * reads «—»: a list that did not load is not proof the carousel stands nowhere.
 */
function HomeCell({
  placements,
  addButton,
  tabIndex,
}: {
  placements: CarouselHomePlacement[] | undefined;
  addButton: React.ReactNode;
  tabIndex: 0 | -1;
}) {
  if (!placements) return <span className="text-muted-foreground">—</span>;
  if (placements.length === 0) {
    return (
      addButton ?? <span className="text-muted-foreground">{d.homeNone}</span>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {placements.map((placement) => {
        const { where, position, hidden } = describeHomePlacement(placement);
        return (
          <li
            key={`${placement.block.id}:${placement.kind}`}
            className="flex flex-col gap-0.5"
          >
            <Link
              href="/home"
              tabIndex={tabIndex}
              aria-label={d.homeLinkAria(where)}
              className="w-fit rounded-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {where}
            </Link>
            <span className="text-xs text-muted-foreground">
              {hidden ? `${position} · ${hidden}` : position}
            </span>
          </li>
        );
      })}
    </ul>
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
