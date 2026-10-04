"use client";

/**
 * Admin static-page registry (TASK-153; drag/keyboard reordering since TASK-428;
 * the registry chrome of wave 198 — PagesProposal СР1–СР7, TASK-1069).
 *
 * The sortable grid REPLACED the flat table and its hand-typed «Порядок» column: the row
 * order IS the order the `/legal` and `/info` hubs render.
 *
 * TWO RULES MAKE THAT SAFE, and they are the same two the banner / blog-category /
 * device-brand grids follow:
 *
 * 1. THE LIST IS NOT PAGINATED. A page of rows is a PARTIAL view, and a reorder
 *    computed on a partial view is a partial ordering the server rejects as a lost
 *    update (409). So the view reads the COMPLETE list.
 * 2. ANYTHING THAT HIDES ROWS LOCKS REORDERING. The search box, the kind views and the
 *    status filter all filter LOCALLY (never a narrowed API query — pages carry ONE
 *    global `sortOrder` and `PATCH /reorder` rewrites the whole list), and each of them
 *    sets `locked`: dragging inside a slice would write the wrong `sortOrder`.
 *
 * Wave 198 built the registry AROUND that grid from the shared pieces
 * (`shared/ui/data-registry`): header, quick views with counters (counted from the
 * complete list the grid already holds — no extra request), the toolbar, the «Фільтри»
 * sheet with chips, «Колонки», and «⋯» per row. `DataRegistry`'s own table is not used:
 * it has no drag-reorder, and the grid's ARIA model (`role="grid"`, roving tabindex,
 * keyboard moves) lives in `useSortableListGrid`.
 *
 * Below md the SAME rows paint as cards through `max-md:` classes — one DOM, so the
 * keyboard model and dnd-kit keep working on a phone, with the 44 px grip.
 *
 * `LiveAnnouncer` MUST wrap the view, not sit inside it: the reorder lifecycle and the
 * grid both call `useAnnouncer()`.
 */

import { useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, LockIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getAdminPageControllerFindAllQueryKey,
  useAdminPageControllerFindAll,
  useAdminPageControllerPublish,
  useAdminPageControllerUnpublish,
  useAdminPageControllerDelete,
  PageEntityKind,
  type PageEntity,
} from "@/entities/page";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { pagesToItems, usePageReorder } from "@/features/list-reorder";
import {
  useRowFocus,
  useSortableListGrid,
  type SortableListRow,
} from "@/shared/lib/list-reorder";
import {
  Button,
  ColumnsMenu,
  ErrorState,
  FilterChips,
  LiveAnnouncer,
  QuickViews,
  RegistryHeader,
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
  useConfirmDialog,
  useDataRegistry,
  type FilterChip,
  type RegistryColumn,
  type RowActionItem,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict } from "@/shared/config";
import { AdminPageTableSkeleton } from "./admin-page-table-skeleton";
import { PageFilterSheet } from "./page-filter-sheet";
import { buildPageColumns, pageSiteHref } from "./page-registry-columns";

export const PAGE_INSTRUCTIONS_LONG_ID = "page-grid-instructions-long";
export const PAGE_INSTRUCTIONS_SHORT_ID = "page-grid-instructions-short";

const d = dict.pages;

/** «Усі» — the view with no `?kind=`. */
const ALL_VIEW = "all";

const KIND_VIEWS: ReadonlyArray<{ id: string; label: string }> = [
  { id: ALL_VIEW, label: d.tabAll },
  { id: PageEntityKind.LEGAL, label: d.tabLegal },
  { id: PageEntityKind.INFO, label: d.tabInfo },
  { id: PageEntityKind.HUB, label: d.tabHub },
];

/**
 * Status filter (TASK-562), LOCAL for the same reason as the kind views. Reads
 * `status`, never the `isActive` mirror, so «Заплановано» is its own option.
 */
const PAGE_STATUSES = [
  "PUBLISHED",
  "SCHEDULED",
  "DRAFT",
] as const satisfies ReadonlyArray<PageEntity["status"]>;

const STATUS_LABELS: Record<PageEntity["status"], string> = {
  PUBLISHED: d.statusPublished,
  SCHEDULED: d.statusScheduled,
  DRAFT: d.statusDraft,
};

