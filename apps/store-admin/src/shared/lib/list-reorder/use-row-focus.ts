"use client";

/**
 * Row-focus plumbing for a sortable grid (TASK-295).
 *
 * It exists as its OWN hook because of an ordering knot: the reorder lifecycle
 * needs an `onFocusRow` callback (it re-focuses the moved row on a rejection or a
 * 409 recovery), and the grid that owns the row nodes needs the lifecycle. A hook
 * cannot depend on itself, so the focus map is hoisted above both and handed to
 * each — `useRowFocus()` first, then the lifecycle, then the grid.
 *
 * Focus follows the ROW, never the position (§7.5): after any render that moved a
 * row (a preview step, a commit, a refetch) the requested row is re-focused from
 * a layout effect, so focus never lands on whatever now occupies the old slot.
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react";

export interface RowFocusApi {
  /** The row the roving `tabindex` follows. */
  focusedId: string | null;
  /** The row's `onFocus` handler owns this — it never MOVES focus itself. */
  setFocusedId: (id: string) => void;
  /** Focus a row NOW (and after the next render, if it is re-created). */
  focusRow: (id: string) => void;
  /** Focus a row AFTER the next render (used by the in-progress move preview). */
  requestFocus: (id: string) => void;
  /** The row's ref callback — compose it with dnd-kit's `setNodeRef`. */
  registerRow: (id: string) => (node: HTMLTableRowElement | null) => void;
  getRow: (id: string) => HTMLTableRowElement | null | undefined;
}

export function useRowFocus(): RowFocusApi {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement | null>());
  const wantFocusRef = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const registerRow = useCallback(
    (id: string) => (node: HTMLTableRowElement | null) => {
      rowRefs.current.set(id, node);
    },
    [],
  );

  const getRow = useCallback((id: string) => rowRefs.current.get(id), []);

  const requestFocus = useCallback((id: string) => {
    wantFocusRef.current = id;
  }, []);

  const focusRow = useCallback((id: string) => {
    setFocusedId(id);
    wantFocusRef.current = id;
    // Focus imperatively too: on the mutation paths (commit / rollback / 409) the
    // row is already mounted and no re-render is guaranteed to follow.
    rowRefs.current.get(id)?.focus();
  }, []);

  useLayoutEffect(() => {
    const want = wantFocusRef.current;
    if (!want) return;
    wantFocusRef.current = null;
    rowRefs.current.get(want)?.focus();
  });

  return {
    focusedId,
    setFocusedId,
    focusRow,
    requestFocus,
    registerRow,
    getRow,
  };
}
