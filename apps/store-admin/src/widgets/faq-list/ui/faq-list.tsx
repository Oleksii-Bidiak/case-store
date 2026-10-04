"use client";

/**
 * Admin FAQ list (TASK-242; drag/keyboard reordering since TASK-428; accordion
 * rows, views, «⋯» and the form dialog of wave 198 — FaqProposal ЧП1–ЧП8,
 * TASK-1075).
 *
 * The sortable grid REPLACED the flat table and its hand-typed «Порядок» column: the row
 * order IS the order /info shows.
 *
 * TWO RULES MAKE THAT SAFE, and they are the same two every flat sortable list follows:
 *
 * 1. THE LIST IS NOT PAGINATED. A page is a PARTIAL view, and a reorder computed on a
 *    partial view is a partial ordering — the server rejects it as a lost update (409).
 * 2. ANYTHING THAT HIDES ROWS LOCKS REORDERING. The search (question AND answer) and the
 *    «Показуються / Приховані» views filter LOCALLY and set `locked`: the visible order
 *    is then not the real one.
 *
 * Rows are an accordion (ЧП1): the question wraps (no `nowrap` widening the table), the
 * answer's first line sits under it, and a click on the row — or the chevron — opens the
 * whole answer. The form is a DIALOG over the list (owner decision 2026-10-01, like blog
 * categories); `/faq/new` and `/faq/[id]/edit` keep working by opening it on mount.
 *
 * `LiveAnnouncer` MUST wrap the view, not sit inside it: the reorder lifecycle and the
 * grid both call `useAnnouncer()`.
 */

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GripVertical,
  LockIcon,
} from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getAdminFaqControllerFindAllQueryKey,
  useAdminFaqControllerFindAll,
  useAdminFaqControllerUpdate,
  useAdminFaqControllerRemove,
  type FaqItemEntity,
} from "@/entities/faq";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { FaqFormDialog } from "@/features/faq-form";
import { faqItemsToItems, useFaqReorder } from "@/features/list-reorder";
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
  QuickViews,
  REGISTRY_CARD_QUERY,
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
  type RowActionItem,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { AdminFaqTableSkeleton } from "./faq-table-skeleton";

export const FAQ_INSTRUCTIONS_LONG_ID = "faq-grid-instructions-long";
export const FAQ_INSTRUCTIONS_SHORT_ID = "faq-grid-instructions-short";

const d = dict.faq;

/** «Усі · Показуються · Приховані» — `?status=` with `shown` / `hidden`. */
const VIEW_ALL = "all";
const VIEW_SHOWN = "shown";
const VIEW_HIDDEN = "hidden";

/** Clicks on these never toggle the row: they are controls with their own job. */
const INTERACTIVE =
  "a,button,input,[role=menuitem],[data-registry-interactive]";

/** What a route asks the list to open on mount (`/faq/new`, `/faq/[id]/edit`). */
export type FaqDialogRequest =
  { mode: "create" } | { mode: "edit"; id: string };

type DialogState = FaqDialogRequest & { readOnly?: boolean };

interface AdminFaqTableProps {
  /** Deep link: open the form dialog on mount; closing it returns to `/faq`. */
  dialog?: FaqDialogRequest;
}

export function AdminFaqTable({ dialog }: AdminFaqTableProps = {}) {
  return (
    <LiveAnnouncer>
      <AdminFaqGrid dialog={dialog} />
    </LiveAnnouncer>
  );
}

