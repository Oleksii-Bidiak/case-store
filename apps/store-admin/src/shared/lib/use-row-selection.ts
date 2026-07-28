"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAnnouncer } from "@/shared/ui/live-announcer";

/**
 * useRowSelection — multi-select for a FLAT admin table (TASK-353).
 *
 * The mechanics are lifted from the category treegrid (TASK-293,
 * `widgets/category-tree/ui/admin-category-tree.tsx`), which proved them under a
 * screen-reader audit: toggle, `Shift+↑/↓` range from an ANCHOR, tri-state
 * header, and a selection that is always filtered against what is really on
 * screen. What is deliberately NOT carried over is everything tree-shaped —
 * collapsed nodes, `role="treegrid"`, drag anchors.
 *
 * ── The one behavioural difference that matters ──────────────────────────────
 * In the tree the whole dataset is client-side, so "selected but collapsed" is a
 * coherent state and the raw set could be acted on wholesale. A paginated table
 * has no such luxury: page 1's rows are not loaded while you are on page 2.
 *
 * So the raw set is KEPT across page changes (leaving a page must not silently
 * throw the selection away, and coming back restores it) but every value this
 * hook exposes — `selectedIds`, `selectedCount`, `headerChecked` — is derived
 * against `rowIds`, i.e. the current page. What the operator can see selected is
 * exactly what a bulk action will touch.
 *
 * That is the conservative reading, and it is the right one here because the
 * first consumers include a bulk REJECT that hard-deletes rows. An "8 selected"
 * badge covering rows on a page the operator cannot see would be a footgun on a
 * destructive action.
 */

export interface RowSelectionMessages {
  selected: (label: string, count: number) => string;
  deselected: (label: string, count: number) => string;
  selectedAll: (count: number) => string;
  cleared: string;
}

export interface UseRowSelectionOptions {
  /**
   * Ids of the rows currently rendered, **in render order**. Order is load
   * bearing: `Shift+↑/↓` walks this array, so it must match what the operator
   * sees, sorting and all.
   */
  rowIds: readonly string[];
  /** Human-readable name of a row, used only in announcements. */
  getLabel?: (id: string) => string;
  /** Announcement strings. Omit to stay silent (the announcer is a no-op anyway
   *  outside a `<LiveAnnouncer>`). */
  messages?: RowSelectionMessages;
}

export interface RowSelection {
  /** Selected ids that are actually on the current page. */
  selectedIds: Set<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;
  /** Toggle one row and make it the range anchor. */
  toggle: (id: string) => void;
  /**
   * Grow or shrink a contiguous range from the anchor, as a grid does — the
   * range IS the selection while the operator sweeps it.
   *
   * Returns the id the caller should move focus to, or `null` at the ends of
   * the list. Focus is returned rather than moved so the hook stays free of DOM.
   */
  extend: (fromId: string, delta: 1 | -1) => string | null;
  /** Tri-state state of the header checkbox, over the current page. */
  headerChecked: boolean | "indeterminate";
  /** Select every row on the page, or clear them if all are already selected. */
  toggleAll: () => void;
  /** Drop the whole selection, including rows remembered from other pages. */
  clear: () => void;
}

export function useRowSelection({
  rowIds,
  getLabel,
  messages,
}: UseRowSelectionOptions): RowSelection {
  const { announcePolite } = useAnnouncer();

  // Raw = everything ever picked, including rows now on another page. Never
  // filtered in place; see the header note.
  const [rawSelectedIds, setRawSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  // The row a Shift-range grows FROM — not the last row touched.
  const anchorRef = useRef<string | null>(null);

  const onPage = useMemo(() => new Set(rowIds), [rowIds]);

  const selectedIds = useMemo(
    () => new Set([...rawSelectedIds].filter((id) => onPage.has(id))),
    [onPage, rawSelectedIds],
  );

  const announce = useCallback(
    (message: string | undefined) => {
      if (message) announcePolite(message);
    },
    [announcePolite],
  );

  const label = useCallback((id: string) => getLabel?.(id) ?? id, [getLabel]);

  // NOTE on why none of these mutate through the functional `setState(prev => …)`
  // form: each one also announces, and an announcement is a side effect. React
  // may invoke a state updater more than once (StrictMode does so deliberately),
  // which would emit the message twice. So the next set is computed from the
  // current state — which is in the dependency array, so it is never stale — and
  // the updater is handed a finished value.
  const toggle = useCallback(
    (id: string) => {
      const next = new Set(rawSelectedIds);
      const selecting = !next.has(id);
      if (selecting) next.add(id);
      else next.delete(id);

      setRawSelectedIds(next);
      anchorRef.current = id;

      // Count what the operator will see: the new set, on this page only.
      const visible = [...next].filter((value) => onPage.has(value)).length;
      announce(
        selecting
          ? messages?.selected(label(id), visible)
          : messages?.deselected(label(id), visible),
      );
    },
    [announce, label, messages, onPage, rawSelectedIds],
  );

  const extend = useCallback(
    (fromId: string, delta: 1 | -1): string | null => {
      const index = rowIds.indexOf(fromId);
      if (index === -1) return null;

      const targetIndex = index + delta;
      const targetId = rowIds[targetIndex];
      if (targetId === undefined) return null;

      const anchorId = anchorRef.current ?? fromId;
      const anchorIndex = rowIds.indexOf(anchorId);
      const from = anchorIndex === -1 ? index : anchorIndex;
      const [lo, hi] =
        from <= targetIndex ? [from, targetIndex] : [targetIndex, from];

      const range = rowIds.slice(lo, hi + 1);
      // A sweep REPLACES the selection on this page. Rows remembered from other
      // pages are left alone — they are not part of what is being swept.
      const next = new Set([...rawSelectedIds].filter((id) => !onPage.has(id)));
      for (const id of range) next.add(id);

      setRawSelectedIds(next);
      anchorRef.current = rowIds[from];
      announce(messages?.selectedAll(range.length));

      return targetId;
    },
    [announce, messages, onPage, rawSelectedIds, rowIds],
  );

  const selectedCount = selectedIds.size;

  const headerChecked: boolean | "indeterminate" =
    rowIds.length > 0 && selectedCount === rowIds.length
      ? true
      : selectedCount > 0
        ? "indeterminate"
        : false;

  const toggleAll = useCallback(() => {
    const allSelected =
      rowIds.length > 0 && rowIds.every((id) => selectedIds.has(id));

    const next = new Set(rawSelectedIds);
    if (allSelected) for (const id of rowIds) next.delete(id);
    else for (const id of rowIds) next.add(id);
    setRawSelectedIds(next);

    announce(
      allSelected ? messages?.cleared : messages?.selectedAll(rowIds.length),
    );
  }, [announce, messages, rawSelectedIds, rowIds, selectedIds]);

  const clear = useCallback(() => {
    setRawSelectedIds(new Set());
    anchorRef.current = null;
    announce(messages?.cleared);
  }, [announce, messages]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  return {
    selectedIds,
    selectedCount,
    isSelected,
    toggle,
    extend,
    headerChecked,
    toggleAll,
    clear,
  };
}
