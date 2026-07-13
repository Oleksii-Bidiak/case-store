"use client";

/**
 * The keyboard / focus / ARIA half of a FLAT sortable admin list (TASK-295) — the
 * flat twin of what `widgets/category-tree` hand-rolls for the treegrid, shared by
 * the banner, blog-category and device-brand grids so the three cannot drift.
 *
 * ARIA: `role="grid"` — NOT `treegrid` with `maxDepth: 1`. A treegrid announces
 * "level 1" and promises an expansion that does not exist. Rows carry
 * `aria-rowindex` (1-based, counting the header row), a roving `tabindex`,
 * `data-grabbed` while a row is picked up; the grid is `aria-busy` while the PATCH
 * is in flight.
 *
 * Keyboard is the category tree's, MINUS everything a flat list has no meaning
 * for: no `←`/`→` (there is no depth), no `Alt+Shift+arrow` accelerators, no
 * "Перемістити до…" dialog. `↑`/`↓` navigate, `Space` picks up / drops, `↑`/`↓`
 * while grabbed move the row, `Home`/`End` jump, `Esc` cancels, `Tab` is swallowed
 * mid-move, and blur auto-cancels (never a silent commit).
 *
 * It runs over the SAME pure reducer as the pointer path
 * (`shared/lib/sortable-tree`), so drag and keyboard cannot produce different
 * orders.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  applyIntent,
  applyMove,
  type MoveIntent,
  type MoveRefusal,
  type TreeItem,
} from "@/shared/lib/sortable-tree";
import type { SortableTreeAnnouncements } from "@/shared/ui/sortable-tree";
import { useAnnouncer } from "@/shared/ui/live-announcer";
import { dict } from "@/shared/config";
import type { ReorderLifecycleApi } from "./use-reorder-lifecycle";
import type { RowFocusApi } from "./use-row-focus";

const a = dict.reorderList.announce;

/** 1-based position of `id` in a flat list. */
function positionOf(items: TreeItem[], id: string) {
  const at = items.findIndex((i) => i.id === id);
  if (at === -1) return null;
  return { name: items[at].label, pos: at + 1, size: items.length };
}

/** Each typed refusal maps onto exactly one string — never a silent no-op. */
function refusalAnnouncement(reason: MoveRefusal): string {
  switch (reason) {
    case "at-top":
      return a.atTop;
    case "at-bottom":
      return a.atBottom;
    // The depth-related refusals are unreachable in a flat list, but the region
    // must never go silent on a refusal.
    default:
      return a.cannotMove;
  }
}

/** Pointer-drag announcements, resolved from the REAL list — never placeholders. */
export function flatPointerAnnouncements(
  items: TreeItem[],
): Partial<SortableTreeAnnouncements> {
  return {
    grabbed: (item) => {
      const at = positionOf(items, item.id);
      return at ? a.grabbed(at.name, at.pos, at.size) : "";
    },
    droppedNoop: (item) => {
      const at = positionOf(items, item.id);
      return at ? a.committedNoop(at.name, at.pos, at.size) : "";
    },
    cancelled: (item) => {
      const at = positionOf(items, item.id);
      return at ? a.cancelled(at.name, at.pos, at.size) : "";
    },
    // `dropped` is deliberately NOT wired: a successful drop goes straight into
    // the mutation lifecycle, which announces «Зберігаю зміни…» and then the
    // committed position. Wiring it would double-speak the same drop.
  };
}

interface MoveState {
  movingId: string;
  /** The full list with the in-progress preview applied. */
  preview: TreeItem[];
  /** The full list as it was when the row was picked up. */
  original: TreeItem[];
}

export interface SortableListRow {
  item: TreeItem;
  /** 0-based index among the RENDERED rows. */
  index: number;
  grabbed: boolean;
  conflict: boolean;
  /** This row owns the roving `tabindex`. */
  isOwner: boolean;
  /** `tabIndex` for the row's OWN controls (grip, buttons) — roving too. */
  controlTabIndex: 0 | -1;
  /**
   * Spread on the `<TableRow>`. The `ref` is NOT here on purpose: the row must
   * also take dnd-kit's `setNodeRef`, so the widget composes the two itself
   * (`focus.registerRow(id)` + `props.setNodeRef`).
   */
  rowProps: {
    id: string;
    role: "row";
    "aria-rowindex": number;
    tabIndex: 0 | -1;
    "data-grabbed": boolean;
    "data-conflict": true | undefined;
    onKeyDown: (event: ReactKeyboardEvent<HTMLTableRowElement>) => void;
    onBlur: (event: ReactFocusEvent<HTMLTableRowElement>) => void;
    onFocus: () => void;
  };
}

export interface UseSortableListGridOptions {
  /** The lifecycle this grid commits through. */
  reorder: ReorderLifecycleApi;
  /** The focus map shared with the lifecycle (`useRowFocus()`). */
  focus: RowFocusApi;
  /** Prefix for the row DOM ids — must be unique per grid on the page. */
  rowIdPrefix: string;
  /** Reordering is off: a search/filter hides rows, so the visible order is not the real one. */
  locked?: boolean;
  /** Rows to RENDER. Defaults to all of them. Hidden rows still belong to the payload. */
  visibleIds?: ReadonlySet<string>;
}

