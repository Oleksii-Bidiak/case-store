"use client";

/**
 * «Головна» — the homepage blocks screen (plan 186, TASK-662; mockups ДН-4.1…4.10,
 * read-only ReadOnlyTemplate РО-4).
 *
 * Every block of the homepage, hidden and scheduled ones included, in page order,
 * with the page schema beside it from `lg` up. A row says what the block is, where
 * its content comes from, shows the «Показується» switch (publish / unpublish) and a
 * «⋯» menu. Order is changed by dragging (desktop) or «Вище»/«Нижче» (below `md`,
 * ДН-4.10), with the «Скасувати» toast after a committed move.
 *
 * THERE IS NO FILTER OR SEARCH OVER THIS LIST, on purpose: the reorder payload is the
 * FULL ordered id list, and a local filter over a draggable list is exactly the pair
 * that broke wave 175. Ten-odd blocks do not need one.
 *
 * - Only CAROUSEL and TABS blocks are authored here («Додати блок», «Замінити
 *   карусель…», «Редагувати вкладки…»). The six singleton blocks (`isSystem`) are
 *   moved, hidden and scheduled — never removed: the API answers 409
 *   `HOME_BLOCK_SYSTEM`, so the menu does not offer it at all.
 * - A block that draws nothing on the site (`isEmpty` / `isOrphaned`) is yellow,
 *   with why and what to do (ДН-4.8).
 * - Without `home:write` (only `home:read`) the same list renders read-only: a lock
 *   instead of the handle, the state in words instead of the switch, no menu, no
 *   «Додати блок», and the shared `ReadOnlyNotice` line (TASK-667).
 *
 * `LiveAnnouncer` MUST wrap the view, not sit inside it: the reorder lifecycle and the
 * grid call `useAnnouncer()` (see `admin-carousel-table.tsx`).
 */

import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarClockIcon,
  ExternalLinkIcon,
  GalleryHorizontalIcon,
  GripVertical,
  HistoryIcon,
  ImageIcon,
  LayoutGridIcon,
  LayoutPanelTopIcon,
  LockIcon,
  MailIcon,
  MegaphoneIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import {
  getAdminHomeBlockControllerFindAllQueryKey,
  homeBlockLabel,
  sortHomeBlocks,
  useAdminHomeBlockControllerDelete,
  useAdminHomeBlockControllerFindAll,
  useAdminHomeBlockControllerPublish,
  useAdminHomeBlockControllerUnpublish,
  type AdminHomeBlockListResponse,
  type HomeBlockEntity,
  type HomeBlockType,
} from "@/entities/home-block";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import {
  homeBlocksToItems,
  useHomeBlockReorder,
} from "@/features/list-reorder";
import {
  HomeBlockDialog,
  ScheduleHomeBlockDialog,
  type HomeBlockDialogTarget,
} from "@/features/home-block-editor";
import {
  useRowFocus,
  useSortableListGrid,
  type ReorderLifecycleApi,
  type SortableListRow,
} from "@/shared/lib/list-reorder";
import { applyIntent } from "@/shared/lib/sortable-tree";
import { apiErrorCode } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  Badge,
  Button,
  Callout,
  LiveAnnouncer,
  ReadOnlyNotice,
  ReorderUndoButton,
  RowActionsMenu,
  SortableTree,
  StatusDot,
  Switch,
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
import { toast } from "@/shared/ui/toast";
import { dict } from "@/shared/config";
import {
  blockDuplicateNote,
  blockKind,
  blockProblem,
  blockSchedule,
  blockShownLabel,
  blockSummary,
  blockTabs,
} from "../model/home-block-row";
import { HomeBlockListSkeleton } from "./home-block-list-skeleton";

const d = dict.homeScreen;

export const HOME_BLOCK_INSTRUCTIONS_LONG_ID =
  "home-block-grid-instructions-long";
export const HOME_BLOCK_INSTRUCTIONS_SHORT_ID =
  "home-block-grid-instructions-short";
const ROW_ID_PREFIX = "home-block-row-";

const BLOCK_ICONS: Record<HomeBlockType, LucideIcon> = {
  HERO: ImageIcon,
  TRUST: ShieldCheckIcon,
  CATEGORY_NAV: LayoutGridIcon,
  TABS: LayoutPanelTopIcon,
  CAROUSEL: GalleryHorizontalIcon,
  PROMO_BANNER: MegaphoneIcon,
  RECENTLY_VIEWED: HistoryIcon,
  NEWSLETTER: MailIcon,
};

