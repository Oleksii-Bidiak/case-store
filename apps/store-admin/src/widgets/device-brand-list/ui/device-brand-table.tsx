"use client";

/**
 * Admin device-brand grid (TASK-190; drag/keyboard reordering since TASK-295;
 * wave 198 — DevicesProposal ПР5/ПР6, TASK-1082).
 *
 * The sortable grid REPLACED the flat table and its hand-typed `sortOrder` number:
 * the row order IS the order. The reorder payload must name EVERY brand (or the
 * server 409s a lost update), so the grid reads the UNFILTERED list and the
 * search — which hides rows — LOCKS reordering rather than sending a partial
 * ordering.
 *
 * THE LIST IS DELIBERATELY NOT PAGINATED, and TASK-357 did not change that even
 * though the endpoint now accepts `page`/`limit`. Same reason as the search
 * lock: a page is a partial view, and a reorder computed on a partial view is a
 * partial ordering. The refresh control and the toolbar are what TASK-357 adds
 * here; paging this grid would trade a missing button for a corrupt PATCH.
 *
 * Wave 198: the hint says what the order MEANS on the site; a move posts the
 * «Скасувати» toast (the adapter, `features/list-reorder`) and the persistent
 * undo stays as an icon for the keyboard; the slug sits under the name;
 * «Моделей» links into the models tab filtered by the brand; «Редагувати» and
 * «Приховати / Показати на сайті» moved into «⋯»; the brand form is a dialog
 * over the grid, and the old `/devices/brands/new` and `…/:id/edit` routes open
 * it. Below md the same rows paint as cards (one DOM — the keyboard model and
 * dnd-kit keep working on a phone).
 *
 * Every admin device route needs `devices:write` — there is no read key — so
 * the view-only state is what a future `devices:read` gets.
 *
 * `LiveAnnouncer` MUST wrap the grid, not sit inside it: the reorder lifecycle and
 * the grid both call `useAnnouncer()`, and a hook called in the same component
 * that renders the provider would read the default no-op context.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, LockIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getAdminDeviceControllerFindBrandsQueryKey,
  useAdminDeviceControllerFindBrands,
  useAdminDeviceControllerActivateBrand,
  useAdminDeviceControllerDeactivateBrand,
  type DeviceBrandEntity,
} from "@/entities/device";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { DeviceBrandFormDialog } from "@/features/device-brand-form";
import {
  deviceBrandsToItems,
  useDeviceBrandReorder,
} from "@/features/list-reorder";
import {
  useRowFocus,
  useSortableListGrid,
  type SortableListRow,
} from "@/shared/lib/list-reorder";
import {
  Badge,
  Callout,
  ErrorState,
  LiveAnnouncer,
  RegistryToolbar,
  ReorderUndoButton,
  RowActionsMenu,
  SortableTree,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type RowActionItem,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { DeviceBrandTableSkeleton } from "./device-brand-table-skeleton";

const d = dict.devices;

export const DEVICE_BRAND_INSTRUCTIONS_LONG_ID =
  "device-brand-grid-instructions-long";
export const DEVICE_BRAND_INSTRUCTIONS_SHORT_ID =
  "device-brand-grid-instructions-short";

/** A deep link asks for the form dialog: `/devices/brands/new` or `…/:id/edit`. */
export type DeviceBrandDialogRequest =
  { mode: "create" } | { mode: "edit"; id: string };

type DialogState = DeviceBrandDialogRequest & { readOnly?: boolean };

interface DeviceBrandTableProps {
  /** Deep link: open the form dialog on mount; closing returns to the list. */
  dialog?: DeviceBrandDialogRequest;
}

/* ── card layout below md (one DOM — see the header) ─────────────────────── */

const CARD_ROW =
  "max-md:relative max-md:mb-3 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-2 max-md:gap-y-1.5 max-md:rounded-lg max-md:border max-md:bg-card max-md:py-3 max-md:pr-12 max-md:shadow-card max-md:last:mb-0";

export function DeviceBrandTable({ dialog }: DeviceBrandTableProps = {}) {
  return (
    <LiveAnnouncer>
      <DeviceBrandGrid dialog={dialog} />
    </LiveAnnouncer>
  );
}

