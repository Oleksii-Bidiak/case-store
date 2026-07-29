"use client";

/**
 * Admin device-brand grid (TASK-190; drag/keyboard reordering added in TASK-295).
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
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  getAdminDeviceControllerFindBrandsQueryKey,
  useAdminDeviceControllerFindBrands,
  useAdminDeviceControllerActivateBrand,
  useAdminDeviceControllerDeactivateBrand,
  type DeviceBrandEntity,
} from "@/entities/device";
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
  TableToolbar,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { DeviceBrandTableSkeleton } from "./device-brand-table-skeleton";

export const DEVICE_BRAND_INSTRUCTIONS_LONG_ID =
  "device-brand-grid-instructions-long";
export const DEVICE_BRAND_INSTRUCTIONS_SHORT_ID =
  "device-brand-grid-instructions-short";

/**
 * `LiveAnnouncer` MUST wrap the grid, not sit inside it: the reorder lifecycle and
 * the grid both call `useAnnouncer()`, and a hook called in the same component
 * that renders the provider would read the default no-op context.
 */
export function DeviceBrandTable() {
  return (
    <LiveAnnouncer>
      <DeviceBrandGrid />
    </LiveAnnouncer>
  );
}

function DeviceBrandGrid() {
  const queryClient = useQueryClient();

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
    locked: searchActive,
    visibleIds,
  });

  const statusPending = activate.isPending || deactivate.isPending;

  const toggle = (id: string, isActive: boolean) => {
    const mutation = isActive ? deactivate : activate;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindBrandsQueryKey(),
          });
        },
        onError: () => toast.error(dict.devices.toastStatusFailed),
      },
    );
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
        locked={searchActive}
        statusPending={statusPending}
        onToggle={toggle}
        registerRef={(node) => {
          focus.registerRow(brand.id)(node);
          props.setNodeRef(node);
        }}
        style={props.style}
        handleProps={props.handleProps}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={dict.reorderList.searchPlaceholder}
            aria-label={dict.reorderList.searchLabel}
            className="max-w-xs"
          />
        }
        actions={
          <ReorderUndoButton
            canUndo={reorder.canUndo}
            onUndo={reorder.undo}
            label={dict.reorderList.undo}
          />
        }
      />

      {searchActive && (
        <p className="text-sm text-muted-foreground">
          {dict.reorderList.searchLockedHint}
        </p>
      )}

      <div id={DEVICE_BRAND_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={DEVICE_BRAND_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <DeviceBrandTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.devices.brandsLoadError}
        </p>
      ) : brands.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.devices.brandsEmpty}
        </div>
      ) : grid.rows.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.reorderList.emptyMatch(search.trim())}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table
            role="grid"
            aria-label={dict.devices.brandsGridLabel}
            aria-describedby={DEVICE_BRAND_INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending}
          >
            <TableHeader>
              <TableRow aria-rowindex={1}>
                <TableHead>{dict.devices.colName}</TableHead>
                <TableHead hideOnMobile>{dict.devices.colSlug}</TableHead>
                <TableHead>{dict.devices.colModels}</TableHead>
                <TableHead>{dict.devices.colStatus}</TableHead>
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
      )}
    </div>
  );
}

interface DeviceBrandRowProps {
  brand: DeviceBrandEntity;
  row: SortableListRow;
  locked: boolean;
  statusPending: boolean;
  onToggle: (id: string, isActive: boolean) => void;
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function DeviceBrandRow({
  brand,
  row,
  locked,
  statusPending,
  onToggle,
  registerRef,
  style,
  handleProps,
}: DeviceBrandRowProps) {
  const tabIndex = row.controlTabIndex;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={DEVICE_BRAND_INSTRUCTIONS_SHORT_ID}
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
            aria-label={dict.reorderList.handleLabel(brand.name)}
            aria-disabled={locked || undefined}
            className="inline-flex size-6 min-h-11 min-w-11 cursor-grab items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <span>{brand.name}</span>
        </div>
      </TableCell>
      <TableCell role="gridcell" hideOnMobile className="text-muted-foreground">
        {brand.slug}
      </TableCell>
      <TableCell role="gridcell">{brand.modelCount ?? 0}</TableCell>
      <TableCell role="gridcell">
        <Badge variant={brand.isActive ? "default" : "secondary"}>
          {brand.isActive
            ? dict.devices.statusActive
            : dict.devices.statusInactive}
        </Badge>
      </TableCell>
      <TableCell role="gridcell" className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            tabIndex={tabIndex}
            disabled={statusPending}
            onClick={() => onToggle(brand.id, brand.isActive)}
          >
            {brand.isActive ? dict.devices.deactivate : dict.devices.activate}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/devices/brands/${brand.id}/edit`} tabIndex={tabIndex}>
              {dict.common.edit}
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