export interface HomeBlockListProps {
  /**
   * The header slot for «Подивитись на сайті» — TASK-670 fills it with the preview
   * action. Drawn for read-only sessions too: looking is what `home:read` is for.
   */
  previewAction?: ReactNode;
}

export function HomeBlockList(props: HomeBlockListProps) {
  return (
    <LiveAnnouncer>
      <HomeBlockView {...props} />
    </LiveAnnouncer>
  );
}

function HomeBlockView({ previewAction }: HomeBlockListProps) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.homeWrite);

  // No arguments: the reorder adapter writes the server's refreshed list into this
  // exact key, so the two calls must match.
  const { data, isLoading, isError, refetch } =
    useAdminHomeBlockControllerFindAll();
  const blocks = useMemo(() => sortHomeBlocks(data?.data ?? []), [data]);

  const publish = useAdminHomeBlockControllerPublish();
  const unpublish = useAdminHomeBlockControllerUnpublish();
  const remove = useAdminHomeBlockControllerDelete();
  const { confirm, confirmDialog } = useConfirmDialog();

  const [dialog, setDialog] = useState<HomeBlockDialogTarget | null>(null);
  const [scheduling, setScheduling] = useState<HomeBlockEntity | null>(null);

  const listKey = getAdminHomeBlockControllerFindAllQueryKey();

  /**
   * Publish / unpublish answer with the block itself: patch it into the list rather
   * than refetching, so a reorder that is saving at the same moment is not fought by
   * a refetch of the pre-move order.
   */
  const putBlock = (block: HomeBlockEntity) =>
    queryClient.setQueryData<AdminHomeBlockListResponse>(listKey, (old) =>
      old
        ? {
            ...old,
            data: old.data.map((b) => (b.id === block.id ? block : b)),
          }
        : old,
    );

  const showBlock = (block: HomeBlockEntity, quiet = false) =>
    publish.mutate(
      { id: block.id },
      {
        onSuccess: (response) => {
          putBlock(response.data);
          if (!quiet) toast.success(d.toastShown(homeBlockLabel(block)));
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );

  const handleToggle = (block: HomeBlockEntity, shown: boolean) => {
    if (shown) {
      showBlock(block);
      return;
    }
    unpublish.mutate(
      { id: block.id },
      {
        onSuccess: (response) => {
          putBlock(response.data);
          // ДН-4.3: hiding is one click away from a wrong click — offer it back.
          toast.undo(d.toastHidden(homeBlockLabel(block)), {
            onUndo: () => showBlock(block, true),
          });
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );
  };

  const handleRemove = async (block: HomeBlockEntity) => {
    const name = homeBlockLabel(block);
    const confirmed = await confirm({
      title: d.removeTitle(name),
      description: (
        <>
          <span className="block">
            {block.type === "CAROUSEL" && block.carousel
              ? d.removeCarousel(block.carousel.title)
              : d.removeOther}
          </span>
          <span className="mt-2 block">{d.removeHideInstead}</span>
        </>
      ),
      confirmLabel: d.removeConfirm,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: block.id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: listKey });
          toast.success(d.toastRemoved(name));
        },
        onError: (error) =>
          toast.error(
            apiErrorCode(error) === "HOME_BLOCK_SYSTEM"
              ? d.removeSystemRefused
              : d.toastRemoveFailed,
          ),
      },
    );
  };

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  const rowActions = (block: HomeBlockEntity): RowActionItem[] => {
    const items: RowActionItem[] = [];
    if (block.type === "CAROUSEL") {
      items.push({
        label: d.replaceCarousel,
        icon: PencilIcon,
        onSelect: () => setDialog({ mode: "edit", block }),
      });
      if (block.carousel) {
        items.push({
          label: d.openCarousel,
          icon: ExternalLinkIcon,
          href: `/carousels/${block.carousel.id}/edit`,
        });
      }
    }
    if (block.type === "TABS") {
      items.push({
        label: d.editTabs,
        icon: PencilIcon,
        onSelect: () => setDialog({ mode: "edit", block }),
      });
    }
    items.push({
      label: d.schedule,
      icon: CalendarClockIcon,
      onSelect: () => setScheduling(block),
    });
    if (block.type === "HERO" || block.type === "PROMO_BANNER") {
      items.push({
        label: d.openBanners,
        icon: ExternalLinkIcon,
        href: "/banners",
      });
    }
    // A singleton is hidden, never removed (409 HOME_BLOCK_SYSTEM).
    if (!block.isSystem) {
      items.push({
        label: d.remove,
        icon: Trash2Icon,
        destructive: true,
        separatorBefore: true,
        disabled: isMutating,
        onSelect: () => void handleRemove(block),
      });
    }
    return items;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {d.heading}
          </h2>
          <p className="text-sm text-muted-foreground">{d.intro}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* TASK-670: «Подивитись на сайті». */}
          {previewAction}
          {canWrite && (
            <Button
              type="button"
              disabled={!data}
              onClick={() => setDialog({ mode: "create" })}
              className="max-md:min-h-11"
            >
              <PlusIcon aria-hidden="true" />
              {d.add}
            </Button>
          )}
        </div>
      </div>

      {canWrite ? (
        <div className="flex flex-col gap-3">
          <Callout>{d.howItWorks}</Callout>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <GripVertical
              aria-hidden="true"
              className="size-3.5 shrink-0 max-md:hidden"
            />
            <span className="max-md:hidden">{d.reorderHint}</span>
            <span className="md:hidden">{d.reorderHintMobile}</span>
          </p>
        </div>
      ) : (
        <ReadOnlyNotice>{dict.readOnlyView.notices.home}</ReadOnlyNotice>
      )}

      <div id={HOME_BLOCK_INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderList.instructionsLong}
      </div>
      <div id={HOME_BLOCK_INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderList.instructionsShort}
      </div>

      {isLoading ? (
        <HomeBlockListSkeleton withHeading={false} />
      ) : isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-destructive">
            {d.loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refetch()}
          >
            {d.retry}
          </Button>
        </div>
      ) : blocks.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {d.empty}
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <HomeBlockGrid
            blocks={blocks}
            canWrite={canWrite}
            busy={isMutating}
            onToggle={handleToggle}
            rowActions={rowActions}
          />
          <HomeSchema blocks={blocks} />
        </div>
      )}

      {confirmDialog}
      {canWrite && (
        <>
          <HomeBlockDialog
            target={dialog}
            blocks={blocks}
            onOpenChange={(open) => {
              if (!open) setDialog(null);
            }}
          />
          <ScheduleHomeBlockDialog
            block={scheduling}
            onOpenChange={(open) => {
              if (!open) setScheduling(null);
            }}
          />
        </>
      )}
    </div>
  );
}

