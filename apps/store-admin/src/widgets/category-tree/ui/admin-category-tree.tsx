"use client";

/**
 * The admin category treegrid (plan 158 §7, TASK-291-J).
 *
 * ARIA model (§7.1): `role="treegrid"` over FLAT DOM rows — hierarchy is carried
 * entirely by authored `aria-level` / `aria-posinset` / `aria-setsize`, with
 * `aria-expanded` on PARENT rows only. Roving `tabindex` (never
 * `aria-activedescendant`), `data-grabbed` while a row is picked up, `aria-busy`
 * on the grid while a PATCH is in flight. `aria-grabbed` / `aria-dropeffect` are
 * never used, and there is no `aria-roledescription` on the row.
 *
 * Keyboard (§7.2) is HAND-ROLLED on `onKeyDown` over the pure `applyMove` /
 * `applyIntent` reducer — NOT a dnd-kit `KeyboardSensor` (§3.2: dnd-kit is
 * pointer-only and its sensors need real layout, which jsdom does not have).
 * Pointer drag goes through `projectionToInsertionPoint` into the SAME reducer,
 * inside `shared/ui/sortable-tree`.
 *
 * `Alt+Shift+arrow` are the mode-free accelerators. Bare `Alt+←`/`Alt+→` are the
 * browser's Back/Forward on Windows and are deliberately NOT bound.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, GripVertical } from "lucide-react";
import { flattenAdminCategoryTree } from "@/entities/category";
import {
  CategoryReorderUndoButton,
  useAdminCategoryTreeQuery,
  useCategoryTreeReorder,
  type CategoryTreeReorderApi,
} from "@/features/category-tree-reorder";
import { CategoryTreeRowActions } from "@/features/category-tree-row-actions";
import { CategoryMoveToDialog } from "@/features/category-move-to-dialog";
import { useCategoryStatusToggle } from "@/features/category-status-toggle";
import {
  CategoryBulkActionsBar,
  useCategoryBulkStatus,
} from "@/features/category-bulk-status";
import {
  MAX_TREE_LEVELS,
  applyIntent,
  applyMove,
  descendantsOf,
  groupChildren,
  levelOf,
  type MoveIntent,
  type MoveRefusal,
  type TreeItem,
} from "@/shared/lib/sortable-tree";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  LiveAnnouncer,
  SortableTree,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useAnnouncer,
  type SortableTreeAnnouncements,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminCategoryTreeSkeleton } from "./admin-category-tree-skeleton";

const t = dict.categories.tree;
const b = dict.categories.tree.bulk;
const a = dict.reorderTree.announce;

export const EXPANDED_STORAGE_KEY = "admin:category-tree:expanded";
export const INSTRUCTIONS_LONG_ID = "cat-tree-instructions-long";
export const INSTRUCTIONS_SHORT_ID = "cat-tree-instructions-short";

/** Indent step for the name cell, in px (mirrors the pointer projection step). */
const INDENT_PX = 24;

/* ────────────────────────────── pure helpers ────────────────────────────── */

interface Position {
  name: string;
  pos: number;
  size: number;
  level: number;
  /** `null` at the root. */
  parent: string | null;
}

/** Position of `id` among its siblings in `items` (array order IS sibling order). */
function positionOf(items: TreeItem[], id: string): Position | null {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const siblings = items.filter((i) => i.parentId === item.parentId);
  return {
    name: item.label,
    pos: siblings.findIndex((i) => i.id === id) + 1,
    size: siblings.length,
    level: levelOf(items).get(id) ?? 1,
    parent:
      item.parentId === null
        ? null
        : (items.find((i) => i.id === item.parentId)?.label ?? null),
  };
}

/** The announcement for a successful move-mode step. */
function movedAnnouncement(intent: MoveIntent, at: Position): string {
  if (intent === "indent") {
    return a.indented(at.name, at.parent ?? "", at.pos, at.size, at.level);
  }
  if (intent === "outdent") {
    return at.parent === null
      ? a.outdentedRoot(at.name, at.pos, at.size)
      : a.outdented(at.name, at.parent, at.pos, at.size, at.level);
  }
  return at.parent === null
    ? a.movedRoot(at.name, at.pos, at.size)
    : a.moved(at.name, at.pos, at.size, at.parent);
}

/** Each typed refusal maps onto exactly one §7.3 string — never a silent no-op. */
function refusalAnnouncement(reason: MoveRefusal): string {
  switch (reason) {
    case "at-top":
      return a.atTop;
    case "at-bottom":
      return a.atBottom;
    case "no-previous-sibling":
      return a.cannotIndentNoSibling;
    case "at-root":
      return a.cannotOutdentRoot;
    case "max-depth":
    case "illegal-target":
    case "not-found":
      return a.cannotIndentMaxDepth;
  }
}

/** Insertion point of `id` inside `items` — the pointer path's bridge back to `applyMove`. */
function insertionPointOf(items: TreeItem[], id: string) {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const siblings = items.filter((i) => i.parentId === item.parentId);
  return {
    targetParentId: item.parentId,
    targetIndex: siblings.findIndex((i) => i.id === id),
  };
}

/**
 * Pointer-drag announcements (§7.3), resolved from the REAL tree — a pointer
 * drop must never announce a fabricated position.
 *
 * `dropped` is deliberately NOT wired: a successful drop goes straight into the
 * mutation lifecycle, which already announces «Зберігаю зміни…» and then the
 * committed position. Wiring it here would double-speak the same drop.
 */
