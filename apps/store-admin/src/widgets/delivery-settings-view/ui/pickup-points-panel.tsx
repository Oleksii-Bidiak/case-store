"use client";

/**
 * The pickup points inside the «Самовивіз з магазину» card (TASK-645, mockup
 * Д-н2 SettingsDelivery ДН-1.1–1.3, 1.6): a sortable grid of points, «Додати
 * точку», and per point a «⋯» menu — edit, deactivate / activate, the orders
 * that went to it, delete.
 *
 * ── Order ───────────────────────────────────────────────────────────────────
 * The row order IS the checkout's order. Drag the grip, or Space ↑/↓ Space on
 * a focused row; both go through the same flat-list reorder lifecycle the FAQ
 * uses (`features/list-reorder`), «Скасувати» toast included. The list is
 * never filtered or paged, so a reorder always names every point.
 *
 * ── Deactivate before delete ────────────────────────────────────────────────
 * A point that stopped working is deactivated — it leaves the checkout, and
 * the orders that went to it keep the link. Delete stays available (orders
 * keep a snapshot of the name and address) but sits last in the menu, behind
 * a confirmation that offers deactivating instead.
 *
 * ── Phone ───────────────────────────────────────────────────────────────────
 * Below `md` each row is a card whose cells carry an uppercase caption (ДН-1.2).
 * Done here with `max-md:` classes rather than `Table layout="card"`: that
 * layout turns a row into `role="group"` on a phone, which a `role="grid"`
 * cannot contain — the banner grid does the same.
 *
 * `LiveAnnouncer` wraps the grid: the reorder lifecycle and the grid's
 * keyboard model both announce through it.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  LockIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getListAdminPickupPointsQueryKey,
  useDeletePickupPoint,
  useListAdminPickupPoints,
  useUpdatePickupPoint,
  type AdminPickupPointDto,
} from "@/entities/delivery";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { PickupPointFormDialog } from "@/features/pickup-point-form";
import {
  pickupPointsToItems,
  usePickupPointReorder,
} from "@/features/list-reorder";
import {
  useRowFocus,
  useSortableListGrid,
  type SortableListRow,
} from "@/shared/lib/list-reorder";
import {
  Badge,
  Button,
  ErrorState,
  LiveAnnouncer,
  ReorderUndoButton,
  RowActionsMenu,
  Skeleton,
  SortableTree,
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type RowActionItem,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { PickupPointDeleteDialog } from "./pickup-point-delete-dialog";

const t = dict.pickupPoints;

export const PICKUP_INSTRUCTIONS_LONG_ID = "pickup-points-instructions-long";
export const PICKUP_INSTRUCTIONS_SHORT_ID = "pickup-points-instructions-short";
export const PICKUP_ROW_PREFIX = "pickup-point-row-";

/** The order screen filtered to one point (the filter itself is TASK-648). */
export function pickupPointOrdersHref(id: string): string {
  return `/orders?pickupPointId=${encodeURIComponent(id)}`;
}

export function PickupPointsPanel() {
  return (
    <LiveAnnouncer>
      <PickupPointsGrid />
    </LiveAnnouncer>
  );
}

