"use client";

/**
 * Admin blog-category grid (TASK-172; drag/keyboard reordering added in TASK-295).
 *
 * The sortable grid REPLACED the flat table and its hand-typed `sortOrder` number:
 * the row order IS the order. The reorder payload must name EVERY category in the
 * list (or the server 409s a lost update), so the grid reads the UNFILTERED list
 * and the search — which hides rows — LOCKS reordering rather than sending a
 * partial ordering.
 *
 * A category that still has posts is refused by the API (409 on delete) — surfaced
 * as an error toast.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  getAdminBlogControllerFindCategoriesQueryKey,
  useAdminBlogControllerFindCategories,
  useAdminBlogControllerDeleteCategory,
  type BlogCategoryEntity,
} from "@/entities/blog";
import {
  blogCategoriesToItems,
  useBlogCategoryReorder,
} from "@/features/list-reorder";
import {
  useRowFocus,
  useSortableListGrid,
  type SortableListRow,
} from "@/shared/lib/list-reorder";
import {
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
import { BlogCategoryTableSkeleton } from "./blog-category-table-skeleton";

export const BLOG_CATEGORY_INSTRUCTIONS_LONG_ID =
  "blog-category-grid-instructions-long";
export const BLOG_CATEGORY_INSTRUCTIONS_SHORT_ID =
  "blog-category-grid-instructions-short";

/**
 * `LiveAnnouncer` MUST wrap the grid, not sit inside it: the reorder lifecycle and
 * the grid both call `useAnnouncer()`, and a hook called in the same component
 * that renders the provider would read the default no-op context.
 */
export function BlogCategoryTable() {
  return (
    <LiveAnnouncer>
      <BlogCategoryGrid />
    </LiveAnnouncer>
  );
}

function BlogCategoryGrid() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useAdminBlogControllerFindCategories();
  const remove = useAdminBlogControllerDeleteCategory();

  const categories = useMemo(() => data?.data ?? [], [data]);
  const items = useMemo(() => blogCategoriesToItems(categories), [categories]);
  const byId = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
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
  const reorder = useBlogCategoryReorder({ items, onFocusRow: focus.focusRow });
  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: "blog-category-row-",
    locked: searchActive,
    visibleIds,
  });

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(dict.blogCategories.deleteConfirm(name))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminBlogControllerFindCategoriesQueryKey(),
          });
          toast.success(dict.blogCategories.toastDeleted);
        },
        onError: () => toast.error(dict.blogCategories.toastDeleteFailed),
      },
    );
  };

  if (isLoading) {
    return <BlogCategoryTableSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.blogCategories.loadError}
      </p>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.blogCategories.empty}
      </div>
    );
  }

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const category = byId.get(props.item.id);
    if (!row || !category) return null;
    return (
      <BlogCategoryRow
        key={category.id}
        category={category}
        row={row}
        locked={searchActive}
        isDeleting={remove.isPending}
        onDelete={handleDelete}
        registerRef={(node) => {
          focus.registerRow(category.id)(node);
          props.setNodeRef(node);
        }}
        style={props.style}
        handleProps={props.handleProps}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={dict.reorderList.searchPlaceholder}
          aria-label={dict.reorderList.searchLabel}
          className="max-w-xs"
        />
        <ReorderUndoButton
          canUndo={reorder.canUndo}
          onUndo={reorder.undo}
          label={dict.reorderList.undo}
        />
      </div>

      {searchActive && (
        <p className="text-sm text-muted-foreground">
          {dict.reorderList.searchLockedHint}
        </p>
      )}

      <div id={BLOG_CATEGORY_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={BLOG_CATEGORY_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {grid.rows.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.reorderList.emptyMatch(search.trim())}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table
            role="grid"
            aria-label={dict.blogCategories.gridLabel}
            aria-describedby={BLOG_CATEGORY_INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending}
          >
            <TableHeader>
              <TableRow aria-rowindex={1}>
                <TableHead>{dict.blogCategories.colName}</TableHead>
                <TableHead hideOnMobile>
                  {dict.blogCategories.colSlug}
                </TableHead>
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

interface BlogCategoryRowProps {
  category: BlogCategoryEntity;
  row: SortableListRow;
  locked: boolean;
  isDeleting: boolean;
  onDelete: (id: string, name: string) => void;
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function BlogCategoryRow({
  category,
  row,
  locked,
  isDeleting,
  onDelete,
  registerRef,
  style,
  handleProps,
}: BlogCategoryRowProps) {
  const tabIndex = row.controlTabIndex;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={BLOG_CATEGORY_INSTRUCTIONS_SHORT_ID}
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
            aria-label={dict.reorderList.handleLabel(category.name)}
            aria-disabled={locked || undefined}
            className="inline-flex size-6 min-h-11 min-w-11 cursor-grab items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <Link
            href={`/blog/categories/${category.id}/edit`}
            tabIndex={tabIndex}
            className="hover:underline"
          >
            {category.name}
          </Link>
        </div>
      </TableCell>
      <TableCell role="gridcell" hideOnMobile className="text-muted-foreground">
        {category.slug}
      </TableCell>
      <TableCell role="gridcell" className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/blog/categories/${category.id}/edit`}
              tabIndex={tabIndex}
            >
              {dict.common.edit}
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            tabIndex={tabIndex}
            disabled={isDeleting}
            onClick={() => onDelete(category.id, category.name)}
          >
            {dict.common.delete}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