export function pointerAnnouncements(
  items: TreeItem[],
): Partial<SortableTreeAnnouncements> {
  return {
    grabbed: (item) => {
      const at = positionOf(items, item.id);
      if (!at) return "";
      return at.parent === null
        ? a.grabbedRoot(at.name, at.pos, at.size)
        : a.grabbed(at.name, at.pos, at.size, at.level, at.parent);
    },
    droppedNoop: (item) => {
      const at = positionOf(items, item.id);
      if (!at) return "";
      return a.committedNoop(
        at.name,
        at.pos,
        at.size,
        at.parent ?? dict.categories.root,
      );
    },
    cancelled: (item) => {
      const at = positionOf(items, item.id);
      if (!at) return "";
      return a.cancelled(
        at.name,
        at.pos,
        at.size,
        at.parent ?? dict.categories.root,
      );
    },
  };
}

function readStoredExpanded(): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return null;
  }
}

/* ─────────────────────────────── the widget ─────────────────────────────── */

/**
 * `LiveAnnouncer` MUST wrap the tree, not sit inside it: the reorder lifecycle
 * hook and the treegrid both call `useAnnouncer()`, and a hook called in the
 * same component that renders the provider would read the default no-op context.
 */
export function AdminCategoryTree() {
  return (
    <LiveAnnouncer>
      <CategoryTreeView />
    </LiveAnnouncer>
  );
}

interface MoveState {
  movingId: string;
  /** The FULL tree with the in-progress preview applied. */
  preview: TreeItem[];
  /** The FULL tree as it was when the row was picked up. */
  original: TreeItem[];
  /** Nodes this move auto-expanded — collapsed again on cancel (§7.5). */
  autoExpanded: string[];
}

