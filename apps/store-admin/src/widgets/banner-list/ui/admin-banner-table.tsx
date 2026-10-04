"use client";

/**
 * Admin banners view (TASK-186; drag/keyboard reordering added in TASK-295;
 * BannersProposal БН1–БН4 in wave 198, TASK-1073).
 *
 * Banners are ordered WITHIN a placement, so each placement section is its own
 * `role="grid"` with its own reorder lifecycle — hooks cannot be called in a loop,
 * which is exactly why `BannerPlacementSection` exists as a child component.
 *
 * THE UNFILTERED LIST IS NOT NEGOTIABLE. The reorder payload must name EVERY
 * banner in the placement or the server rejects it as a lost update (409). The
 * `?placement=` deep link therefore narrows which SECTIONS render, never the
 * query; the free-text search and the display-state views — which hide ROWS —
 * LOCK reordering instead of silently sending a partial ordering.
 *
 * That same rule is why TASK-357 left this view UNPAGINATED even though
 * `GET /api/admin/banners` now accepts `page`/`limit`: a page is a partial view,
 * and a reorder computed on a partial view is a partial ordering. It is also
 * what makes the views honest: their counts come from the complete list.
 *
 * Without `banners:write` the screen is view-only (БН3): no add, no «⋯», a lock
 * instead of the grip. Every route of the admin banner API asks for that key
 * today — the list included — so this state only becomes reachable once a read
 * key exists (an API tail); the gate is drawn now so it cannot be forgotten.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, LockIcon, PlusIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  BannerEntityPlacement,
  bannerDisplayState,
  bannerWindowLines,
  duplicateBannerPayload,
  getAdminBannerControllerFindAllQueryKey,
  useAdminBannerControllerCreate,
  useAdminBannerControllerFindAll,
  useAdminBannerControllerPublish,
  useAdminBannerControllerUnpublish,
  useAdminBannerControllerDelete,
  useAdminBannerControllerUpdate,
  type BannerDisplayState,
  type BannerEntity,
} from "@/entities/banner";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { bannersToItems, useBannerReorder } from "@/features/list-reorder";
import {
  useRowFocus,
  useSortableListGrid,
  type SortableListRow,
} from "@/shared/lib/list-reorder";
import { useNow } from "@/shared/lib/use-now";
import {
  Badge,
  Button,
  LiveAnnouncer,
  QuickViews,
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
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { AdminBannerTableSkeleton } from "./admin-banner-table-skeleton";

const d = dict.banners;

/** Placement rendering order — mirrors the storefront top-to-bottom layout. */
export const BANNER_PLACEMENT_ORDER = [
  BannerEntityPlacement.ANNOUNCEMENT_BAR,
  BannerEntityPlacement.HERO_SLIDE,
  BannerEntityPlacement.PROMO_TILE,
  BannerEntityPlacement.PROMO_BANNER,
] as const;

export const BANNER_INSTRUCTIONS_LONG_ID = "banner-grid-instructions-long";
export const BANNER_INSTRUCTIONS_SHORT_ID = "banner-grid-instructions-short";

type ViewId = "all" | BannerDisplayState;
const VIEW_IDS: readonly ViewId[] = [
  "all",
  "live",
  "scheduled",
  "ended",
  "draft",
];

/** The badge of each display state (canon 1.6: shown = default, off = secondary). */
const STATE_BADGE: Record<
  BannerDisplayState,
  "default" | "outline" | "secondary"
> = {
  live: "default",
  scheduled: "outline",
  ended: "secondary",
  draft: "secondary",
};

/** A minute is plenty: the window lines count days. */
const CLOCK_TICK_MS = 60_000;

/**
 * Narrow a raw `?placement=` value to a real placement. An unknown/absent value
 * is rejected so the render loop falls back to the full grouped view (TASK-264-C
 * deep link from the content map).
 */
