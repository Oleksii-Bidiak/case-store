"use client";

/**
 * Admin static-page grid (TASK-153; drag/keyboard reordering added in TASK-428).
 *
 * The sortable grid REPLACED the flat table and its hand-typed «Порядок» column: the row
 * order IS the order the `/legal` hub renders. Every page used to be created with
 * `sortOrder = 0`, so the hub's order was whatever the database returned.
 *
 * TWO RULES MAKE THAT SAFE, and they are the same two the banner / blog-category /
 * device-brand grids follow:
 *
 * 1. THE LIST IS NOT PAGINATED. TASK-357 gave this table server paging (`?page=`) to fix
 *    a silent truncation — it asked for `limit: 100` and rendered no pager. A page is a
 *    PARTIAL view, though, and a reorder computed on a partial view is a partial
 *    ordering: the server rejects it as a lost update (409). So the view now reads the
 *    COMPLETE list, which TASK-428 also had to make reachable — the admin query DTO used
 *    to inherit `page = 1` / `limit = 20` field initializers from the public one, so
 *    "everything" was not expressible. The endpoint still accepts `page`/`limit` (the
 *    content map uses them for a count).
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
  getAdminPageControllerFindAllQueryKey,
  useAdminPageControllerFindAll,
  useAdminPageControllerPublish,
  useAdminPageControllerUnpublish,
  useAdminPageControllerDelete,
  type PageEntity,
} from "@/entities/page";
import { pagesToItems, usePageReorder } from "@/features/list-reorder";
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
import { formatDate } from "@/shared/lib";
import { dict } from "@/shared/config";
import { AdminPageTableSkeleton } from "./admin-page-table-skeleton";

export const PAGE_INSTRUCTIONS_LONG_ID = "page-grid-instructions-long";
export const PAGE_INSTRUCTIONS_SHORT_ID = "page-grid-instructions-short";

export function AdminPageTable() {
  return (
    <LiveAnnouncer>
      <AdminPageGrid />
    </LiveAnnouncer>
  );
}

function AdminPageGrid() {
  const queryClient = useQueryClient();

  // No arguments: the COMPLETE list. The reorder adapter writes the server's refreshed
  // list into this exact query key, so the two calls must match.
  const { data, isLoading, isFetching, isError, refetch } =
    useAdminPageControllerFindAll();
  const publish = useAdminPageControllerPublish();
  const unpublish = useAdminPageControllerUnpublish();
  const remove = useAdminPageControllerDelete();

  const pages = useMemo(() => data?.data ?? [], [data]);
  const treeItems = useMemo(() => pagesToItems(pages), [pages]);
  const byId = useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  );

  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const searchActive = needle.length > 0;

  // Title OR slug — an operator hunting for a legal page usually remembers its URL.
  const visibleIds = useMemo(() => {
    if (!searchActive) return undefined;
    return new Set(
      pages
        .filter(
          (page) =>
            page.title.toLowerCase().includes(needle) ||
            page.slug.toLowerCase().includes(needle),
        )
        .map((page) => page.id),
    );
  }, [needle, pages, searchActive]);

  const focus = useRowFocus();
  const reorder = usePageReorder({
    items: treeItems,
    onFocusRow: focus.focusRow,
  });
  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: "page-row-",
    locked: searchActive,
    visibleIds,
  });

  // Prefix match: the key without params covers every paged/searched variant.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminPageControllerFindAllQueryKey(),
    });

  const handleToggle = (id: string, isActive: boolean) => {
    const mutation = isActive ? unpublish : publish;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            isActive ? dict.pages.toastUnpublished : dict.pages.toastPublished,
          );
        },
        onError: () => toast.error(dict.pages.toastStatusFailed),
      },
    );
  };

  const handleDelete = (id: string, title: string, isPublished: boolean) => {
    if (!window.confirm(dict.pages.deleteConfirm(title, isPublished))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.pages.toastDeleted);
        },
        onError: () => toast.error(dict.pages.toastDeleteFailed),
      },
    );
  };

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const page = byId.get(props.item.id);
    if (!row || !page) return null;
    return (
      <PageRow
        key={page.id}
        page={page}
        row={row}
        locked={searchActive}
        isMutating={isMutating}
        onToggle={handleToggle}
        onDelete={handleDelete}
        registerRef={(node) => {
          focus.registerRow(page.id)(node);
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
          : dict.pages.reorderHint}
      </p>

      <div id={PAGE_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={PAGE_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <AdminPageTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.pages.loadError}
        </p>
      ) : pages.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.pages.empty}
        </div>
      ) : grid.rows.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.reorderList.emptyMatch(search.trim())}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table
            role="grid"
            aria-label={dict.pages.gridLabel}
            aria-describedby={PAGE_INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending}
          >
            <TableHeader>
              <TableRow aria-rowindex={1}>
                <TableHead>{dict.pages.colTitle}</TableHead>
                <TableHead hideOnMobile>{dict.pages.colSlug}</TableHead>
                <TableHead>{dict.pages.colStatus}</TableHead>
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

/**
 * The status badge (TASK-430).
 *
 * Reads `status`, NOT `isActive`. `Page.isActive` is documented in the schema as a
 * derived read-only MIRROR of `status == PUBLISHED`, kept only so the old badges and
 * toggles keep working — which means it collapses DRAFT and SCHEDULED into one
 * value, and this badge was reporting a page scheduled for Friday as «Чернетка».
 * An operator could not tell it apart from one somebody forgot to publish, which is
 * the difference the schedule exists to make.
 *
 * The publish/unpublish BUTTON below still reads `isActive`, correctly: "is it live
 * right now" is exactly what that mirror answers.
 *
 * The date is `formatDate` — «Заплановано на 19.09.2026», the full year included.
 * A day-and-month shorthand would hide the one mistake worth catching here: a
 * schedule typed into the wrong year.
 */