function CategoryTreeView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { announcePolite } = useAnnouncer();

  const search = (searchParams.get("search") ?? "").trim();
  const [searchInput, setSearchInput] = useState(search);

  const query = useAdminCategoryTreeQuery();
  const serverItems = useMemo(
    () => flattenAdminCategoryTree(query.data?.data),
    [query.data],
  );

  const rowRefs = useRef(new Map<string, HTMLTableRowElement | null>());
  const wantFocusRef = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [moveState, setMoveState] = useState<MoveState | null>(null);
  const [moveToId, setMoveToId] = useState<string | null>(null);

  const focusRow = useCallback((id: string) => {
    setFocusedId(id);
    wantFocusRef.current = id;
    // Focus imperatively too: on the mutation paths (commit / rollback / 409)
    // the row is already mounted and no re-render is guaranteed to follow.
    rowRefs.current.get(id)?.focus();
  }, []);

  const reorder = useCategoryTreeReorder({
    items: serverItems,
    onFocusRow: focusRow,
  });

  /* ── multi-select (TASK-293) ────────────────────────────────────────────── */

  // Raw selection. It is filtered against the CURRENT tree below, so a row that
  // another admin deleted (or that a refetch dropped) can never be PATCHed.
  const [rawSelectedIds, setRawSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  // The `Shift+↑/↓` range anchor — the row the range grows FROM, not the last
  // row it reached.
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const clearSelection = useCallback(() => {
    setRawSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  const bulk = useCategoryBulkStatus({ onSuccess: clearSelection });

  // Focus follows the NODE, never the position (§7.5) — re-focus after any
  // render that moved the row (preview step, commit, refetch).
  useLayoutEffect(() => {
    const want = wantFocusRef.current;
    if (!want) return;
    wantFocusRef.current = null;
    rowRefs.current.get(want)?.focus();
  });

  /* ── expanded state (localStorage, §3.11) ───────────────────────────────── */

  const [expanded, setExpanded] = useState<Set<string> | null>(() =>
    readStoredExpanded(),
  );
  const [seeded, setSeeded] = useState(false);

  // Render-time sync guard (docs/conventions/forms.md Rule 1a): the DEFAULT
  // expanded set (roots expanded, level 2 collapsed) can only be derived once
  // the async tree has landed — but it must never clobber a stored preference,
  // and it must be seeded exactly once.
  if (!seeded && expanded === null && serverItems.length > 0) {
    setSeeded(true);
    setExpanded(
      new Set(serverItems.filter((i) => i.parentId === null).map((i) => i.id)),
    );
  }

  const expandedIds = useMemo(() => expanded ?? new Set<string>(), [expanded]);

  useEffect(() => {
    if (expanded === null || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        EXPANDED_STORAGE_KEY,
        JSON.stringify([...expanded]),
      );
    } catch {
      /* private mode / quota — persistence is a convenience, not a contract */
    }
  }, [expanded]);

  /* ── a held grab whose base tree vanished ───────────────────────────────── */

  const [staleMoveNotice, setStaleMoveNotice] = useState(0);

  /**
   * Render-time sync guard (docs/conventions/forms.md Rule 1a): the SERVER tree
   * was replaced under a held grab — another admin's write arriving on a
   * refetch, or this operator's own status toggle invalidating the query (the
   * reorder lock only spans a PATCH in flight, and a grabbed-but-uncommitted
   * move has no PATCH yet). The preview was built on a tree that no longer
   * exists, so committing it would diff stale sibling buckets against fresh ones
   * and silently PATCH the wrong order. Drop the grab (and anything it
   * auto-expanded) instead, and tell the operator.
   */
  if (moveState && moveState.original !== reorder.items) {
    const stale = moveState;
    setMoveState(null);
    setStaleMoveNotice((n) => n + 1);
    if (stale.autoExpanded.length > 0) {
      setExpanded((current) => {
        const copy = new Set(current ?? []);
        for (const id of stale.autoExpanded) copy.delete(id);
        return copy;
      });
    }
  }

  useEffect(() => {
    if (staleMoveNotice > 0) announcePolite(a.treeChangedDuringMove);
  }, [announcePolite, staleMoveNotice]);

  /* ── the rendered model ─────────────────────────────────────────────────── */

  const items = moveState?.preview ?? reorder.items;
  const metaById = useMemo(
    () => new Map(serverItems.map((i) => [i.id, i])),
    [serverItems],
  );

  /**
   * Rows that are ACTIVE themselves but sit under a deactivated ancestor, mapped
   * to that ancestor's name (TASK-408).
   *
   * A deactivated parent hides its ENTIRE branch from the storefront while every
   * descendant row keeps saying «Активна» — the status column can only speak
   * about its own row. On the demo stand that read as a bug in the storefront.
   *
   * The walk runs over `items` (the optimistic preview during a move) but reads
   * status from `metaById` (server truth), so the badge follows a drag the same
   * way the rest of the grid does. Same `seen`-set discipline as the other
   * ancestor walks here: a cycle must not spin the render.
   */
  const hiddenByAncestor = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const out = new Map<string, string>();
    for (const item of items) {
      if (metaById.get(item.id)?.isActive === false) continue;
      const seen = new Set<string>([item.id]);
      let parentId = item.parentId;
      while (parentId !== null && !seen.has(parentId)) {
        seen.add(parentId);
        const parent = metaById.get(parentId);
        if (parent && !parent.isActive) {
          out.set(item.id, parent.label);
          break;
        }
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
    return out;
  }, [items, metaById]);

  const searchActive = search.length > 0;
  const isLocked = searchActive;

  const model = useMemo(() => {
    const levels = levelOf(items);
    const children = groupChildren(items);
    const byId = new Map(items.map((i) => [i.id, i]));

    const visibleIds = new Set<string>();
    if (searchActive) {
      const needle = search.toLowerCase();
      for (const item of items) {
        if (!item.label.toLowerCase().includes(needle)) continue;
        visibleIds.add(item.id);
        let parentId = item.parentId;
        while (parentId !== null && !visibleIds.has(parentId)) {
          visibleIds.add(parentId);
          parentId = byId.get(parentId)?.parentId ?? null;
        }
      }
    } else {
      for (const item of items) {
        let visible = true;
        let parentId = item.parentId;
        while (parentId !== null) {
          if (!expandedIds.has(parentId)) {
            visible = false;
            break;
          }
          parentId = byId.get(parentId)?.parentId ?? null;
        }
        if (visible) visibleIds.add(item.id);
      }
    }

    const visible = items.filter((i) => visibleIds.has(i.id));
    const bucketSize = new Map<string, number>();
    for (const item of visible) {
      const key = item.parentId ?? "__root__";
      bucketSize.set(key, (bucketSize.get(key) ?? 0) + 1);
    }
    const seenInBucket = new Map<string, number>();

    const matchedIds = searchActive
      ? new Set(
          items
            .filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
            .map((i) => i.id),
        )
      : new Set<string>();

    const rows = visible.map((item) => {
      const key = item.parentId ?? "__root__";
      const at = (seenInBucket.get(key) ?? 0) + 1;
      seenInBucket.set(key, at);

      const kids = children.get(item.id) ?? [];
      const hasVisibleChildren = kids.some((k) => visibleIds.has(k.id));
      const ariaExpanded = searchActive
        ? hasVisibleChildren
          ? true
          : undefined
        : kids.length > 0
          ? expandedIds.has(item.id)
          : undefined;

      return {
        item,
        level: levels.get(item.id) ?? 1,
        posinset: at,
        setsize: bucketSize.get(key) ?? 1,
        hasChildren: kids.length > 0,
        ariaExpanded,
        descendantCount: descendantsOf(items, item.id).size,
        matched: !searchActive || matchedIds.has(item.id),
      };
    });

    return { rows, visibleIds };
  }, [expandedIds, items, search, searchActive]);

  const { rows, visibleIds } = model;

  /* ── selection derived against the live tree (TASK-293) ─────────────────── */

  /**
   * The selection as it can actually be acted on: ids that still exist in the
   * tree. The raw set is kept as-is (a collapsed row stays selected — it is only
   * hidden, not gone), but a row that vanished from the SERVER tree is dropped,
   * so the bulk PATCH can never name an id the server would 404 on.
   */
  const selectedIds = useMemo(
    () => new Set([...rawSelectedIds].filter((id) => metaById.has(id))),
    [metaById, rawSelectedIds],
  );

  const toggleSelected = useCallback(
    (id: string, name: string) => {
      const next = new Set(selectedIds);
      const selecting = !next.has(id);
      if (selecting) next.add(id);
      else next.delete(id);

      setRawSelectedIds(next);
      setAnchorId(id);
      announcePolite(
        selecting
          ? b.announce.selected(name, next.size)
          : b.announce.deselected(name, next.size),
      );
    },
    [announcePolite, selectedIds],
  );

  /**
   * `Shift+↑/↓` — grow (or shrink) a contiguous range of VISIBLE rows from the
   * anchor, and move focus with it. Replaces the selection, as a grid does: the
   * range IS the selection while the operator is sweeping it.
   */
  const extendSelection = useCallback(
    (fromId: string, delta: 1 | -1) => {
      const index = rows.findIndex((r) => r.item.id === fromId);
      if (index === -1) return;
      const targetIndex = index + delta;
      const target = rows[targetIndex];
      if (!target) return;

      const anchor = anchorId ?? fromId;
      const anchorIndex = rows.findIndex((r) => r.item.id === anchor);
      const from = anchorIndex === -1 ? index : anchorIndex;
      const [lo, hi] =
        from <= targetIndex ? [from, targetIndex] : [targetIndex, from];

      const range = rows.slice(lo, hi + 1).map((r) => r.item.id);
      setRawSelectedIds(new Set(range));
      setAnchorId(rows[from].item.id);
      focusRow(target.item.id);
      announcePolite(b.announce.selected(target.item.label, range.length));
    },
    [anchorId, announcePolite, focusRow, rows],
  );

  /** Header checkbox: all VISIBLE rows, tri-state. */
  const visibleSelectedCount = rows.filter((r) =>
    selectedIds.has(r.item.id),
  ).length;
  const headerChecked: boolean | "indeterminate" =
    rows.length > 0 && visibleSelectedCount === rows.length
      ? true
      : visibleSelectedCount > 0
        ? "indeterminate"
        : false;

  const toggleSelectAll = useCallback(() => {
    const visibleRowIds = rows.map((r) => r.item.id);
    const allSelected =
      visibleRowIds.length > 0 &&
      visibleRowIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      const next = new Set(selectedIds);
      for (const id of visibleRowIds) next.delete(id);
      setRawSelectedIds(next);
      announcePolite(b.announce.cleared);
      return;
    }

    const next = new Set(selectedIds);
    for (const id of visibleRowIds) next.add(id);
    setRawSelectedIds(next);
    announcePolite(b.announce.selected(t.label, next.size));
  }, [announcePolite, rows, selectedIds]);

  /** Rows that cannot receive the grabbed node — its own subtree (§7.2). */
  const illegalIds = useMemo(
    () =>
      moveState
        ? descendantsOf(moveState.preview, moveState.movingId)
        : new Set<string>(),
    [moveState],
  );

  /**
   * Roving-tabindex ownership (§7.5): tracked by category ID, never by index.
   * If the owner is no longer visible (collapsed or filtered out), ownership
   * falls to its nearest VISIBLE ancestor, else to the first visible row.
   */
  const ownerId = useMemo(() => {
    if (rows.length === 0) return null;
    if (focusedId && visibleIds.has(focusedId)) return focusedId;
    if (focusedId) {
      const byId = new Map(items.map((i) => [i.id, i]));
      let parentId = byId.get(focusedId)?.parentId ?? null;
      while (parentId !== null) {
        if (visibleIds.has(parentId)) return parentId;
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
    return rows[0].item.id;
  }, [focusedId, items, rows, visibleIds]);

  /**
   * §7.5 — "never let focus fall to `document.body`". `collapseRow` handles the
   * ONE transition it can see coming (it moves focus to the collapsing ancestor
   * BEFORE the descendants unmount). Every OTHER way a focused row can leave the
   * visible set — a search filter landing, a refetched tree that no longer
   * contains the row — unmounts a focused `<tr>` and drops focus on `<body>`.
   * Recover it onto the new roving-tabindex owner.
   */
  useLayoutEffect(() => {
    if (!focusedId || !ownerId || visibleIds.has(focusedId)) return;
    // Focus the operator moved somewhere else on purpose is left alone.
    if (document.activeElement && document.activeElement !== document.body) {
      return;
    }
    // `focusedId` follows on its own: the row's `onFocus` owns that state.
    rowRefs.current.get(ownerId)?.focus();
  }, [focusedId, ownerId, visibleIds]);

  // §3.11 — the visible order is not the real sibling order while a filter is
  // active, so every move affordance is off and the lock is announced.
  useEffect(() => {
    if (searchActive) announcePolite(a.searchLocked);
  }, [announcePolite, searchActive]);

  /* ── expand / collapse ──────────────────────────────────────────────────── */

  const setExpandedFor = useCallback((id: string, next: boolean) => {
    setExpanded((current) => {
      const copy = new Set(current ?? []);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }, []);

  const collapseRow = useCallback(
    (id: string) => {
      // §7.5: never let focus fall to `document.body` — move it to the
      // collapsing ancestor BEFORE its descendants unmount.
      if (focusedId && focusedId !== id) {
        const subtree = descendantsOf(items, id);
        if (subtree.has(focusedId)) focusRow(id);
      }
      setExpandedFor(id, false);
    },
    [focusRow, focusedId, items, setExpandedFor],
  );

  const toggleRow = useCallback(
    (id: string, expandedNow: boolean) => {
      if (expandedNow) collapseRow(id);
      else setExpandedFor(id, true);
    },
    [collapseRow, setExpandedFor],
  );

  /* ── moves ──────────────────────────────────────────────────────────────── */

  /** Every non-drag move funnels through here. */
  const commitMove = useCallback(
    (next: TreeItem[], movingId: string, focusOnSuccess = false) => {
      reorder.move(next, movingId, { focusOnSuccess });
    },
    [reorder],
  );

  /** Mode-free `Alt+Shift+arrow` accelerator: apply + commit in one keystroke. */
  const runAccelerator = useCallback(
    (movingId: string, intent: MoveIntent) => {
      if (isLocked) {
        announcePolite(a.searchLocked);
        return;
      }
      const outcome = applyIntent(reorder.items, movingId, intent);
      if (outcome.kind === "refused") {
        announcePolite(refusalAnnouncement(outcome.reason));
        return;
      }
      const parentId = outcome.point.targetParentId;
      if (parentId !== null && !expandedIds.has(parentId)) {
        setExpandedFor(parentId, true);
      }
      commitMove(outcome.items, movingId);
    },
    [
      announcePolite,
      commitMove,
      expandedIds,
      isLocked,
      reorder.items,
      setExpandedFor,
    ],
  );

  const pickUp = useCallback(
    (movingId: string) => {
      if (isLocked) {
        announcePolite(a.searchLocked);
        return;
      }
      if (reorder.isPending) {
        announcePolite(a.busyRefused);
        return;
      }
      const base = reorder.items;
      setMoveState({
        movingId,
        preview: base,
        original: base,
        autoExpanded: [],
      });
      const at = positionOf(base, movingId);
      if (at) {
        announcePolite(
          at.parent === null
            ? a.grabbedRoot(at.name, at.pos, at.size)
            : a.grabbed(at.name, at.pos, at.size, at.level, at.parent),
        );
      }
    },
    [announcePolite, isLocked, reorder.isPending, reorder.items],
  );

  const stepMove = useCallback(
    (state: MoveState, intent: MoveIntent, repeat: boolean) => {
      const outcome = applyIntent(state.preview, state.movingId, intent);
      if (outcome.kind === "refused") {
        announcePolite(refusalAnnouncement(outcome.reason), { repeat });
        return;
      }

      const autoExpanded = [...state.autoExpanded];
      let prefix = "";
      const parentId = outcome.point.targetParentId;
      if (parentId !== null && !expandedIds.has(parentId)) {
        // Without this the moved row would drop into a collapsed parent and
        // vanish from under the operator's focus.
        setExpandedFor(parentId, true);
        autoExpanded.push(parentId);
        const parentItem = state.preview.find((i) => i.id === parentId);
        const count = groupChildren(outcome.items).get(parentId)?.length ?? 0;
        if (parentItem) prefix = `${a.autoExpanded(parentItem.label, count)} `;
      }

      setMoveState({ ...state, preview: outcome.items, autoExpanded });
      wantFocusRef.current = state.movingId;

      const at = positionOf(outcome.items, state.movingId);
      if (at) {
        announcePolite(`${prefix}${movedAnnouncement(intent, at)}`, { repeat });
      }
    },
    [announcePolite, expandedIds, setExpandedFor],
  );

  const cancelMove = useCallback(
    (state: MoveState, announce: boolean) => {
      setMoveState(null);
      for (const id of state.autoExpanded) setExpandedFor(id, false);
      wantFocusRef.current = state.movingId;
      if (!announce) return;
      const at = positionOf(state.original, state.movingId);
      if (at) {
        announcePolite(
          a.cancelled(
            at.name,
            at.pos,
            at.size,
            at.parent ?? dict.categories.root,
          ),
        );
      }
    },
    [announcePolite, setExpandedFor],
  );

  const commitMoveMode = useCallback(
    (state: MoveState) => {
      setMoveState(null);
      wantFocusRef.current = state.movingId;
      if (state.preview === state.original) {
        const at = positionOf(state.original, state.movingId);
        if (at) {
          announcePolite(
            a.committedNoop(
              at.name,
              at.pos,
              at.size,
              at.parent ?? dict.categories.root,
            ),
          );
        }
        return;
      }
      commitMove(state.preview, state.movingId);
    },
    [announcePolite, commitMove],
  );

  /** Pointer drop → the SAME reducer, but re-derived against the FULL tree. */
  const handlePointerMove = useCallback(
    (_groups: unknown, nextVisible: TreeItem[], movingId: string) => {
      const point = insertionPointOf(nextVisible, movingId);
      if (!point) return;
      const next = applyMove(reorder.items, movingId, point);
      if (!next) return;
      // §7.5: a mouse drop does NOT move focus.
      commitMove(next, movingId);
    },
    [commitMove, reorder.items],
  );

  /* ── keyboard (§7.2) ────────────────────────────────────────────────────── */

  const focusVisible = useCallback(
    (from: string, delta: 1 | -1) => {
      const index = rows.findIndex((r) => r.item.id === from);
      if (index === -1) return;
      for (let i = index + delta; i >= 0 && i < rows.length; i += delta) {
        // Illegal targets are never offered — skipped by arrow navigation (§7.2).
        if (illegalIds.has(rows[i].item.id)) continue;
        focusRow(rows[i].item.id);
        return;
      }
    },
    [focusRow, illegalIds, rows],
  );

  /**
   * Shift+F10 / ContextMenu open the row's "Дії" menu (§7.2).
   *
   * A synthetic `.click()` would NOT open it: Radix's DropdownMenuTrigger opens
   * on `pointerdown` / `Enter` / `Space` / `ArrowDown`, never on a bare click
   * event. Focusing the trigger and replaying `Enter` is both what actually
   * works and what a real keyboard user does — Radix then moves focus to the
   * first menu item for us.
   */
  const openRowMenu = useCallback((id: string) => {
    const trigger = rowRefs.current
      .get(id)
      ?.querySelector<HTMLButtonElement>("[data-row-menu] button");
    if (!trigger) return;
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  }, []);

  const onRowKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTableRowElement>, id: string) => {
      // Keys pressed inside the row's own controls (twisty, toggle, menu, search)
      // bubble up to the row — they are not row navigation.
      if (event.target !== event.currentTarget) return;

      const state = moveState?.movingId === id ? moveState : null;
      const { key, altKey, shiftKey, ctrlKey } = event;

      /* ── move mode ────────────────────────────────────────────────────── */
      if (state) {
        const intents: Record<string, MoveIntent> = {
          ArrowUp: "up",
          ArrowDown: "down",
          ArrowLeft: "outdent",
          ArrowRight: "indent",
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
          // Leaving mid-move would strand an uncommitted preview (§7.2).
          event.preventDefault();
          announcePolite(a.tabBlocked);
          return;
        }
        return;
      }

      /* ── navigation mode ──────────────────────────────────────────────── */

      // Selection (TASK-293) BEFORE anything else that shares a key. Bare `Space`
      // is already "pick the row up" for move mode, so selection takes
      // `Ctrl+Space` — the grid convention — and range-select takes `Shift+↑/↓`,
      // which nothing else binds (`Alt+Shift+arrow` are the move accelerators and
      // are matched below).
      if (ctrlKey && !altKey && key === " ") {
        event.preventDefault();
        const row = rows.find((r) => r.item.id === id);
        if (row) toggleSelected(id, row.item.label);
        return;
      }
      if (
        shiftKey &&
        !altKey &&
        !ctrlKey &&
        (key === "ArrowUp" || key === "ArrowDown")
      ) {
        event.preventDefault();
        extendSelection(id, key === "ArrowDown" ? 1 : -1);
        return;
      }

      // Accelerators FIRST — `Alt+Shift+arrow` only. Bare `Alt+←`/`Alt+→` are the
      // browser's Back/Forward on Windows and MUST stay unbound (§7.2).
      if (altKey && shiftKey) {
        const intents: Record<string, MoveIntent> = {
          ArrowUp: "up",
          ArrowDown: "down",
          ArrowLeft: "outdent",
          ArrowRight: "indent",
        };
        const intent = intents[key];
        if (!intent) return;
        event.preventDefault();
        runAccelerator(id, intent);
        return;
      }
      if (altKey) return; // never hijack a user-agent shortcut

      const row = rows.find((r) => r.item.id === id);

      switch (key) {
        case "ArrowDown":
          event.preventDefault();
          focusVisible(id, 1);
          return;
        case "ArrowUp":
          event.preventDefault();
          focusVisible(id, -1);
          return;
        case "ArrowRight": {
          event.preventDefault();
          if (!row) return;
          if (row.hasChildren && row.ariaExpanded === false) {
            setExpandedFor(id, true);
            return;
          }
          if (row.ariaExpanded === true) {
            const child = rows.find((r) => r.item.parentId === id);
            if (child) focusRow(child.item.id);
          }
          return;
        }
        case "ArrowLeft": {
          event.preventDefault();
          if (!row) return;
          if (row.ariaExpanded === true) {
            collapseRow(id);
            return;
          }
          if (row.item.parentId) focusRow(row.item.parentId);
          return;
        }
        case "Home":
          event.preventDefault();
          if (rows[0]) focusRow(rows[0].item.id);
          return;
        case "End":
          event.preventDefault();
          if (rows.length > 0) focusRow(rows[rows.length - 1].item.id);
          return;
        case "Enter":
          event.preventDefault();
          router.push(`/categories/${id}/edit`);
          return;
        case " ":
          event.preventDefault();
          pickUp(id);
          return;
        case "F10":
          if (!shiftKey) return;
          event.preventDefault();
          openRowMenu(id);
          return;
        case "ContextMenu":
          event.preventDefault();
          openRowMenu(id);
          return;
        default:
      }
    },
    [
      announcePolite,
      cancelMove,
      collapseRow,
      commitMoveMode,
      extendSelection,
      focusRow,
      focusVisible,
      moveState,
      openRowMenu,
      pickUp,
      rows,
      router,
      runAccelerator,
      setExpandedFor,
      stepMove,
      toggleSelected,
    ],
  );

  const onRowBlur = useCallback(
    (event: ReactFocusEvent<HTMLTableRowElement>, id: string) => {
      if (moveState?.movingId !== id) return;
      // Focus moving INTO the row's own controls is not "leaving" the move.
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) return;
      // Blur AUTO-CANCELS — never a silent commit (§7.2).
      cancelMove(moveState, false);
    },
    [cancelMove, moveState],
  );

  /* ── render ─────────────────────────────────────────────────────────────── */

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const value = searchInput.trim();
    if (value) params.set("search", value);
    else params.delete("search");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const renderRow = (props: SortableTreeRowRenderProps): ReactNode => {
    const row = rows.find((r) => r.item.id === props.item.id);
    if (!row) return null;
    const meta = metaById.get(row.item.id);
    return (
      <CategoryTreeRow
        key={row.item.id}
        id={row.item.id}
        name={row.item.label}
        slug={meta?.slug ?? ""}
        productCount={meta?.productCount ?? 0}
        subtreeProductCount={
          meta?.subtreeProductCount ?? meta?.productCount ?? 0
        }
        hiddenByParent={hiddenByAncestor.get(row.item.id)}
        isActive={meta?.isActive ?? true}
        level={row.level}
        posinset={row.posinset}
        setsize={row.setsize}
        ariaExpanded={row.ariaExpanded}
        descendantCount={row.descendantCount}
        matched={row.matched}
        search={search}
        grabbed={moveState?.movingId === row.item.id}
        illegal={illegalIds.has(row.item.id)}
        conflict={reorder.conflictIds.has(row.item.id)}
        isOwner={ownerId === row.item.id}
        locked={isLocked}
        items={items}
        reorder={reorder}
        selected={selectedIds.has(row.item.id)}
        selectDisabled={bulk.isPending}
        onToggleSelect={() => toggleSelected(row.item.id, row.item.label)}
        onToggleExpand={() => toggleRow(row.item.id, row.ariaExpanded === true)}
        onKeyDown={(event) => onRowKeyDown(event, row.item.id)}
        onBlur={(event) => onRowBlur(event, row.item.id)}
        onFocusRow={() => setFocusedId(row.item.id)}
        onMoveTo={setMoveToId}
        registerRef={(node) => {
          rowRefs.current.set(row.item.id, node);
          props.setNodeRef(node);
        }}
        style={props.style}
        handleProps={props.handleProps}
      />
    );
  };

  const isEmpty = !query.isLoading && !query.isError && rows.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={handleSearchSubmit}
          className="flex gap-2"
          role="search"
        >
          <Input
            type="search"
            placeholder={dict.categories.searchPlaceholder}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="max-w-xs"
            aria-label={dict.categories.searchAria}
          />
          <Button type="submit" variant="outline">
            {dict.common.search}
          </Button>
        </form>
        <CategoryReorderUndoButton
          canUndo={reorder.canUndo}
          onUndo={reorder.undo}
        />
      </div>

      {isLocked && (
        <p className="text-sm text-muted-foreground">{t.searchLockedHint}</p>
      )}

      <CategoryBulkActionsBar
        selectedCount={selectedIds.size}
        isPending={bulk.isPending}
        onActivate={() => bulk.setStatus([...selectedIds], true)}
        onDeactivate={() => bulk.setStatus([...selectedIds], false)}
        onClear={() => {
          clearSelection();
          announcePolite(b.announce.cleared);
        }}
      />

      <div id={INSTRUCTIONS_LONG_ID} className="sr-only">
        {dict.reorderTree.instructionsLong}
      </div>
      <div id={INSTRUCTIONS_SHORT_ID} className="sr-only">
        {dict.reorderTree.instructionsShort}
      </div>

      {query.isLoading ? (
        <AdminCategoryTreeSkeleton />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.categories.loadError}
        </p>
      ) : isEmpty ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {search ? dict.categories.emptyMatch(search) : dict.categories.empty}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table
            role="treegrid"
            aria-label={t.label}
            aria-describedby={INSTRUCTIONS_LONG_ID}
            aria-busy={reorder.isPending || bulk.isPending}
            aria-multiselectable="true"
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={headerChecked}
                    onCheckedChange={toggleSelectAll}
                    disabled={bulk.isPending}
                    aria-label={b.selectAll}
                  />
                  <span className="sr-only">{b.colSelect}</span>
                </TableHead>
                <TableHead>{dict.categories.colName}</TableHead>
                <TableHead hideOnMobile>{dict.categories.colSlug}</TableHead>
                <TableHead title={dict.categories.colProductsHint}>
                  {dict.categories.colProducts}
                  <span className="sr-only">
                    {" "}
                    {dict.categories.colProductsHint}
                  </span>
                </TableHead>
                <TableHead>{dict.categories.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableTree
                items={rows.map((r) => ({
                  ...r.item,
                  disabled: isLocked || reorder.isPending || moveState !== null,
                }))}
                maxDepth={MAX_TREE_LEVELS}
                disabled={isLocked || reorder.isPending || moveState !== null}
                renderRow={renderRow}
                onMove={handlePointerMove}
                announcements={pointerAnnouncements(items)}
              />
            </TableBody>
          </Table>
        </div>
      )}

      <CategoryMoveToDialog
        categoryId={moveToId}
        onOpenChange={(open) => {
          if (!open) setMoveToId(null);
        }}
        onMove={(next, movingId, options) =>
          reorder.move(next, movingId, options)
        }
      />
    </div>
  );
}