function AdminFaqGrid({ dialog }: AdminFaqTableProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { can } = useAuth();
  // The key the API guards every write here with.
  const canWrite = can(PERM.faqWrite);
  const { confirm, confirmDialog } = useConfirmDialog();

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

  const searchParams = useSearchParams();
  const updateParams = useUrlParams();
  const statusParam = searchParams.get("status") ?? "";
  const viewFilter =
    statusParam === VIEW_SHOWN || statusParam === VIEW_HIDDEN
      ? statusParam
      : undefined;
  const filterActive = searchActive || viewFilter !== undefined;

  const shownCount = useMemo(
    () => items.filter((item) => item.isActive).length,
    [items],
  );

  // The question OR the answer — an operator often remembers the wording of
  // the answer, not of the question.
  const visibleIds = useMemo(() => {
    if (!filterActive) return undefined;
    return new Set(
      items
        .filter(
          (item) =>
            (viewFilter === undefined ||
              item.isActive === (viewFilter === VIEW_SHOWN)) &&
            (!searchActive ||
              item.question.toLowerCase().includes(needle) ||
              item.answer.toLowerCase().includes(needle)),
        )
        .map((item) => item.id),
    );
  }, [filterActive, items, needle, searchActive, viewFilter]);

  const focus = useRowFocus();
  const reorder = useFaqReorder({
    items: treeItems,
    onFocusRow: focus.focusRow,
  });
  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: "faq-row-",
    locked: filterActive || !canWrite,
    visibleIds,
  });

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ── the form dialog ─────────────────────────────────────────────────── */

  // Seeded once from the ROUTE (a static prop, not async data).
  const [dialogState, setDialogState] = useState<DialogState | null>(
    dialog ? { ...dialog, readOnly: !canWrite } : null,
  );
  const closeDialog = () => {
    setDialogState(null);
    // Opened by a deep link: put the address back to the list.
    if (dialog) router.replace("/faq");
  };
  const editItem =
    dialogState?.mode === "edit" ? byId.get(dialogState.id) : undefined;
  const editMissing =
    dialogState?.mode === "edit" && !isLoading && !isError && !editItem;
  // Render-time guard (forms.md rule 1a): an id the loaded list does not have
  // (deleted, mistyped) closes the request; the effect below only says so.
  const [missingNotice, setMissingNotice] = useState(0);
  if (editMissing) {
    setDialogState(null);
    setMissingNotice((n) => n + 1);
  }
  useEffect(() => {
    if (missingNotice === 0) return;
    toast.error(d.notFound);
    if (dialog) router.replace("/faq");
  }, [dialog, missingNotice, router]);

  /* ── row actions ─────────────────────────────────────────────────────── */

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
          toast.success(item.isActive ? d.toastDeactivated : d.toastActivated);
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );
  };

  // TASK-812 — AlertDialog instead of window.confirm, advising «Приховати».
  const handleDelete = async (item: FaqItemEntity) => {
    const confirmed = await confirm({
      title: d.deleteTitle,
      description: d.deleteBody(item.question),
      confirmLabel: d.deleteAction,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(d.toastDeleted);
        },
        onError: () => toast.error(d.toastDeleteFailed),
      },
    );
  };

  const rowActions = (item: FaqItemEntity): RowActionItem[] => {
    if (!canWrite) {
      return [
        {
          label: dict.common.view,
          onSelect: () =>
            setDialogState({ mode: "edit", id: item.id, readOnly: true }),
        },
      ];
    }
    return [
      {
        label: dict.common.edit,
        onSelect: () => setDialogState({ mode: "edit", id: item.id }),
      },
      {
        label: item.isActive ? d.deactivate : d.activate,
        onSelect: () => handleToggle(item),
        disabled: update.isPending,
      },
      {
        label: d.deleteItem,
        onSelect: () => void handleDelete(item),
        destructive: true,
        separatorBefore: true,
        disabled: remove.isPending,
      },
    ];
  };

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, id: string) => {
    const row = event.currentTarget;
    const target = event.target as Element;
    // Bubbled out of a portal (the «⋯» menu) or from a control: not a row click.
    if (!row.contains(target)) return;
    const control = target.closest(INTERACTIVE);
    if (control && row.contains(control)) return;
    if (window.getSelection?.()?.toString()) return;
    toggleExpanded(id);
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
        canWrite={canWrite}
        locked={filterActive}
        open={expanded.has(item.id)}
        onToggle={() => toggleExpanded(item.id)}
        onRowClick={onRowClick}
        actions={rowActions(item)}
        registerRef={(node) => {
          focus.registerRow(item.id)(node);
          props.setNodeRef(node);
        }}
        style={props.style}
        handleProps={props.handleProps}
      />
    );
  };

  const hint = !canWrite
    ? dict.common.viewOnly
    : searchActive
      ? dict.reorderList.searchLockedHint
      : viewFilter
        ? d.viewLockedHint
        : d.reorderHint;
  const HintIcon = !canWrite || filterActive ? LockIcon : GripVertical;

  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={d.heading}
        description={
          <>
            {d.subheadingLead}{" "}
            <a
              href={`${STOREFRONT_URL}/info`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={d.infoLinkAria}
              className="rounded-xs font-mono text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              /info
            </a>{" "}
            {d.subheadingTail}
          </>
        }
        actions={
          canWrite ? (
            <Button
              type="button"
              onClick={() => setDialogState({ mode: "create" })}
            >
              {d.add}
            </Button>
          ) : null
        }
      />

      <QuickViews
        items={[
          { id: VIEW_ALL, label: d.viewAll, count: items.length },
          { id: VIEW_SHOWN, label: d.viewShown, count: shownCount },
          {
            id: VIEW_HIDDEN,
            label: d.viewHidden,
            count: items.length - shownCount,
          },
        ]}
        activeId={statusParam || VIEW_ALL}
        onChange={(id) =>
          updateParams({ status: id === VIEW_ALL ? undefined : id })
        }
      />

      <div className="flex flex-col gap-3">
        <RegistryToolbar
          search={{
            value: search,
            placeholder: d.searchPlaceholder,
            label: d.searchLabel,
            // LOCAL: hides rows and locks the drag; never narrows the query.
            onChange: (next) => setSearch(next ?? ""),
          }}
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
        />
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

      <div id={FAQ_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={FAQ_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <AdminFaqTableSkeleton withChrome={false} />
      ) : isError ? (
        <ErrorState
          variant="card"
          message={d.loadError}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : items.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {d.empty}
        </div>
      ) : grid.rows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {searchActive
            ? dict.reorderList.emptyMatch(search.trim())
            : dict.common.table.emptyFiltered}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border shadow-card">
          <Table
            role="grid"
            aria-label={d.gridLabel}
            aria-describedby={FAQ_INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending}
            className="table-fixed"
          >
            <colgroup>
              <col className="w-12 md:w-18" />
              <col />
              <col className="hidden w-36 md:table-column" />
              <col className="w-11" />
            </colgroup>
            {/* The accordion has no visible header (ЧП1); the grid still needs
                its header row for the cell semantics. */}
            <TableHeader className="sr-only">
              <TableRow aria-rowindex={1}>
                <TableHead />

                <TableHead>{d.colQuestion}</TableHead>
                <TableHead hideOnMobile>{d.colStatus}</TableHead>
                <TableHead>{dict.common.actions}</TableHead>
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

      {dialogState && (dialogState.mode === "create" || editItem) ? (
        <FaqFormDialog
          open
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
          item={editItem ?? null}
          readOnly={dialogState.readOnly || !canWrite}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

interface FaqRowProps {
  item: FaqItemEntity;
  row: SortableListRow;
  canWrite: boolean;
  /** A filter hides rows — the grip stays but says it is unavailable. */
  locked: boolean;
  open: boolean;
  onToggle: () => void;
  onRowClick: (event: MouseEvent<HTMLTableRowElement>, id: string) => void;
  actions: RowActionItem[];
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function FaqRow({
  item,
  row,
  canWrite,
  locked,
  open,
  onToggle,
  onRowClick,
  actions,
  registerRef,
  style,
  handleProps,
}: FaqRowProps) {
  const tabIndex = row.controlTabIndex;
  // One badge in the DOM: under the answer on a phone (ЧП2), its own column
  // on a wider screen (ЧП1).
  const isPhone = useMediaQuery(REGISTRY_CARD_QUERY);
  const answerId = `faq-answer-${item.id}`;
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  const status = (
    <Badge variant={item.isActive ? "default" : "secondary"}>
      {item.isActive ? d.statusActive : d.statusInactive}
    </Badge>
  );

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={FAQ_INSTRUCTIONS_SHORT_ID}
      style={style}
      onClick={(event) => onRowClick(event, item.id)}
      className={cn(
        "cursor-pointer",
        row.grabbed
          ? "outline outline-2 outline-ring"
          : row.conflict
            ? "bg-accent"
            : undefined,
      )}
    >
      <TableCell role="gridcell" className="px-1 py-2.5 align-top md:px-2">
        <div className="flex items-center">
          {canWrite ? (
            <button
              type="button"
              {...handleProps}
              tabIndex={tabIndex}
              aria-label={dict.reorderList.handleLabel(item.question)}
              aria-disabled={locked || undefined}
              className="inline-flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <span className="inline-flex size-11 shrink-0 items-center justify-center text-muted-foreground md:size-8">
              <LockIcon aria-hidden="true" className="size-4" />
            </span>
          )}
          {/* On a phone the whole card toggles; the 32 px chevron would be a
              second, too-small target next to the 44 px grip. */}
          <button
            type="button"
            tabIndex={tabIndex}
            aria-expanded={open}
            aria-controls={answerId}
            aria-label={d.answerToggleAria(item.question)}
            onClick={onToggle}
            className="hidden size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:inline-flex"
          >
            <Chevron aria-hidden="true" className="size-4" />
          </button>
        </div>
      </TableCell>
      <TableCell
        role="gridcell"
        className="px-2 py-3 align-top whitespace-normal"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium break-words text-foreground">
            {item.question}
          </span>
          <p
            id={answerId}
            className={cn(
              "text-sm break-words text-muted-foreground",
              open
                ? "mt-1 rounded-md bg-muted px-3 py-2 whitespace-pre-line text-foreground"
                : "line-clamp-1",
            )}
          >
            {item.answer}
          </p>
          {isPhone ? <div className="mt-1">{status}</div> : null}
        </div>
      </TableCell>
      <TableCell role="gridcell" hideOnMobile className="px-2 py-3 align-top">
        {isPhone ? null : status}
      </TableCell>
      <TableCell
        role="gridcell"
        className="w-11 px-0 py-2.5 pr-1.5 text-right align-top"
      >
        <RowActionsMenu
          label={d.rowActionsAria(item.question)}
          items={actions}
          tabIndex={tabIndex}
        />
      </TableCell>
    </TableRow>
  );
}