function PickupPointsGrid() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  // The page is gated on the same key; kept so the grid never offers a move
  // the API would refuse.
  const canWrite = can(PERM.settingsDelivery);

  // No arguments: the COMPLETE list. The reorder adapter writes the server's
  // refreshed list into this exact key; the settings form's warning and
  // preview count read it too.
  const { data, isLoading, isError, isFetching, refetch } =
    useListAdminPickupPoints();
  const update = useUpdatePickupPoint();
  const remove = useDeletePickupPoint();

  const points = useMemo(() => data?.data ?? [], [data]);
  const byId = useMemo(
    () => new Map(points.map((point) => [point.id, point])),
    [points],
  );
  const treeItems = useMemo(() => pickupPointsToItems(points), [points]);

  const focus = useRowFocus();
  const reorder = usePickupPointReorder({
    items: treeItems,
    onFocusRow: focus.focusRow,
  });
  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: PICKUP_ROW_PREFIX,
    locked: !canWrite,
  });

  /* ── the point dialog ─────────────────────────────────────────────────── */

  const [dialogOpen, setDialogOpen] = useState(false);
  // Kept after closing so the title does not flip during the close animation.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (byId.get(editingId) ?? null) : null;
  // A point deleted elsewhere while its dialog is open: close rather than
  // turn the editor into an «add» form.
  const dialogShown = dialogOpen && (editingId === null || editing !== null);

  const openCreate = () => {
    setEditingId(null);
    setDialogOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  };

  /* ── row actions ──────────────────────────────────────────────────────── */

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListAdminPickupPointsQueryKey(),
    });

  const setActive = (point: AdminPickupPointDto, isActive: boolean) => {
    update.mutate(
      { id: point.id, data: { isActive } },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(isActive ? t.toastActivated : t.toastDeactivated);
        },
        onError: () => toast.error(t.toastStatusFailed),
      },
    );
  };

  const [deleteTarget, setDeleteTarget] = useState<AdminPickupPointDto | null>(
    null,
  );

  const handleDelete = (point: AdminPickupPointDto) => {
    setDeleteTarget(null);
    remove.mutate(
      { id: point.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(t.toastDeleted);
        },
        onError: () => toast.error(t.toastDeleteFailed),
      },
    );
  };

  const handleDeactivateInstead = (point: AdminPickupPointDto) => {
    setDeleteTarget(null);
    setActive(point, false);
  };

  const rowActions = (point: AdminPickupPointDto): RowActionItem[] => [
    { label: t.edit, icon: Pencil, onSelect: () => openEdit(point.id) },
    point.isActive
      ? {
          label: t.deactivate,
          icon: EyeOff,
          onSelect: () => setActive(point, false),
          disabled: update.isPending,
        }
      : {
          label: t.activate,
          icon: Eye,
          onSelect: () => setActive(point, true),
          disabled: update.isPending,
        },
    {
      label: t.ordersLink(point.ordersCount),
      icon: ExternalLink,
      href: pickupPointOrdersHref(point.id),
    },
    {
      label: t.deleteItem,
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      onSelect: () => setDeleteTarget(point),
      disabled: remove.isPending,
    },
  ];

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const point = byId.get(props.item.id);
    if (!row || !point) return null;
    return (
      <PickupPointRow
        key={point.id}
        point={point}
        row={row}
        canWrite={canWrite}
        actions={canWrite ? rowActions(point) : []}
        registerRef={(node) => {
          focus.registerRow(point.id)(node);
          props.setNodeRef(node);
        }}
        style={props.style}
        handleProps={props.handleProps}
      />
    );
  };

  let body: ReactNode = null;
  if (isLoading) {
    body = (
      <div
        className="flex flex-col gap-2"
        data-testid="pickup-points-skeleton"
        aria-hidden="true"
      >
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else if (isError) {
    body = (
      <ErrorState
        message={t.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  } else if (points.length > 0) {
    body = (
      <div className="md:overflow-hidden md:rounded-lg md:border">
        <Table
          role="grid"
          aria-label={t.gridLabel}
          aria-describedby={PICKUP_INSTRUCTIONS_LONG_ID}
          aria-busy={reorder.isPending}
          className="max-md:block md:table-fixed"
        >
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-52" />
            <col className="w-24" />
            <col className="w-32" />
            <col className="w-12" />
          </colgroup>
          <TableHeader className="max-md:hidden">
            <TableRow aria-rowindex={1}>
              <TableHead className="px-2">
                <span className="sr-only">{t.colOrder}</span>
              </TableHead>
              <TableHead className="px-2">{t.colPoint}</TableHead>
              <TableHead className="px-2">{t.colHours}</TableHead>
              <TableHead className="px-2 text-right">{t.colOrders}</TableHead>
              <TableHead className="px-2">{t.colCheckout}</TableHead>
              <TableHead className="px-2">
                <span className="sr-only">{t.colActions}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          {/* A plain <tbody>: TableBody strips the last row's border, which on a
              phone is the last card's frame. */}
          <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
            <SortableTree
              items={grid.sortableItems}
              maxDepth={1}
              disabled={grid.dragDisabled}
              renderRow={renderRow}
              onMove={grid.onPointerMove}
              announcements={grid.pointerAnnouncements}
            />
          </tbody>
        </Table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div id={PICKUP_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={PICKUP_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {body}

      {canWrite ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openCreate}
              className="self-start max-md:min-h-11"
            >
              <Plus aria-hidden="true" />
              {t.add}
            </Button>
            {/* The persistent way back for the keyboard; the toast after a
                move is the visible one. */}
            {points.length > 1 ? (
              <ReorderUndoButton
                iconOnly
                canUndo={reorder.canUndo}
                onUndo={reorder.undo}
                label={dict.reorderList.undo}
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t.hint}</p>
        </div>
      ) : null}

      <PickupPointFormDialog
        open={dialogShown}
        onOpenChange={setDialogOpen}
        point={editing}
      />
      <PickupPointDeleteDialog
        point={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onDelete={handleDelete}
        onDeactivate={handleDeactivateInstead}
      />
    </div>
  );
}

/* ── one row ──────────────────────────────────────────────────────────────── */

/** The caption a cell carries on a phone card (ДН-1.2); gone from `md`. */
function CellCaption({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 pt-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase md:hidden">
      {children}
    </span>
  );
}

/** A cell that is a captioned line of the phone card and a plain cell from `md`. */
const CELL =
  "px-2 py-3 align-middle max-md:flex max-md:items-start max-md:justify-between max-md:gap-3 max-md:border-b max-md:border-border/60 max-md:px-0 max-md:py-2.5 max-md:last:border-b-0";

interface PickupPointRowProps {
  point: AdminPickupPointDto;
  row: SortableListRow;
  canWrite: boolean;
  actions: RowActionItem[];
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function PickupPointRow({
  point,
  row,
  canWrite,
  actions,
  registerRef,
  style,
  handleProps,
}: PickupPointRowProps) {
  const tabIndex = row.controlTabIndex;
  const inactive = !point.isActive;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={PICKUP_INSTRUCTIONS_SHORT_ID}
      data-active={point.isActive}
      style={style}
      className={cn(
        "max-md:flex max-md:flex-col max-md:rounded-lg max-md:border max-md:bg-card max-md:px-4 max-md:py-1 max-md:shadow-card md:last:border-b-0",
        row.grabbed
          ? "outline outline-2 outline-ring"
          : row.conflict
            ? "bg-accent"
            : undefined,
      )}
    >
      <TableCell role="gridcell" className={cn(CELL, "max-md:items-center")}>
        <CellCaption>{t.colOrder}</CellCaption>
        {canWrite ? (
          <button
            type="button"
            {...handleProps}
            tabIndex={tabIndex}
            aria-label={dict.reorderList.handleLabel(point.name)}
            className="inline-flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:-mr-3 md:size-8"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <span className="inline-flex size-11 shrink-0 items-center justify-center text-muted-foreground md:size-8">
            <LockIcon aria-hidden="true" className="size-4" />
          </span>
        )}
      </TableCell>

      <TableCell role="gridcell" className={cn(CELL, "whitespace-normal")}>
        <CellCaption>{t.colPoint}</CellCaption>
        <div className="flex min-w-0 flex-col gap-0.5 max-md:items-end max-md:text-right">
          <span
            className={cn(
              "font-medium break-words",
              inactive ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {point.name}
          </span>
          <span className="text-xs break-words text-muted-foreground">
            {t.location(point.city, point.address)}
          </span>
        </div>
      </TableCell>

      <TableCell role="gridcell" className={cn(CELL, "whitespace-normal")}>
        <CellCaption>{t.colHours}</CellCaption>
        <div className="flex min-w-0 flex-col gap-0.5 max-md:items-end max-md:text-right">
          <span
            className={cn(
              "break-words",
              inactive ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {point.workingHours ?? t.noHours}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {point.phone ?? t.noPhone}
          </span>
        </div>
      </TableCell>

      <TableCell role="gridcell" className={cn(CELL, "md:text-right")}>
        <CellCaption>{t.colOrders}</CellCaption>
        <span
          className={cn(
            "tabular-nums",
            inactive ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {point.ordersCount.toLocaleString("uk-UA")}
        </span>
      </TableCell>

      <TableCell role="gridcell" className={CELL}>
        <CellCaption>{t.colCheckout}</CellCaption>
        <Badge variant={point.isActive ? "default" : "secondary"}>
          {point.isActive ? t.statusActive : t.statusInactive}
        </Badge>
      </TableCell>

      <TableCell
        role="gridcell"
        className={cn(CELL, "max-md:items-center md:pr-2 md:text-right")}
      >
        <CellCaption>{t.colActions}</CellCaption>
        <RowActionsMenu
          label={t.rowActionsAria(point.name)}
          items={actions}
          tabIndex={tabIndex}
          className="max-md:-mr-1.5 max-md:size-11"
        />
      </TableCell>
    </TableRow>
  );
}
