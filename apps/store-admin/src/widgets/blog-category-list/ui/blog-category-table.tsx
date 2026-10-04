"use client";

/**
 * Admin blog-category grid (TASK-172; drag/keyboard reordering added in TASK-295;
 * wave 198 — BlogCategoriesProposal КБ1–КБ6, TASK-1072).
 *
 * The sortable grid REPLACED the flat table and its hand-typed `sortOrder` number:
 * the row order IS the order of the category chips on the site's «Блог». The
 * reorder payload must name EVERY category in the list (or the server 409s a lost
 * update), so the grid reads the UNFILTERED list and the search — which hides
 * rows — LOCKS reordering rather than sending a partial ordering.
 *
 * THE GRID IS DELIBERATELY NOT PAGINATED, and TASK-357 did not change that even
 * though the endpoint now accepts `page`/`limit`. Same reason as the search lock:
 * a page is a partial view, and a reorder computed on a partial view is a partial
 * ordering.
 *
 * Wave 198: «На сайті» (`/blog?category=…`) instead of the bare slug, «Статей»
 * as a link into the posts list filtered by the category, the row's actions in
 * «⋯» («Редагувати» opens the dialog over the list — КБ4), the delete confirm as
 * an AlertDialog (TASK-812), and the API's 409 for a category that still has
 * posts explained in a dialog with the way to them, instead of a toast that
 * guessed «можливо, у ній ще є статті».
 *
 * Not drawn, because the API does not provide them (TASK-1072 API tails): the
 * NUMBER of posts per category (the list has no count — «Статей» is a link
 * without one), and «Перенести N статей у … й видалити» (no transfer endpoint).
 *
 * Every admin blog route needs `blog:write`; without it the grid is view-only —
 * no handle, no reordering, no edit or delete.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getAdminBlogControllerFindCategoriesQueryKey,
  useAdminBlogControllerFindCategories,
  useAdminBlogControllerDeleteCategory,
  type BlogCategoryEntity,
} from "@/entities/blog";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { dict, STOREFRONT_URL } from "@/shared/config";
import { BlogCategoryTableSkeleton } from "./blog-category-table-skeleton";

const c = dict.blogCategories;

export const BLOG_CATEGORY_INSTRUCTIONS_LONG_ID =
  "blog-category-grid-instructions-long";
export const BLOG_CATEGORY_INSTRUCTIONS_SHORT_ID =
  "blog-category-grid-instructions-short";

/** The filter's address on the site, as the operator sees it in the row. */
const filterPath = (category: BlogCategoryEntity) =>
  `/blog?category=${category.slug}`;
/** The posts register narrowed to this category (`?category=` is a slug). */
const postsHref = (category: BlogCategoryEntity) =>
  `/blog?category=${encodeURIComponent(category.slug)}`;
const siteHref = (category: BlogCategoryEntity) =>
  `${STOREFRONT_URL}/blog?category=${encodeURIComponent(category.slug)}`;