function DeviceBrandGrid({ dialog }: DeviceBrandTableProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { can } = useAuth();
  const canWrite = can(PERM.devicesWrite);

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminDeviceControllerFindBrands();
  const activate = useAdminDeviceControllerActivateBrand();
  const deactivate = useAdminDeviceControllerDeactivateBrand();

  const brands = useMemo(() => data?.data ?? [], [data]);
  const items = useMemo(() => deviceBrandsToItems(brands), [brands]);
  const byId = useMemo(
    () => new Map(brands.map((brand) => [brand.id, brand])),
    [brands],
  );

  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const searchActive = needle.length > 0;

  const visibleIds = useMemo(() => {
    if (!searchActive) return undefined;
    return new Set(
      items
        .filter((item) => item.label.toLowerCase().includes(needle))
        .map((item) => item.id),
    );
  }, [items, needle, searchActive]);

  const focus = useRowFocus();
  const reorder = useDeviceBrandReorder({ items, onFocusRow: focus.focusRow });
  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: "device-brand-row-",
    locked: searchActive || !canWrite,
    visibleIds,
  });

  /* ── the form dialog ─────────────────────────────────────────────────── */

  // Seeded once from the ROUTE (a static prop, not async data).
  const [dialogState, setDialogState] = useState<DialogState | null>(
    dialog ? { ...dialog, readOnly: !canWrite } : null,
  );
  const closeDialog = () => {
    setDialogState(null);
    // Opened by a deep link: put the address back to the list.
    if (dialog) router.replace("/devices/brands");
  };
  const editBrand =
    dialogState?.mode === "edit" ? byId.get(dialogState.id) : undefined;
  const editMissing =
    dialogState?.mode === "edit" && !isLoading && !isError && !editBrand;
  // Render-time guard (forms.md rule 1a): an id the loaded list does not have
  // closes the request; the effect below only says so.
  const [missingNotice, setMissingNotice] = useState(0);
  if (editMissing) {
    setDialogState(null);
    setMissingNotice((n) => n + 1);
  }
  useEffect(() => {
    if (missingNotice === 0) return;
    toast.error(d.notFound);
    if (dialog) router.replace("/devices/brands");
  }, [dialog, missingNotice, router]);

  /* ── row actions ─────────────────────────────────────────────────────── */

  const statusPending = activate.isPending || deactivate.isPending;

  const toggle = (brand: DeviceBrandEntity) => {
    const mutation = brand.isActive ? deactivate : activate;
    mutation.mutate(
      { id: brand.id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindBrandsQueryKey(),
          });
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );
  };

  const rowActions = (brand: DeviceBrandEntity): RowActionItem[] => {
    if (!canWrite) {
      return [
        {
          label: dict.common.view,
          onSelect: () =>
            setDialogState({ mode: "edit", id: brand.id, readOnly: true }),
        },
      ];
    }
    return [
      {
        label: dict.common.edit,
        onSelect: () => setDialogState({ mode: "edit", id: brand.id }),
      },
      {
        label: brand.isActive ? d.deactivate : d.activate,
        onSelect: () => toggle(brand),
        disabled: statusPending,
        separatorBefore: true,
      },
    ];
  };

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const brand = byId.get(props.item.id);
    if (!row || !brand) return null;
    return (
      <DeviceBrandRow
        key={brand.id}
        brand={brand}
        row={row}
        canWrite={canWrite}
        locked={searchActive}
        actions={rowActions(brand)}
        registerRef={(node) => {
          focus.registerRow(brand.id)(node);
          props.setNodeRef(node);
        }}
        style={props.style}
        handleProps={props.handleProps}
      />
    );
  };

  const hint = !canWrite
    ? null
    : searchActive
      ? dict.reorderList.searchLockedHint
      : d.reorderHint;
  const HintIcon = searchActive ? LockIcon : GripVertical;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <RegistryToolbar
          search={{
            value: search,
            placeholder: dict.reorderList.searchPlaceholder,
            label: dict.reorderList.searchLabel,
            // LOCAL: the needle hides rows and locks the drag — see the header.
            onChange: (next) => setSearch(next ?? ""),
          }}
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
        />
        {canWrite ? null : (
          <Callout variant="strip">{d.viewOnlyNotice}</Callout>
        )}
        {hint ? (
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <HintIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>{hint}</span>
            </p>
            {/* The persistent way back for the keyboard; the toast after a
                move (`features/list-reorder`) is the visible one. */}
            <ReorderUndoButton
              iconOnly
              canUndo={reorder.canUndo}
              onUndo={reorder.undo}
              label={dict.reorderList.undo}
            />
          </div>
        ) : null}
      </div>

      <div id={DEVICE_BRAND_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={DEVICE_BRAND_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <DeviceBrandTableSkeleton />
      ) : isError ? (
        <ErrorState
          variant="card"
          message={d.brandsLoadError}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : brands.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {d.brandsEmpty}
        </div>
      ) : grid.rows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {dict.reorderList.emptyMatch(search.trim())}
        </div>
      ) : (
        <div className="rounded-lg border shadow-card max-md:rounded-none max-md:border-0 max-md:shadow-none md:overflow-hidden">
          <Table
            role="grid"
            aria-label={d.brandsGridLabel}
            aria-describedby={DEVICE_BRAND_INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending}
            className="table-fixed max-md:block"
          >
            <colgroup className="max-md:hidden">
              <col />
              <col className="w-32" />
              <col className="w-44" />
              <col className="w-11" />
            </colgroup>
            <TableHeader className="max-md:hidden">
              <TableRow aria-rowindex={1} className="hover:bg-transparent">
                <TableHead className={cn("px-3", canWrite && "pl-12")}>
                  {d.colBrand}
                </TableHead>
                <TableHead className="px-3 text-right">{d.colModels}</TableHead>
                <TableHead className="px-3">{d.colStatus}</TableHead>
                <TableHead className="w-11 px-0">
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
      )}

      {dialogState && (dialogState.mode === "create" || editBrand) ? (
        <DeviceBrandFormDialog
          open
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
          brand={editBrand ?? null}
          readOnly={dialogState.readOnly || !canWrite}
        />
      ) : null}
    </div>
  );
}