/* ──────────────────────────────── the row ───────────────────────────────── */

interface CategoryTreeRowProps {
  id: string;
  name: string;
  slug: string;
  /** ACTIVE products filed directly on this category. */
  productCount: number;
  /** ACTIVE products in this category AND its whole subtree (TASK-408). */
  subtreeProductCount: number;
  /**
   * Name of the nearest DEACTIVATED ancestor, when this (active) category is
   * hidden from the storefront by it — `undefined` when the row is visible or
   * deactivated in its own right (TASK-408).
   */
  hiddenByParent?: string;
  isActive: boolean;
  level: number;
  posinset: number;
  setsize: number;
  ariaExpanded: boolean | undefined;
  descendantCount: number;
  matched: boolean;
  search: string;
  grabbed: boolean;
  illegal: boolean;
  conflict: boolean;
  isOwner: boolean;
  locked: boolean;
  items: TreeItem[];
  reorder: CategoryTreeReorderApi;
  selected: boolean;
  selectDisabled: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLTableRowElement>) => void;
  onBlur: (event: ReactFocusEvent<HTMLTableRowElement>) => void;
  onFocusRow: () => void;
  onMoveTo: (id: string) => void;
  registerRef: (node: HTMLTableRowElement | null) => void;
  style: React.CSSProperties;
  handleProps: SortableTreeRowRenderProps["handleProps"];
}