/** The form dialog over this list (КБ4). */
const editHref = (category: BlogCategoryEntity) =>
  `/blog/categories?edit=${encodeURIComponent(category.id)}`;

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
  const { can } = useAuth();
  const canWrite = can(PERM.blogWrite);
  const { confirm, confirmDialog } = useConfirmDialog();
  const [hasPosts, setHasPosts] = useState<BlogCategoryEntity | null>(null);

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminBlogControllerFindCategories();
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
    // A view-only session may not reorder at all — the PATCH would be a 403.
    locked: searchActive || !canWrite,
    visibleIds,
  });

  const handleDelete = async (category: BlogCategoryEntity) => {
    const confirmed = await confirm({
      title: c.deleteTitle(category.name),
      description: c.deleteDescription(category.slug),
      confirmLabel: c.deleteAction,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: category.id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminBlogControllerFindCategoriesQueryKey(),
          });
          toast.success(c.toastDeleted);
        },
        onError: (error) => {
          // The API refuses a category that still has posts (409): a post
          // cannot be without a category. Say so, and show the way to them.
          if (error?.response?.status === 409) {
            setHasPosts(category);
            return;
          }
          toast.error(c.toastDeleteFailed);
        },
      },
    );
  };

  const rowActions = (category: BlogCategoryEntity): RowActionItem[] => {
    const items: RowActionItem[] = [];
    if (canWrite) items.push({ label: c.rowEdit, href: editHref(category) });
    items.push(
      { label: c.rowShowPosts, href: postsHref(category) },
      { label: c.rowOpenSite, href: siteHref(category), newTab: true },
    );
    if (canWrite) {
      items.push({
        label: c.rowDelete,
        onSelect: () => void handleDelete(category),
        destructive: true,
        separatorBefore: true,
        disabled: remove.isPending,
      });
    }
    return items;
  };

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const category = byId.get(props.item.id);
    if (!row || !category) return null;
    return (
      <BlogCategoryRow
        key={category.id}
        category={category}
        row={row}
        canWrite={canWrite}
        locked={searchActive}
        actions={rowActions(category)}
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
    <div className="flex flex-col gap-3">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          // `mode="local"` (TASK-423): the needle hides ROWS, it does not narrow
          // a query — see the header for why this list stays unpaginated and why
          // a search LOCKS reordering instead of PATCHing a partial ordering.
          <TableSearch
            mode="local"
            value={search}
            onChange={(next) => setSearch(next ?? "")}
            placeholder={c.searchPlaceholder}
            label={dict.reorderList.searchLabel}
          />
        }
        actions={
          canWrite ? (
            // TASK-963: the «Скасувати» toast is the visible way back after a
            // drag; this icon keeps the undo reachable from the keyboard.
            <ReorderUndoButton
              canUndo={reorder.canUndo}
              onUndo={reorder.undo}
              label={dict.reorderList.undo}
              iconOnly
            />
          ) : null
        }
      />

      {searchActive && canWrite ? (
        <p className="text-sm text-muted-foreground">
          {dict.reorderList.searchLockedHint}
        </p>
      ) : canWrite ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <GripVertical
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0"
          />
          {c.orderHint}
        </p>
      ) : null}

      <div id={BLOG_CATEGORY_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={BLOG_CATEGORY_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <BlogCategoryTableSkeleton toolbar={false} />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {c.loadError}
        </p>
      ) : categories.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {c.empty}
        </div>
      ) : grid.rows.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.reorderList.emptyMatch(search.trim())}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border shadow-card">
          <Table
            role="grid"
            aria-label={c.gridLabel}
            aria-describedby={BLOG_CATEGORY_INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending}
          >
            <TableHeader>
              <TableRow aria-rowindex={1}>
                <TableHead>{c.colName}</TableHead>
                <TableHead hideOnMobile>{c.colSite}</TableHead>
                <TableHead hideOnMobile>{c.colPosts}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{dict.common.actions}</span>
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

      {confirmDialog}
      <AlertDialog
        open={hasPosts !== null}
        onOpenChange={(open) => {
          if (!open) setHasPosts(null);
        }}
      >
        {hasPosts ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {c.hasPostsTitle(hasPosts.name)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {c.hasPostsDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{dict.common.close}</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Link href={postsHref(hasPosts)}>{c.rowShowPosts}</Link>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </div>
  );
}

interface BlogCategoryRowProps {
  category: BlogCategoryEntity;
  row: SortableListRow;
  canWrite: boolean;
  /** A search hides rows — the handle says it cannot move them. */
  locked: boolean;
  actions: readonly RowActionItem[];
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function BlogCategoryRow({
  category,
  row,
  canWrite,
  locked,
  actions,
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
          {canWrite ? (
            <button
              type="button"
              {...handleProps}
              tabIndex={tabIndex}
              aria-label={dict.reorderList.handleLabel(category.name)}
              aria-disabled={locked || undefined}
              className="inline-flex size-6 min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            {canWrite ? (
              <Link
                href={editHref(category)}
                scroll={false}
                tabIndex={tabIndex}
                className="w-fit rounded-xs outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {category.name}
              </Link>
            ) : (
              <span>{category.name}</span>
            )}
            {/* КБ5: on a phone the address rides under the name. */}
            <span className="truncate font-mono text-xs font-normal text-muted-foreground md:hidden">
              {filterPath(category)}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell role="gridcell" hideOnMobile>
        <a
          href={siteHref(category)}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={tabIndex}
          aria-label={dict.blogCategories.siteLinkAria(category.name)}
          className="rounded-xs font-mono text-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {filterPath(category)}
        </a>
      </TableCell>
      <TableCell role="gridcell" hideOnMobile>
        <Link
          href={postsHref(category)}
          tabIndex={tabIndex}
          aria-label={dict.blogCategories.postsLinkAria(category.name)}
          className="rounded-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {dict.blogCategories.postsLink}
        </Link>
      </TableCell>
      <TableCell role="gridcell" className="text-right">
        <RowActionsMenu
          label={dict.blogCategories.rowActionsAria(category.name)}
          items={actions}
          tabIndex={tabIndex}
        />
      </TableCell>
    </TableRow>
  );
}