interface DeviceBrandRowProps {
  brand: DeviceBrandEntity;
  row: SortableListRow;
  canWrite: boolean;
  /** A search hides rows — the grip stays but says it is unavailable. */
  locked: boolean;
  actions: RowActionItem[];
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function DeviceBrandRow({
  brand,
  row,
  canWrite,
  locked,
  actions,
  registerRef,
  style,
  handleProps,
}: DeviceBrandRowProps) {
  const tabIndex = row.controlTabIndex;
  const models = brand.modelCount ?? 0;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={DEVICE_BRAND_INSTRUCTIONS_SHORT_ID}
      style={style}
      className={cn(
        CARD_ROW,
        canWrite ? "max-md:pl-13" : "max-md:pl-4",
        row.grabbed
          ? "outline outline-2 outline-ring"
          : row.conflict
            ? "bg-accent"
            : undefined,
      )}
    >
      <TableCell role="gridcell" className="px-3 max-md:basis-full max-md:p-0">
        <div className="flex items-center gap-1">
          {canWrite ? (
            <button
              type="button"
              {...handleProps}
              tabIndex={tabIndex}
              aria-label={dict.reorderList.handleLabel(brand.name)}
              aria-disabled={locked || undefined}
              className="inline-flex size-6 min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:absolute max-md:top-1/2 max-md:left-1 max-md:-translate-y-1/2 md:-ml-2 md:size-8 md:min-h-0 md:min-w-0"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">
              {brand.name}
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {brand.slug}
            </span>
          </span>
        </div>
      </TableCell>
      <TableCell
        role="gridcell"
        className="px-3 text-right tabular-nums max-md:p-0 max-md:text-left"
      >
        <Link
          href={`/devices/models?deviceBrandId=${encodeURIComponent(brand.id)}`}
          tabIndex={tabIndex}
          aria-label={d.modelsLinkAria(models, brand.name)}
          className={cn(
            "rounded-xs outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
            models > 0 ? "font-medium text-primary" : "text-muted-foreground",
          )}
        >
          {models}
        </Link>
      </TableCell>
      <TableCell role="gridcell" className="px-3 max-md:p-0">
        <Badge variant={brand.isActive ? "default" : "secondary"}>
          {brand.isActive ? d.statusActive : d.statusInactive}
        </Badge>
      </TableCell>
      <TableCell
        role="gridcell"
        className="w-11 px-0 pr-1.5 text-right max-md:absolute max-md:top-2 max-md:right-1 max-md:w-auto max-md:p-0"
      >
        <RowActionsMenu
          label={d.brandRowActionsAria(brand.name)}
          items={actions}
          tabIndex={tabIndex}
        />
      </TableCell>
    </TableRow>
  );
}