function PageStatusBadge({ page }: { page: PageEntity }) {
  if (page.status === "SCHEDULED") {
    return (
      <Badge variant="warning">
        {page.scheduledAt
          ? dict.pages.statusScheduledOn(formatDate(page.scheduledAt))
          : // SCHEDULED with no instant should not exist (the API sets them
            // together) — say «Заплановано» rather than render "Invalid Date".
            dict.pages.statusScheduled}
      </Badge>
    );
  }

  const isPublished = page.status === "PUBLISHED";

  return (
    <Badge variant={isPublished ? "default" : "secondary"}>
      {isPublished ? dict.pages.statusPublished : dict.pages.statusDraft}
    </Badge>
  );
}

interface PageRowProps {
  page: PageEntity;
  row: SortableListRow;
  locked: boolean;
  isMutating: boolean;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string, title: string, isPublished: boolean) => void;
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function PageRow({
  page,
  row,
  locked,
  isMutating,
  onToggle,
  onDelete,
  registerRef,
  style,
  handleProps,
}: PageRowProps) {
  const tabIndex = row.controlTabIndex;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={PAGE_INSTRUCTIONS_SHORT_ID}
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
            aria-label={dict.reorderList.handleLabel(page.title)}
            aria-disabled={locked || undefined}
            className="inline-flex size-6 min-h-11 min-w-11 cursor-grab items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <Link
            href={`/pages/${page.id}/edit`}
            tabIndex={tabIndex}
            className="hover:underline"
          >
            {page.title}
          </Link>
        </div>
      </TableCell>
      <TableCell role="gridcell" hideOnMobile className="text-muted-foreground">
        {page.slug}
      </TableCell>
      <TableCell role="gridcell">
        <PageStatusBadge page={page} />
      </TableCell>
      <TableCell role="gridcell" className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/pages/${page.id}/edit`} tabIndex={tabIndex}>
              {dict.common.edit}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            tabIndex={tabIndex}
            disabled={isMutating}
            onClick={() => onToggle(page.id, page.isActive)}
          >
            {page.isActive ? dict.pages.unpublish : dict.pages.publish}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            tabIndex={tabIndex}
            disabled={isMutating}
            onClick={() => onDelete(page.id, page.title, page.isActive)}
          >
            {dict.common.delete}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