interface HomeBlockGridProps {
  /** EVERY block, in page order — the reorder payload names all of them. */
  blocks: HomeBlockEntity[];
  canWrite: boolean;
  /** A publish / unpublish / delete is in flight. */
  busy: boolean;
  onToggle: (block: HomeBlockEntity, shown: boolean) => void;
  rowActions: (block: HomeBlockEntity) => RowActionItem[];
}

/** ONE grid = ONE reorder lifecycle, over the complete list (never a filtered one). */
function HomeBlockGrid({
  blocks,
  canWrite,
  busy,
  onToggle,
  rowActions,
}: HomeBlockGridProps) {
  const items = useMemo(() => homeBlocksToItems(blocks), [blocks]);
  const byId = useMemo(
    () => new Map(blocks.map((block) => [block.id, block])),
    [blocks],
  );

  const focus = useRowFocus();
  const reorder = useHomeBlockReorder({ items, onFocusRow: focus.focusRow });
  const grid = useSortableListGrid({
    reorder,
    focus,
    rowIdPrefix: ROW_ID_PREFIX,
    // Without the write key nothing moves — the grid stays a list.
    locked: !canWrite,
  });

  const renderRow = (props: SortableTreeRowRenderProps) => {
    const row = grid.rows.find((r) => r.item.id === props.item.id);
    const block = byId.get(props.item.id);
    if (!row || !block) return null;
    return (
      <HomeBlockRow
        key={block.id}
        block={block}
        blocks={blocks}
        row={row}
        count={grid.rows.length}
        canWrite={canWrite}
        // A toggle racing an in-flight reorder lets the reorder response
        // overwrite the cache with the block's old status.
        busy={busy || reorder.isPending}
        reorder={reorder}
        onToggle={onToggle}
        actions={canWrite ? rowActions(block) : []}
        registerRef={(node) => {
          focus.registerRow(block.id)(node);
          props.setNodeRef(node);
        }}
        style={props.style}
        handleProps={props.handleProps}
      />
    );
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2">
      {canWrite && (
        <div className="flex justify-end">
          <ReorderUndoButton
            canUndo={reorder.canUndo}
            onUndo={reorder.undo}
            label={dict.reorderList.undo}
            iconOnly
          />
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <Table
          role="grid"
          aria-label={d.gridLabel}
          aria-describedby={HOME_BLOCK_INSTRUCTIONS_LONG_ID}
          aria-busy={reorder.isPending}
          className="max-md:block"
        >
          {/* The mockup draws no header strip; the names are for assistive tech. */}
          <TableHeader className="sr-only">
            <TableRow aria-rowindex={1}>
              <TableHead>{d.colBlock}</TableHead>
              <TableHead>{d.colSchedule}</TableHead>
              <TableHead>{d.colShown}</TableHead>
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
    </section>
  );
}

interface HomeBlockRowProps {
  block: HomeBlockEntity;
  blocks: HomeBlockEntity[];
  row: SortableListRow;
  /** How many rows there are — the last one has no «Нижче». */
  count: number;
  canWrite: boolean;
  busy: boolean;
  reorder: ReorderLifecycleApi;
  onToggle: (block: HomeBlockEntity, shown: boolean) => void;
  actions: RowActionItem[];
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function HomeBlockRow({
  block,
  blocks,
  row,
  count,
  canWrite,
  busy,
  reorder,
  onToggle,
  actions,
  registerRef,
  style,
  handleProps,
}: HomeBlockRowProps) {
  const tabIndex = row.controlTabIndex;
  const name = homeBlockLabel(block);
  const Icon = BLOCK_ICONS[block.type];
  const problem = blockProblem(block);
  const schedule = blockSchedule(block);
  const duplicate = blockDuplicateNote(block, blocks);
  const tabs = block.type === "TABS" ? blockTabs(block) : [];
  const hidden = block.status !== "PUBLISHED";
  const shownLabel = blockShownLabel(block);

  /** «Вище» / «Нижче» (ДН-4.10) — the same lifecycle, so the same toast and undo. */
  const step = (intent: "up" | "down") => {
    const outcome = applyIntent(reorder.items, block.id, intent);
    if (outcome.kind === "refused") return;
    reorder.move(outcome.items, block.id);
  };
  const cannotStep = reorder.isPending || row.grabbed;

  const scheduleBadge = schedule ? (
    <Badge
      variant="outline"
      className="gap-1 border-warning/40 text-foreground"
    >
      <CalendarClockIcon aria-hidden="true" className="text-warning" />
      {schedule.badge}
    </Badge>
  ) : null;

  return (
    <TableRow
      ref={registerRef}
      {...row.rowProps}
      aria-describedby={HOME_BLOCK_INSTRUCTIONS_SHORT_ID}
      style={style}
      data-home-problem={problem ? true : undefined}
      data-home-hidden={hidden || undefined}
      className={cn(
        // Below md the row is a card (ДН-4.10): icon · text · «⋯», and the switch
        // with «Вище»/«Нижче» on a line of its own under the text.
        "max-md:flex max-md:flex-wrap max-md:items-start max-md:gap-x-2.5 max-md:gap-y-2 max-md:p-3",
        row.grabbed
          ? "outline outline-2 outline-ring"
          : row.conflict
            ? "bg-accent"
            : problem
              ? "bg-warning/8 hover:bg-warning/12"
              : hidden
                ? "bg-muted/45"
                : undefined,
      )}
    >
      <TableCell
        role="gridcell"
        className="min-w-0 py-3 whitespace-normal max-md:flex-1 max-md:p-0 md:w-full md:max-w-0"
      >
        <div className="flex min-w-0 items-start gap-3 md:items-center">
          {canWrite ? (
            <button
              type="button"
              {...handleProps}
              tabIndex={tabIndex}
              aria-label={dict.reorderList.handleLabel(name)}
              className="inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:hidden"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <span className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground max-md:hidden">
              <LockIcon aria-hidden="true" className="size-3.5" />
            </span>
          )}
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-md",
              block.isSystem
                ? "bg-muted text-muted-foreground"
                : "bg-primary/12 text-primary",
            )}
          >
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              className={cn(
                "font-semibold",
                hidden ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {name}{" "}
              <span className="font-normal text-muted-foreground">
                · {blockKind(block)}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {blockSummary(block)}
            </span>
            {tabs.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1">
                {tabs.map((tab, index) => (
                  <li
                    key={`${index}:${tab}`}
                    className="rounded-full bg-muted px-2 py-px text-xs text-foreground"
                  >
                    {tab}
                  </li>
                ))}
              </ul>
            )}
            {problem && (
              <span className="mt-0.5 inline-flex items-start gap-1 text-xs font-medium text-foreground">
                <TriangleAlertIcon
                  aria-hidden="true"
                  className="mt-px size-3.5 shrink-0 text-warning"
                />
                {problem}
              </span>
            )}
            {schedule && (
              <span className="mt-0.5 text-xs text-muted-foreground">
                {schedule.note}
              </span>
            )}
            {duplicate && (
              <span className="mt-0.5 text-xs text-muted-foreground">
                {duplicate}
              </span>
            )}
            {scheduleBadge && (
              <div className="mt-1 md:hidden">{scheduleBadge}</div>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell
        role="gridcell"
        className="py-3 whitespace-nowrap max-md:hidden"
      >
        {scheduleBadge}
      </TableCell>

      <TableCell
        role="gridcell"
        className="py-3 max-md:order-last max-md:basis-full max-md:p-0 max-md:pl-12 md:w-36"
      >
        <div className="flex items-center gap-2 md:justify-end">
          {canWrite ? (
            <>
              <span className="text-sm whitespace-nowrap text-muted-foreground max-md:order-2">
                {shownLabel}
              </span>
              <Switch
                checked={block.status === "PUBLISHED"}
                onCheckedChange={(checked) => onToggle(block, checked)}
                disabled={busy}
                tabIndex={tabIndex}
                aria-label={d.toggleAria(name)}
                // A 44 px hit area on a phone around the 20 px track.
                className="relative after:absolute after:-inset-3 max-md:order-1"
              />
              <span className="flex-1 md:hidden" />
              <div className="flex gap-1 md:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  tabIndex={tabIndex}
                  aria-label={d.moveUp(name)}
                  disabled={cannotStep || row.index === 0}
                  onClick={() => step("up")}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  tabIndex={tabIndex}
                  aria-label={d.moveDown(name)}
                  disabled={cannotStep || row.index === count - 1}
                  onClick={() => step("down")}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
              </div>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
              <StatusDot
                tone={block.status === "PUBLISHED" ? "success" : "warning"}
                label=""
              />
              {shownLabel}
            </span>
          )}
        </div>
      </TableCell>

      <TableCell
        role="gridcell"
        className="w-12 py-3 text-right max-md:w-auto max-md:p-0"
      >
        <RowActionsMenu
          label={d.rowActionsAria(name)}
          items={actions}
          tabIndex={tabIndex}
          className="max-md:size-11"
        />
      </TableCell>
    </TableRow>
  );
}

/** Schema block heights — roughly how much of the page each section takes. */
const SCHEMA_HEIGHT: Record<HomeBlockType, string> = {
  HERO: "h-14",
  TRUST: "h-5",
  CATEGORY_NAV: "h-7",
  TABS: "h-11",
  CAROUSEL: "h-8",
  PROMO_BANNER: "h-6",
  RECENTLY_VIEWED: "h-7",
  NEWSLETTER: "h-5",
};

/**
 * «Так стоїть на сайті» (ДН-4.1) — the page as boxes, numbered like the list.
 * Decorative: it repeats the list for the eye, so it is hidden from assistive tech.
 */
function HomeSchema({ blocks }: { blocks: HomeBlockEntity[] }) {
  const box =
    "flex items-center justify-center rounded-md border border-border px-1 text-center text-xs text-muted-foreground";
  return (
    <aside
      aria-hidden="true"
      className="hidden w-65 shrink-0 flex-col gap-1.5 rounded-lg border border-border bg-muted/35 p-3 lg:sticky lg:top-4 lg:flex"
    >
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {d.schemaTitle}
      </span>
      <div className={cn(box, "h-5 bg-muted")}>{d.schemaHeader}</div>
      {blocks.map((block, index) => {
        const off = block.status === "DRAFT" || blockProblem(block) !== null;
        return (
          <div
            key={block.id}
            className={cn(
              box,
              "relative bg-background",
              SCHEMA_HEIGHT[block.type],
              block.status === "SCHEDULED" && "border-dashed",
              off && "line-through opacity-45",
            )}
          >
            <span className="absolute top-0.5 left-1 text-xs text-muted-foreground">
              {index + 1}
            </span>
            <span className="truncate px-4">{homeBlockLabel(block)}</span>
          </div>
        );
      })}
      <div className={cn(box, "h-5 bg-muted")}>{d.schemaFooter}</div>
      <span className="text-xs text-muted-foreground">{d.schemaHint}</span>
    </aside>
  );
}