function isValidPlacement(
  value: string | null,
): value is BannerEntityPlacement {
  return (
    value !== null &&
    (BANNER_PLACEMENT_ORDER as readonly string[]).includes(value)
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
  const { can } = useAuth();
  const canWrite = can(PERM.bannersWrite);

  // Optional `?placement=` deep link (TASK-264-C): when it names a real
  // placement, only that one section renders. The QUERY is never narrowed.
  const searchParams = useSearchParams();
  const placementParam = searchParams.get("placement");
  const visiblePlacements: readonly BannerEntityPlacement[] = isValidPlacement(
    placementParam,
  )
    ? [placementParam]
    : BANNER_PLACEMENT_ORDER;

  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const searchActive = needle.length > 0;
  const [view, setView] = useState<ViewId>("all");
  const viewActive = view !== "all";

  const { data, isLoading, isFetching, isError, refetch, dataUpdatedAt } =
    useAdminBannerControllerFindAll();
  const publish = useAdminBannerControllerPublish();
  const unpublish = useAdminBannerControllerUnpublish();
  const remove = useAdminBannerControllerDelete();
  const create = useAdminBannerControllerCreate();
  const update = useAdminBannerControllerUpdate();
  const { confirm, confirmDialog } = useConfirmDialog();

  // The fetch instant until the clock ticks — a pure render (see `useNow`).
  const tick = useNow(CLOCK_TICK_MS);
  const now = Math.max(dataUpdatedAt, tick ?? 0);

  const banners = useMemo(() => data?.data ?? [], [data]);

  const stateById = useMemo(
    () =>
      new Map(
        banners.map((banner) => [banner.id, bannerDisplayState(banner, now)]),
      ),
    [banners, now],
  );

  const viewCounts = useMemo(() => {
    const counts: Record<ViewId, number> = {
      all: banners.length,
      live: 0,
      scheduled: 0,
      ended: 0,
      draft: 0,
    };
    for (const state of stateById.values()) counts[state] += 1;
    return counts;
  }, [banners.length, stateById]);

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminBannerControllerFindAllQueryKey(),
    });

  const handleToggle = (banner: BannerEntity) => {
    const isPublished = banner.status === "PUBLISHED";
    const mutation = isPublished ? unpublish : publish;
    mutation.mutate(
      { id: banner.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(isPublished ? d.toastUnpublished : d.toastPublished);
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );
  };

  const handleDuplicate = (banner: BannerEntity) => {
    create.mutate(
      { data: duplicateBannerPayload(banner) },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(d.toastDuplicated);
        },
        onError: () => toast.error(d.toastDuplicateFailed),
      },
    );
  };

  // TASK-580: a placement change is appended to the END of the target bucket by
  // the API (`updateWithPlacementMove`). Only the placement travels — a partial
  // PUT without `status` leaves the publication window alone.
  const handleMove = (banner: BannerEntity, target: BannerEntityPlacement) => {
    update.mutate(
      { id: banner.id, data: { placement: target } },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(d.toastMoved(d.placements[target]));
        },
        onError: () => toast.error(d.toastMoveFailed),
      },
    );
  };

  const handleDelete = async (banner: BannerEntity) => {
    const confirmed = await confirm({
      title: d.deleteTitle(banner.title),
      description: d.deleteDescription,
      confirmLabel: d.deleteConfirmLabel,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: banner.id },
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
    create.isPending ||
    update.isPending;

  const rowActions = (banner: BannerEntity): RowActionItem[] => {
    const isPublished = banner.status === "PUBLISHED";
    const targets = BANNER_PLACEMENT_ORDER.filter(
      (placement) => placement !== banner.placement,
    );
    return [
      { label: dict.common.edit, href: `/banners/${banner.id}/edit` },
      {
        label: isPublished ? d.unpublish : d.publish,
        onSelect: () => handleToggle(banner),
        disabled: isMutating,
      },
      {
        label: d.duplicate,
        onSelect: () => handleDuplicate(banner),
        disabled: isMutating,
      },
      ...targets.map((target, index) => ({
        label: d.moveTo(d.placements[target]),
        onSelect: () => handleMove(banner, target),
        disabled: isMutating,
        separatorBefore: index === 0,
        groupLabel: index === 0 ? d.moveGroup : undefined,
      })),
      {
        label: d.deleteAction,
        onSelect: () => void handleDelete(banner),
        destructive: true,
        separatorBefore: true,
        disabled: isMutating,
      },
    ];
  };

  const matches = (banner: BannerEntity) => {
    if (viewActive && stateById.get(banner.id) !== view) return false;
    if (!searchActive) return true;
    return [banner.title, banner.subtitle, banner.ctaLabel].some((text) =>
      text?.toLowerCase().includes(needle),
    );
  };

  const anyMatch = banners.some(matches);
  const locked = searchActive || viewActive;

  const quickViews = VIEW_IDS.map((id) => ({
    id,
    label: id === "all" ? d.quickViews.all : d.quickViews[id],
    count: viewCounts[id],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {d.heading}
        </h2>
        {canWrite && (
          <Button asChild>
            <Link href="/banners/new">{d.add}</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <QuickViews
          items={quickViews}
          activeId={view}
          onChange={(id) => setView(id as ViewId)}
        />

        <TableToolbar
          className="mb-0"
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
          search={
            // `mode="local"` (TASK-423): the needle hides ROWS and is not a server
            // narrowing, so it must not pretend to be one by living in the URL. See
            // the header — this view is unpaginated on purpose and its search LOCKS
            // reordering rather than PATCHing a partial ordering.
            <TableSearch
              mode="local"
              value={search}
              onChange={(next) => setSearch(next ?? "")}
              placeholder={d.searchPlaceholder}
              label={dict.reorderList.searchLabel}
            />
          }
        />

        {!canWrite && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LockIcon aria-hidden="true" className="size-3.5" />
            {dict.common.viewOnly}
          </p>
        )}

        {canWrite && searchActive && (
          <p className="text-sm text-muted-foreground">
            {dict.reorderList.searchLockedHint}
          </p>
        )}
        {canWrite && !searchActive && viewActive && (
          <p className="text-sm text-muted-foreground">{d.viewLockedHint}</p>
        )}
      </div>

      <div id={BANNER_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={BANNER_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <AdminBannerTableSkeleton withHeading={false} />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      ) : banners.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {d.empty}
        </div>
      ) : (searchActive || viewActive) && !anyMatch ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchActive
            ? dict.reorderList.emptyMatch(search.trim())
            : dict.common.table.emptyFiltered}
        </div>
      ) : (
        visiblePlacements.map((placement) => (
          <BannerPlacementSection
            key={placement}
            placement={placement}
            banners={banners}
            locked={locked}
            filtered={locked}
            matches={matches}
            stateById={stateById}
            now={now}
            canWrite={canWrite}
            rowActions={rowActions}
          />
        ))
      )}

      {confirmDialog}
    </div>
  );
}

interface BannerPlacementSectionProps {
  placement: BannerEntityPlacement;
  /** The UNFILTERED admin banner list (all placements). */
  banners: BannerEntity[];
  /** A search or a view is hiding rows — reordering is off. */
  locked: boolean;
  /** Rows are being filtered — an empty section hides instead of inviting. */
  filtered: boolean;
  matches: (banner: BannerEntity) => boolean;
  stateById: ReadonlyMap<string, BannerDisplayState>;
  now: number;
  canWrite: boolean;
  rowActions: (banner: BannerEntity) => RowActionItem[];
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
  filtered,
  matches,
  stateById,
  now,
  canWrite,
  rowActions,
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
    // Without the write key nothing can be reordered — the grid stays a list.
    locked: locked || !canWrite,
    visibleIds,
  });

  const isEmpty = items.length === 0 || grid.rows.length === 0;
  // A filtered-out section disappears; an EMPTY placement stays, because that is
  // exactly where «Додати сюди» is wanted.
  if (isEmpty && (filtered || !canWrite)) return null;

  const placementName = d.placements[placement];
  const headingId = `banner-section-${placement}`;

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const banner = byId.get(props.item.id);
    if (!row || !banner) return null;
    return (
      <BannerRow
        key={banner.id}
        banner={banner}
        state={stateById.get(banner.id) ?? "draft"}
        now={now}
        row={row}
        locked={locked}
        canWrite={canWrite}
        actions={canWrite ? rowActions(banner) : []}
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
          <div className="flex shrink-0 items-center gap-1">
            <ReorderUndoButton
              canUndo={reorder.canUndo}
              onUndo={reorder.undo}
              label={dict.reorderList.undo}
              iconOnly
            />
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary max-md:size-11 max-md:p-0"
            >
              <Link
                href={`/banners/new?placement=${placement}`}
                aria-label={d.addHereAria(placementName)}
              >
                <PlusIcon aria-hidden="true" />
                <span className="max-md:sr-only">{d.addHere}</span>
              </Link>
            </Button>
          </div>
        )}
      </div>

      {isEmpty ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          {d.sectionEmpty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <Table
            role="grid"
            aria-label={d.gridLabel(placementName)}
            aria-describedby={BANNER_INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending}
            className="max-md:block"
          >
            {/* The columns are named for assistive tech only: the artboard row
                reads without a header strip, and the header row stays row 1 of
                the grid (the data rows start at aria-rowindex 2). */}
            <TableHeader className="sr-only">
              <TableRow aria-rowindex={1}>
                <TableHead>{d.colTitle}</TableHead>
                <TableHead>{d.colWindow}</TableHead>
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
      )}
    </section>
  );
}