/** Narrow an arbitrary `?status=` string to a page status. */
function isPageStatus(value: string): value is PageEntity["status"] {
  return (PAGE_STATUSES as ReadonlyArray<string>).includes(value);
}

/** Narrow an arbitrary `?kind=` string to the enum. */
function isPageKind(value: string): value is PageEntityKind {
  return Object.values(PageEntityKind).includes(value as PageEntityKind);
}

/** Clicks on these never open the row: they are controls with their own job. */
const INTERACTIVE =
  "a,button,input,[role=menuitem],[data-registry-interactive]";

/* ── card layout below md (one DOM — see the header) ─────────────────────── */

const CARD_ROW =
  "max-md:relative max-md:mb-3 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-1.5 max-md:gap-y-1.5 max-md:rounded-lg max-md:border max-md:bg-card max-md:py-3 max-md:pr-12 max-md:shadow-card max-md:last:mb-0";
const CARD_CELL: Record<string, string> = {
  title: "max-md:basis-full max-md:p-0",
  site: "max-md:basis-full max-md:p-0",
  kind: "max-md:p-0",
  status: "max-md:p-0",
};

export function AdminPageTable() {
  return (
    <LiveAnnouncer>
      <AdminPageGrid />
    </LiveAnnouncer>
  );
}

function AdminPageGrid() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { can } = useAuth();
  // Same key as the API's class guard on every write here (and, today, on the
  // list itself — see the report's API tail about a `pages:read` key).
  const canWrite = can(PERM.pagesWrite);
  const { confirm, confirmDialog } = useConfirmDialog();

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

  const columns = useMemo(() => buildPageColumns(), []);
  const registry = useDataRegistry<PageEntity>({
    tableId: "pages",
    columns,
    rows: pages,
    getRowId: (page) => page.id,
  });

  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const searchActive = needle.length > 0;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const searchParams = useSearchParams();
  const updateParams = useUrlParams();
  const kindParam = searchParams.get("kind") ?? "";
  const kindFilter = isPageKind(kindParam) ? kindParam : undefined;
  const kindActive = kindFilter !== undefined;
  // A hand-typed `?status=bogus` filters nothing — and so shows no chip either.
  const statusParam = searchParams.get("status") ?? "";
  const statusFilter = isPageStatus(statusParam) ? statusParam : undefined;
  const statusActive = statusFilter !== undefined;

  // Any filter hides rows, and any one therefore locks the drag; so does a
  // session that may not reorder at all.
  const filterActive = searchActive || kindActive || statusActive;

  // A bogus `?kind=` selects no view — the honest state.
  const activeView = kindParam || ALL_VIEW;
  const counts = useMemo(() => {
    const byKind = new Map<string, number>();
    for (const page of pages) {
      byKind.set(page.kind, (byKind.get(page.kind) ?? 0) + 1);
    }
    return byKind;
  }, [pages]);

  // Title OR address — an operator hunting for a legal page usually remembers its URL.
  const visibleIds = useMemo(() => {
    if (!filterActive) return undefined;
    return new Set(
      pages
        .filter(
          (page) =>
            (kindFilter === undefined || page.kind === kindFilter) &&
            (statusFilter === undefined || page.status === statusFilter) &&
            (!searchActive ||
              page.title.toLowerCase().includes(needle) ||
              page.slug.toLowerCase().includes(needle)),
        )
        .map((page) => page.id),
    );
  }, [filterActive, kindFilter, needle, pages, searchActive, statusFilter]);

  const focus = useRowFocus();
  const reorder = usePageReorder({
    items: treeItems,
    onFocusRow: focus.focusRow,
  });
  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: "page-row-",
    locked: filterActive || !canWrite,
    visibleIds,
  });

  // Prefix match: the key without params covers every variant.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminPageControllerFindAllQueryKey(),
    });

  const handleToggle = (page: PageEntity) => {
    const mutation = page.isActive ? unpublish : publish;
    mutation.mutate(
      { id: page.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(page.isActive ? d.toastUnpublished : d.toastPublished);
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );
  };

  // TASK-812 — AlertDialog instead of window.confirm; TASK-285 — the Google
  // warning only for a page that is live right now.
  const handleDelete = async (page: PageEntity) => {
    const confirmed = await confirm({
      title: d.deleteTitle(page.title),
      description: d.deleteBody(page.isActive),
      confirmLabel: d.deleteAction,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: page.id },
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
    publish.isPending || unpublish.isPending || remove.isPending;

  const rowActions = (page: PageEntity): RowActionItem[] => {
    const editHref = `/pages/${page.id}/edit`;
    const siteHref = pageSiteHref(page);
    const site: RowActionItem[] = siteHref
      ? [{ label: d.openOnSite, href: siteHref, newTab: true }]
      : [];
    if (!canWrite) {
      return [{ label: dict.common.view, href: editHref }, ...site];
    }
    return [
      { label: dict.common.edit, href: editHref },
      ...site,
      {
        label: page.isActive
          ? d.unpublish
          : page.status === "SCHEDULED"
            ? d.publishNow
            : d.publish,
        onSelect: () => handleToggle(page),
        disabled: isMutating,
      },
      {
        label: d.deleteItem,
        onSelect: () => void handleDelete(page),
        destructive: true,
        separatorBefore: true,
        disabled: isMutating,
      },
    ];
  };

  const openRow = (event: MouseEvent<HTMLTableRowElement>, href: string) => {
    const row = event.currentTarget;
    const target = event.target as Element;
    // Bubbled out of a portal (the «⋯» menu) or from a control: not a row click.
    if (!row.contains(target)) return;
    const control = target.closest(INTERACTIVE);
    if (control && row.contains(control)) return;
    if (window.getSelection?.()?.toString()) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  };

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const page = byId.get(props.item.id);
    if (!row || !page) return null;
    return (
      <PageRow
        key={page.id}
        page={page}
        row={row}
        columns={registry.visibleColumns}
        canWrite={canWrite}
        locked={filterActive}
        actions={rowActions(page)}
        onOpen={openRow}
        registerRef={(node) => {
          focus.registerRow(page.id)(node);
          props.setNodeRef(node);
        }}
        style={props.style}
        handleProps={props.handleProps}
      />
    );
  };

  const chips: FilterChip[] = statusFilter
    ? [
        {
          key: "status",
          label: d.filterChip(STATUS_LABELS[statusFilter]),
          onRemove: () => updateParams({ status: undefined }),
        },
      ]
    : [];

  const hint = !canWrite
    ? dict.common.viewOnly
    : searchActive
      ? dict.reorderList.searchLockedHint
      : kindActive
        ? d.kindLockedHint
        : statusActive
          ? d.statusLockedHint
          : d.reorderHint;
  const HintIcon = !canWrite || filterActive ? LockIcon : GripVertical;

  const widthOf = (id: string) => registry.widths[id];

  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={d.heading}
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/pages/new">{d.add}</Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-2">
        <QuickViews
          items={KIND_VIEWS.map((v) => ({
            id: v.id,
            label: v.label,
            count: v.id === ALL_VIEW ? pages.length : (counts.get(v.id) ?? 0),
          }))}
          activeId={activeView}
          onChange={(id) =>
            updateParams({ kind: id === ALL_VIEW ? undefined : id })
          }
        />
        {/* SF-CNT-26 — what each kind is and where it lives on the site. */}
        <p className="max-w-3xl text-xs text-muted-foreground">
          {kindFilter === PageEntityKind.HUB ? d.kindNoteHub : d.kindNoteAll}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <RegistryToolbar
          search={{
            value: search,
            placeholder: d.searchPlaceholder,
            label: d.searchLabel,
            // LOCAL: the needle hides rows of the complete list and locks the
            // drag; it never narrows the API query (rule 2 in the header).
            onChange: (next) => setSearch(next ?? ""),
          }}
          filters={{
            count: chips.length,
            open: filtersOpen,
            onOpenChange: setFiltersOpen,
          }}
          columnsMenu={
            <ColumnsMenu
              columns={registry.columns}
              settings={registry.settings}
            />
          }
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
        />
        <FilterChips chips={chips} />

        <div className="flex items-start justify-between gap-3">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <HintIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>{hint}</span>
          </p>
          {canWrite ? (
            // The persistent way back for the keyboard; the toast after a
            // move (TASK-963, `features/list-reorder`) is the visible one.
            <ReorderUndoButton
              iconOnly
              canUndo={reorder.canUndo}
              onUndo={reorder.undo}
              label={dict.reorderList.undo}
            />
          ) : null}
        </div>
      </div>

      <div id={PAGE_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={PAGE_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <AdminPageTableSkeleton withChrome={false} />
      ) : isError ? (
        <ErrorState
          variant="card"
          message={d.loadError}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : pages.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {d.empty}
        </div>
      ) : grid.rows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {searchActive
            ? dict.reorderList.emptyMatch(search.trim())
            : statusActive
              ? dict.common.table.emptyFiltered
              : d.emptyKind}
        </div>
      ) : (
        <div className="rounded-lg border shadow-card max-md:rounded-none max-md:border-0 max-md:shadow-none md:overflow-hidden">
          <Table
            role="grid"
            aria-label={d.gridLabel}
            aria-describedby={PAGE_INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending}
            className="table-fixed max-md:block"
          >
            <colgroup className="max-md:hidden">
              {registry.visibleColumns.map((column) => (
                <col key={column.id} style={{ width: widthOf(column.id) }} />
              ))}
              <col className="w-11" />
            </colgroup>
            <TableHeader className="max-md:hidden">
              <TableRow aria-rowindex={1} className="hover:bg-transparent">
                {registry.visibleColumns.map((column) => (
                  <TableHead
                    key={column.id}
                    className={cn(
                      "px-3",
                      column.id === "title" && canWrite && "pl-10",
                    )}
                  >
                    {column.label}
                  </TableHead>
                ))}
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

      <PageFilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        applied={{ status: statusFilter ?? "" }}
        onApply={(next) => updateParams({ status: next.status || undefined })}
      />
      {confirmDialog}
    </div>
  );
}

interface PageRowProps {
  page: PageEntity;
  row: SortableListRow;
  columns: readonly RegistryColumn<PageEntity>[];
  canWrite: boolean;
  /** A filter hides rows — the grip stays but says it is unavailable. */
  locked: boolean;
  actions: RowActionItem[];
  onOpen: (event: MouseEvent<HTMLTableRowElement>, href: string) => void;
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function PageRow({
  page,
  row,
  columns,
  canWrite,
  locked,
  actions,
  onOpen,
  registerRef,
  style,
  handleProps,
}: PageRowProps) {
  const tabIndex = row.controlTabIndex;
  const editHref = `/pages/${page.id}/edit`;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={PAGE_INSTRUCTIONS_SHORT_ID}
      style={style}
      onClick={(event) => onOpen(event, editHref)}
      className={cn(
        "cursor-pointer",
        CARD_ROW,
        canWrite ? "max-md:pl-13" : "max-md:pl-4",
        row.grabbed
          ? "outline outline-2 outline-ring"
          : row.conflict
            ? "bg-accent"
            : undefined,
      )}
    >
      {columns.map((column) =>
        column.id === "title" ? (
          <TableCell
            key={column.id}
            role="gridcell"
            className={cn(
              "px-3 font-medium whitespace-normal break-words",
              CARD_CELL.title,
            )}
          >
            <div className="flex items-center gap-1">
              {canWrite ? (
                <button
                  type="button"
                  {...handleProps}
                  tabIndex={tabIndex}
                  aria-label={dict.reorderList.handleLabel(page.title)}
                  aria-disabled={locked || undefined}
                  className="inline-flex size-6 min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:absolute max-md:top-1/2 max-md:left-1 max-md:-translate-y-1/2 md:-ml-2 md:size-8 md:min-h-0 md:min-w-0"
                >
                  <GripVertical aria-hidden="true" className="size-4" />
                </button>
              ) : null}
              <Link
                href={editHref}
                tabIndex={tabIndex}
                className="rounded-xs outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {page.title}
              </Link>
            </div>
          </TableCell>
        ) : (
          <TableCell
            key={column.id}
            role="gridcell"
            className={cn(
              "px-3 whitespace-normal",
              CARD_CELL[column.id] ?? "max-md:p-0",
            )}
          >
            {column.cell(page)}
          </TableCell>
        ),
      )}
      <TableCell
        role="gridcell"
        className="w-11 px-0 pr-1.5 text-right max-md:absolute max-md:top-2 max-md:right-1 max-md:w-auto max-md:p-0"
      >
        <RowActionsMenu
          label={d.rowActionsAria(page.title)}
          items={actions}
          triggerTabIndex={tabIndex}
        />
      </TableCell>
    </TableRow>
  );
}
