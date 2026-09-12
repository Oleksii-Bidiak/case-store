"use client";

/**
 * Admin FAQ grid (TASK-242; drag/keyboard reordering added in TASK-428).
 *
 * The sortable grid REPLACED the flat table and its hand-typed «Порядок» column: the row
 * order IS the order. Every FAQ item used to be created with `sortOrder = 0`, so the list
 * had no order at all — whatever the database returned is what the shopper saw on /info.
 *
 * TWO RULES MAKE THAT SAFE, and they are the same two the banner / blog-category /
 * device-brand grids follow:
 *
 * 1. THE LIST IS NOT PAGINATED. TASK-357 gave this table server paging (`?page=`); a page
 *    is a PARTIAL view, and a reorder computed on a partial view is a partial ordering —
 *    the server rejects it as a lost update (409), and if it did not, it would silently
 *    renumber page 2 on top of page 1. The endpoint still accepts `page`/`limit` (the
 *    content map uses them); this view simply asks for the complete list.
 * 2. THE SEARCH IS LOCAL AND LOCKS REORDERING. A needle hides ROWS, so the visible order
 *    is not the real one — dragging inside it would write the wrong `sortOrder`. The
 *    search therefore moved out of the URL (`mode="local"`) and sets `locked`.
 *
 * `LiveAnnouncer` MUST wrap the view, not sit inside it: the reorder lifecycle and the
 * grid both call `useAnnouncer()`, and a hook called in the same component that renders
 * the provider would read the default no-op context.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getAdminFaqControllerFindAllQueryKey,
  useAdminFaqControllerFindAll,
  useAdminFaqControllerUpdate,
  useAdminFaqControllerRemove,
  type FaqItemEntity,
} from "@/entities/faq";
import { faqItemsToItems, useFaqReorder } from "@/features/list-reorder";
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
import { AdminFaqTableSkeleton } from "./faq-table-skeleton";

export const FAQ_INSTRUCTIONS_LONG_ID = "faq-grid-instructions-long";
export const FAQ_INSTRUCTIONS_SHORT_ID = "faq-grid-instructions-short";

export function AdminFaqTable() {
  return (
    <LiveAnnouncer>
      <AdminFaqGrid />
    </LiveAnnouncer>
  );
}

function AdminFaqGrid() {
  const queryClient = useQueryClient();

  // No arguments: the COMPLETE list. The reorder adapter writes the server's refreshed
  // list into this exact query key, so the two calls must match.
  const { data, isLoading, isFetching, isError, refetch } =
    useAdminFaqControllerFindAll();
  const update = useAdminFaqControllerUpdate();
  const remove = useAdminFaqControllerRemove();

  const items = useMemo(() => data?.data ?? [], [data]);
  const treeItems = useMemo(() => faqItemsToItems(items), [items]);
  const byId = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const searchActive = needle.length > 0;

  const visibleIds = useMemo(() => {
    if (!searchActive) return undefined;
    return new Set(
      treeItems
        .filter((item) => item.label.toLowerCase().includes(needle))
        .map((item) => item.id),
    );
  }, [needle, searchActive, treeItems]);

  const focus = useRowFocus();
  const reorder = useFaqReorder({
    items: treeItems,
    onFocusRow: focus.focusRow,
  });
  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: "faq-row-",
    locked: searchActive,
    visibleIds,
  });

  // Prefix match: the key without params covers every paged/searched variant.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminFaqControllerFindAllQueryKey(),
    });

  const handleToggle = (item: FaqItemEntity) => {
    update.mutate(
      { id: item.id, data: { isActive: !item.isActive } },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            item.isActive ? dict.faq.toastDeactivated : dict.faq.toastActivated,
          );
        },
        onError: () => toast.error(dict.faq.toastStatusFailed),
      },
    );
  };

  const handleDelete = (item: FaqItemEntity) => {
    if (!window.confirm(dict.faq.deleteConfirm)) return;
    remove.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.faq.toastDeleted);
        },
        onError: () => toast.error(dict.faq.toastDeleteFailed),
      },
    );
  };

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const item = byId.get(props.item.id);
    if (!row || !item) return null;
    return (
      <FaqRow
        key={item.id}
        item={item}
        row={row}
        locked={searchActive}
        isTogglePending={update.isPending}
        isDeletePending={remove.isPending}
        onToggle={handleToggle}
        onDelete={handleDelete}
        registerRef={(node) => {
          focus.registerRow(item.id)(node);
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
          // `mode="local"`: the needle hides ROWS, it does not narrow a query — see the
          // header for why this grid stays unpaginated and why a search LOCKS reordering
          // instead of PATCHing a partial ordering.
          <TableSearch
            mode="local"
            value={search}
            onChange={(next) => setSearch(next ?? "")}
            placeholder={dict.reorderList.searchPlaceholder}
            label={dict.reorderList.searchLabel}
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

      <p className="text-sm text-muted-foreground">
        {searchActive
          ? dict.reorderList.searchLockedHint
          : dict.faq.reorderHint}
      </p>

      <div id={FAQ_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={FAQ_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <AdminFaqTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.faq.loadError}
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.faq.empty}
        </div>
      ) : grid.rows.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.reorderList.emptyMatch(search.trim())}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table
            role="grid"
            aria-label={dict.faq.gridLabel}
            aria-describedby={FAQ_INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending}
          >
            <TableHeader>
              <TableRow aria-rowindex={1}>
                <TableHead>{dict.faq.colQuestion}</TableHead>
                <TableHead className="w-32">{dict.faq.colStatus}</TableHead>
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

interface FaqRowProps {
  item: FaqItemEntity;
  row: SortableListRow;
  locked: boolean;
  isTogglePending: boolean;
  isDeletePending: boolean;
  onToggle: (item: FaqItemEntity) => void;
  onDelete: (item: FaqItemEntity) => void;
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function FaqRow({
  item,
  row,
  locked,
  isTogglePending,
  isDeletePending,
  onToggle,
  onDelete,
  registerRef,
  style,
  handleProps,
}: FaqRowProps) {
  const tabIndex = row.controlTabIndex;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={FAQ_INSTRUCTIONS_SHORT_ID}
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
            aria-label={dict.reorderList.handleLabel(item.question)}
            aria-disabled={locked || undefined}
            className="inline-flex size-6 min-h-11 min-w-11 cursor-grab items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <Link
            href={`/faq/${item.id}/edit`}
            tabIndex={tabIndex}
            className="hover:underline"
          >
            {item.question}
          </Link>
        </div>
      </TableCell>
      <TableCell role="gridcell">
        <Badge variant={item.isActive ? "default" : "secondary"}>
          {item.isActive ? dict.faq.statusActive : dict.faq.statusInactive}
        </Badge>
      </TableCell>
      <TableCell role="gridcell" className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/faq/${item.id}/edit`} tabIndex={tabIndex}>
              {dict.common.edit}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            tabIndex={tabIndex}
            disabled={isTogglePending}
            onClick={() => onToggle(item)}
          >
            {item.isActive ? dict.faq.deactivate : dict.faq.activate}
          </Button>
          <Button
            variant="outline"
            size="sm"
            tabIndex={tabIndex}
            disabled={isDeletePending}
            onClick={() => onDelete(item)}
          >
            {dict.common.delete}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