interface BannerRowProps {
  banner: BannerEntity;
  state: BannerDisplayState;
  now: number;
  row: SortableListRow;
  locked: boolean;
  canWrite: boolean;
  actions: RowActionItem[];
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function BannerRow({
  banner,
  state,
  now,
  row,
  locked,
  canWrite,
  actions,
  registerRef,
  style,
  handleProps,
}: BannerRowProps) {
  const tabIndex = row.controlTabIndex;
  const windowLines = bannerWindowLines(banner, now);
  const badge = (
    <Badge variant={STATE_BADGE[state]}>{d.displayStates[state]}</Badge>
  );

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={BANNER_INSTRUCTIONS_SHORT_ID}
      style={style}
      className={cn(
        // Below md the row is a card: grip · thumbnail · text · «⋯» in one line,
        // the status and window folded under the title (БН2).
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
        // `max-w-0` + `w-full`: the cell takes the spare width and lets the
        // title truncate instead of pushing the window column off-screen.
        className="min-w-0 py-2.5 whitespace-normal max-md:flex-1 max-md:p-0 md:w-full md:max-w-0"
      >
        <div className="flex min-w-0 items-start gap-3 md:items-center">
          {canWrite ? (
            <button
              type="button"
              {...handleProps}
              tabIndex={tabIndex}
              aria-label={dict.reorderList.handleLabel(banner.title)}
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
          <BannerThumb imageUrl={banner.imageUrl} />
          <div className="flex min-w-0 flex-col gap-0.5">
            {canWrite ? (
              <Link
                href={`/banners/${banner.id}/edit`}
                tabIndex={tabIndex}
                className="font-medium text-foreground hover:underline md:truncate"
              >
                {banner.title}
              </Link>
            ) : (
              <span className="font-medium text-foreground md:truncate">
                {banner.title}
              </span>
            )}
            <CtaLine label={banner.ctaLabel} href={banner.ctaHref} />
            <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden">
              {badge}
              {windowLines.primary && (
                <span className="text-xs text-muted-foreground">
                  {windowLines.primary}
                </span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell
        role="gridcell"
        className="py-2.5 whitespace-nowrap max-md:hidden"
      >
        {windowLines.primary ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">
              {windowLines.primary}
            </span>
            {windowLines.secondary && (
              <span className="text-xs text-muted-foreground">
                {windowLines.secondary}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell role="gridcell" className="py-2.5 max-md:hidden">
        {badge}
      </TableCell>
      <TableCell
        role="gridcell"
        className="w-12 py-2.5 text-right max-md:w-auto max-md:p-0"
      >
        <RowActionsMenu
          label={dict.common.registry.rowActionsAria(banner.title)}
          items={actions}
          className="max-md:size-11"
        />
      </TableCell>
    </TableRow>
  );
}

/** 104×48 on desktop, 72×40 on a phone; a hatched «без фото» when there is none. */
function BannerThumb({ imageUrl }: { imageUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  const frame =
    "flex h-10 w-18 shrink-0 items-center justify-center overflow-hidden rounded-md md:h-12 md:w-26";
  if (!imageUrl || failed) {
    return (
      <span
        className={cn(
          frame,
          "border border-dashed border-border bg-muted/50 font-mono text-2xs text-muted-foreground",
        )}
      >
        {d.thumbEmpty}
      </span>
    );
  }
  return (
    <span className={cn(frame, "bg-muted")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of an operator-supplied URL; next/image would need every host allow-listed */}
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        className="size-full object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/** «Кнопка «Обрати» → /categories/headphones» — or just the link, or nothing. */
function CtaLine({
  label,
  href,
}: {
  label?: string | null;
  href?: string | null;
}) {
  const text = label?.trim();
  const target = href?.trim();
  if (!text && !target) return null;
  return (
    <span className="text-xs text-muted-foreground md:truncate">
      {text ? d.ctaLine(text) : d.linkLine}{" "}
      {target ? (
        <span className="font-mono text-primary break-all">{target}</span>
      ) : null}
    </span>
  );
}