export interface SortableListGridApi {
  rows: SortableListRow[];
  /** Items for `<SortableTree maxDepth={1}>` — dragging disabled where it must be. */
  sortableItems: TreeItem[];
  /** Dragging is off entirely (locked, saving, or a keyboard move is held). */
  dragDisabled: boolean;
  pointerAnnouncements: Partial<SortableTreeAnnouncements>;
  /** `<SortableTree onMove>`. */
  onPointerMove: (
    groups: unknown,
    nextVisible: TreeItem[],
    movingId: string,
  ) => void;
}

export function useSortableListGrid({
  reorder,
  focus,
  rowIdPrefix,
  locked = false,
  visibleIds,
}: UseSortableListGridOptions): SortableListGridApi {
  const { announcePolite } = useAnnouncer();
  const { focusedId, setFocusedId, focusRow, requestFocus, getRow } = focus;

  const [moveState, setMoveState] = useState<MoveState | null>(null);

  /* ── a held grab whose base list vanished ───────────────────────────────── */

  const [staleMoveNotice, setStaleMoveNotice] = useState(0);

  /**
   * Render-time sync guard (docs/conventions/forms.md Rule 1a): the SERVER list
   * was replaced under a held grab (another admin's write, or a sibling mutation
   * invalidating the query). The preview was built on a list that no longer
   * exists, so committing it would diff a stale bucket against a fresh one and
   * silently PATCH the wrong order. Drop the grab instead, and say so.
   */
  if (moveState && moveState.original !== reorder.items) {
    setMoveState(null);
    setStaleMoveNotice((n) => n + 1);
  }

  useEffect(() => {
    if (staleMoveNotice > 0) announcePolite(a.listChangedDuringMove);
  }, [announcePolite, staleMoveNotice]);

  /* ── the rendered model ─────────────────────────────────────────────────── */

  const items = moveState?.preview ?? reorder.items;

  const visible = useMemo(
    () => (visibleIds ? items.filter((i) => visibleIds.has(i.id)) : items),
    [items, visibleIds],
  );

  // The visible order is not the real order while a filter is active, so every
  // move affordance is off and the lock is announced.
  useEffect(() => {
    if (locked) announcePolite(a.searchLocked);
  }, [announcePolite, locked]);

  /**
   * Roving-tabindex ownership: tracked by ROW ID, never by index. If the owner is
   * no longer rendered (filtered out, deleted), it falls to the first visible row.
   */
  const ownerId = useMemo(() => {
    if (visible.length === 0) return null;
    if (focusedId && visible.some((i) => i.id === focusedId)) return focusedId;
    return visible[0].id;
  }, [focusedId, visible]);

  /** Never let focus fall to `document.body` when the focused row unmounts. */
  useLayoutEffect(() => {
    if (!focusedId || !ownerId) return;
    if (visible.some((i) => i.id === focusedId)) return;
    // Focus the operator moved somewhere else on purpose is left alone.
    if (document.activeElement && document.activeElement !== document.body) {
      return;
    }
    getRow(ownerId)?.focus();
  }, [focusedId, getRow, ownerId, visible]);

  /* ── moves ──────────────────────────────────────────────────────────────── */

  const pickUp = useCallback(
    (movingId: string) => {
      if (locked) {
        announcePolite(a.searchLocked);
        return;
      }
      if (reorder.isPending) {
        announcePolite(a.busyRefused);
        return;
      }
      const base = reorder.items;
      setMoveState({ movingId, preview: base, original: base });
      const at = positionOf(base, movingId);
      if (at) announcePolite(a.grabbed(at.name, at.pos, at.size));
    },
    [announcePolite, locked, reorder.isPending, reorder.items],
  );

  const stepMove = useCallback(
    (state: MoveState, intent: MoveIntent, repeat: boolean) => {
      const outcome = applyIntent(state.preview, state.movingId, intent);
      if (outcome.kind === "refused") {
        announcePolite(refusalAnnouncement(outcome.reason), { repeat });
        return;
      }
      setMoveState({ ...state, preview: outcome.items });
      requestFocus(state.movingId);

      const at = positionOf(outcome.items, state.movingId);
      if (at) announcePolite(a.moved(at.name, at.pos, at.size), { repeat });
    },
    [announcePolite, requestFocus],
  );

  const cancelMove = useCallback(
    (state: MoveState, announce: boolean) => {
      setMoveState(null);
      requestFocus(state.movingId);
      if (!announce) return;
      const at = positionOf(state.original, state.movingId);
      if (at) announcePolite(a.cancelled(at.name, at.pos, at.size));
    },
    [announcePolite, requestFocus],
  );

  const commitMoveMode = useCallback(
    (state: MoveState) => {
      setMoveState(null);
      requestFocus(state.movingId);
      if (state.preview === state.original) {
        const at = positionOf(state.original, state.movingId);
        if (at) announcePolite(a.committedNoop(at.name, at.pos, at.size));
        return;
      }
      reorder.move(state.preview, state.movingId);
    },
    [announcePolite, reorder, requestFocus],
  );

  /** Pointer drop → the SAME reducer the keyboard uses. */
  const onPointerMove = useCallback(
    (_groups: unknown, nextVisible: TreeItem[], movingId: string) => {
      const targetIndex = nextVisible.findIndex((i) => i.id === movingId);
      if (targetIndex === -1) return;
      const next = applyMove(reorder.items, movingId, {
        targetParentId: null,
        targetIndex,
      });
      if (!next) return;
      // A mouse drop does NOT move focus.
      reorder.move(next, movingId);
    },
    [reorder],
  );

  /* ── keyboard ───────────────────────────────────────────────────────────── */

  const focusStep = useCallback(
    (from: string, delta: 1 | -1) => {
      const index = visible.findIndex((i) => i.id === from);
      if (index === -1) return;
      const target = visible[index + delta];
      if (target) focusRow(target.id);
    },
    [focusRow, visible],
  );

  const onRowKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTableRowElement>, id: string) => {
      // Keys pressed inside the row's own controls (grip, links, buttons) bubble
      // up to the row — they are not row navigation.
      if (event.target !== event.currentTarget) return;

      const state = moveState?.movingId === id ? moveState : null;
      const { key, altKey, ctrlKey, metaKey } = event;
      // Never hijack a user-agent shortcut (Alt+← is Back on Windows).
      if (altKey || ctrlKey || metaKey) return;

      /* ── move mode ────────────────────────────────────────────────────── */
      if (state) {
        const intents: Record<string, MoveIntent> = {
          ArrowUp: "up",
          ArrowDown: "down",
          Home: "first",
          End: "last",
        };
        const intent = intents[key];
        if (intent) {
          event.preventDefault();
          stepMove(state, intent, event.repeat);
          return;
        }
        if (key === " " || key === "Enter") {
          event.preventDefault();
          commitMoveMode(state);
          return;
        }
        if (key === "Escape") {
          event.preventDefault();
          cancelMove(state, true);
          return;
        }
        if (key === "Tab") {
          // Leaving mid-move would strand an uncommitted preview.
          event.preventDefault();
          announcePolite(a.tabBlocked);
        }
        return;
      }

      /* ── navigation mode ──────────────────────────────────────────────── */
      switch (key) {
        case "ArrowDown":
          event.preventDefault();
          focusStep(id, 1);
          return;
        case "ArrowUp":
          event.preventDefault();
          focusStep(id, -1);
          return;
        case "Home":
          event.preventDefault();
          if (visible[0]) focusRow(visible[0].id);
          return;
        case "End":
          event.preventDefault();
          if (visible.length > 0) focusRow(visible[visible.length - 1].id);
          return;
        case " ":
          event.preventDefault();
          pickUp(id);
          return;
        default:
      }
    },
    [
      announcePolite,
      cancelMove,
      commitMoveMode,
      focusRow,
      focusStep,
      moveState,
      pickUp,
      stepMove,
      visible,
    ],
  );

  const onRowBlur = useCallback(
    (event: ReactFocusEvent<HTMLTableRowElement>, id: string) => {
      if (moveState?.movingId !== id) return;
      // Focus moving INTO the row's own controls is not "leaving" the move.
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) return;
      // Blur AUTO-CANCELS — never a silent commit.
      cancelMove(moveState, false);
    },
    [cancelMove, moveState],
  );

  /* ── the row model ──────────────────────────────────────────────────────── */

  const dragDisabled = locked || reorder.isPending || moveState !== null;

  const rows = useMemo<SortableListRow[]>(
    () =>
      visible.map((item, index) => {
        const isOwner = ownerId === item.id;
        const grabbed = moveState?.movingId === item.id;
        const conflict = reorder.conflictIds.has(item.id);
        return {
          item,
          index,
          grabbed,
          conflict,
          isOwner,
          controlTabIndex: isOwner ? 0 : -1,
          rowProps: {
            id: `${rowIdPrefix}${item.id}`,
            role: "row",
            // +2: the header is row 1 of the grid, so data rows start at 2.
            "aria-rowindex": index + 2,
            tabIndex: isOwner ? 0 : -1,
            "data-grabbed": grabbed,
            "data-conflict": conflict || undefined,
            onKeyDown: (event: ReactKeyboardEvent<HTMLTableRowElement>) =>
              onRowKeyDown(event, item.id),
            onBlur: (event: ReactFocusEvent<HTMLTableRowElement>) =>
              onRowBlur(event, item.id),
            onFocus: () => setFocusedId(item.id),
          },
        } satisfies SortableListRow;
      }),
    [
      moveState,
      onRowBlur,
      onRowKeyDown,
      ownerId,
      reorder.conflictIds,
      rowIdPrefix,
      setFocusedId,
      visible,
    ],
  );

  const sortableItems = useMemo(
    () => visible.map((item) => ({ ...item, disabled: dragDisabled })),
    [dragDisabled, visible],
  );

  return {
    rows,
    sortableItems,
    dragDisabled,
    pointerAnnouncements: flatPointerAnnouncements(items),
    onPointerMove,
  };
}