function CategoryTreeRow({
  id,
  name,
  slug,
  productCount,
  subtreeProductCount,
  hiddenByParent,
  isActive,
  level,
  posinset,
  setsize,
  ariaExpanded,
  descendantCount,
  matched,
  search,
  grabbed,
  illegal,
  conflict,
  isOwner,
  locked,
  items,
  reorder,
  selected,
  selectDisabled,
  onToggleSelect,
  onToggleExpand,
  onKeyDown,
  onBlur,
  onFocusRow,
  onMoveTo,
  registerRef,
  style,
  handleProps,
}: CategoryTreeRowProps) {
  const statusRef = useRef<HTMLButtonElement>(null);

  /**
   * The APG `treegrid` Tab contract (§7.1/§7.2): from the focused row, `Tab`
   * steps through the row's OWN focusable controls (twisty → grip → status
   * toggle → actions menu, in DOM order) and then leaves the grid. That is
   * exactly native Tab behaviour once the controls of the row that owns the
   * roving `tabindex` are the only tabbable ones in the grid — every other row's
   * controls stay at `-1`, so Tab never walks the whole table.
   */
  const controlTabIndex = isOwner ? 0 : -1;
  const { toggle: toggleStatus, isPending: statusPending } =
    useCategoryStatusToggle({
      categoryId: id,
      isActive,
      name,
      descendantCount,
      onCancel: () => statusRef.current?.focus(),
    });

  return (
    <TableRow
      ref={registerRef}
      id={`cat-row-${id}`}
      role="row"
      aria-describedby={INSTRUCTIONS_SHORT_ID}
      aria-level={level}
      aria-posinset={posinset}
      aria-setsize={setsize}
      {...(ariaExpanded === undefined ? {} : { "aria-expanded": ariaExpanded })}
      {...(illegal ? { "aria-disabled": true } : {})}
      aria-selected={selected}
      tabIndex={isOwner ? 0 : -1}
      data-grabbed={grabbed}
      data-conflict={conflict || undefined}
      style={style}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onFocus={onFocusRow}
      className={
        grabbed
          ? "outline outline-2 outline-ring"
          : conflict
            ? "bg-accent"
            : !matched
              ? "opacity-60"
              : undefined
      }
    >
      <TableCell role="gridcell" className="w-10">
        {/* Owns its own `Space` (Radix), which the row's keydown handler ignores
            because `event.target !== event.currentTarget` — so picking a row up
            still works from the row itself. */}
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          disabled={selectDisabled}
          tabIndex={controlTabIndex}
          aria-label={b.selectRow(name)}
        />
      </TableCell>
      <TableCell role="gridcell">
        <div
          className="flex items-center gap-1"
          style={{ paddingInlineStart: (level - 1) * INDENT_PX }}
        >
          {ariaExpanded === undefined ? (
            <span aria-hidden="true" className="inline-block size-6" />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              tabIndex={controlTabIndex}
              className="size-6 p-0"
              aria-label={
                ariaExpanded ? t.collapseRow(name) : t.expandRow(name)
              }
              onClick={onToggleExpand}
            >
              <ChevronRight
                aria-hidden="true"
                className={ariaExpanded ? "size-4 rotate-90" : "size-4"}
              />
            </Button>
          )}
          <button
            type="button"
            {...handleProps}
            tabIndex={controlTabIndex}
            aria-label={dict.reorderTree.handleLabel(name)}
            aria-disabled={locked || undefined}
            className="inline-flex size-6 min-h-11 min-w-11 cursor-grab items-center justify-center text-muted-foreground md:min-h-0 md:min-w-0"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <span className="font-medium">
            {highlight(name, matched ? search : "")}
          </span>
        </div>
      </TableCell>
      <TableCell role="gridcell" hideOnMobile className="text-muted-foreground">
        {slug}
      </TableCell>
      {/*
        The subtree total leads, because that is the number the storefront page
        for this category actually lists (TASK-236 rolls a listing up over the
        whole subtree). The direct count follows in brackets, and only when the
        two differ — otherwise every leaf would carry a redundant echo of itself.
      */}
      <TableCell role="gridcell">
        {subtreeProductCount}
        {subtreeProductCount !== productCount ? (
          <span className="ml-1 text-muted-foreground">
            ({dict.categories.productsDirect(productCount)})
          </span>
        ) : null}
      </TableCell>
      <TableCell role="gridcell">
        <Button
          ref={statusRef}
          type="button"
          variant="ghost"
          size="sm"
          tabIndex={controlTabIndex}
          onClick={toggleStatus}
          disabled={statusPending}
          aria-label={
            isActive
              ? dict.statusToggle.categoryDeactivate
              : dict.statusToggle.categoryActivate
          }
        >
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? dict.common.active : dict.common.inactive}
          </Badge>
        </Button>
        {/*
          Outside the toggle button on purpose: it is a statement about an
          ANCESTOR, not something this row's control can change.
        */}
        {hiddenByParent ? (
          <Badge
            variant="outline"
            className="ml-1 align-middle"
            title={t.hiddenByParentHint(hiddenByParent)}
          >
            {t.hiddenByParent}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell role="gridcell" className="text-right">
        <span data-row-menu>
          <CategoryTreeRowActions
            items={items}
            categoryId={id}
            name={name}
            isActive={isActive}
            tabIndex={controlTabIndex}
            disabled={locked || reorder.isPending}
            onMove={reorder.move}
            onMoveTo={onMoveTo}
            onToggleStatus={toggleStatus}
          />
        </span>
      </TableCell>
    </TableRow>
  );
}

/** Substring highlight for search matches (§3.11). */
function highlight(text: string, needle: string): ReactNode {
  if (!needle) return text;
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-bold text-foreground">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}
