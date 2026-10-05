"use client";

import * as React from "react";

/**
 * Selection for the registry (wave 198): a set of ids that SURVIVES paging.
 *
 * This deliberately differs from `shared/lib/use-row-selection`, which counts
 * only the current page (TASK-353, written when the first consumer was a bulk
 * hard-delete of reviews). The owner's registry keeps the selection while the
 * operator pages — «Вибір зберігається, коли гортаєте сторінки» is printed in
 * the bulk bar for exactly that reason — so the count shown and the ids a bulk
 * action receives are the WHOLE set, and the bar says so in words. The header
 * checkbox stays per page: it answers «is this page in the selection?».
 *
 * `resetKey`: when it changes (a new filter or search), the selection is
 * dropped — ids picked under one filter are not what the operator thinks they
 * are acting on under another.
 */

export interface UseRegistrySelectionOptions {
  /** Ids of the rows on the CURRENT page, in render order. */
  rowIds: readonly string[];
  /** Clears the selection whenever it changes. */
  resetKey?: string;
}

export interface RegistrySelection {
  /** Every selected id, on this page or not. */
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Tri-state over the current page. */
  pageChecked: boolean | "indeterminate";
  /** Add the whole page, or remove it when it is entirely selected already. */
  togglePage: () => void;
  clear: () => void;
}

export function useRegistrySelection({
  rowIds,
  resetKey,
}: UseRegistrySelectionOptions): RegistrySelection {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Render-time guard (forms.md rule 1a) rather than an effect: the stale
  // selection must not survive even one paint under the new filter.
  const [syncedKey, setSyncedKey] = React.useState(resetKey);
  if (resetKey !== syncedKey) {
    setSyncedKey(resetKey);
    setSelected(new Set());
  }

  const toggle = React.useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onPage = rowIds.filter((id) => selected.has(id)).length;
  const pageChecked: boolean | "indeterminate" =
    rowIds.length > 0 && onPage === rowIds.length
      ? true
      : onPage > 0
        ? "indeterminate"
        : false;

  const togglePage = React.useCallback(() => {
    setSelected((current) => {
      const next = new Set(current);
      const all = rowIds.length > 0 && rowIds.every((id) => current.has(id));
      for (const id of rowIds) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [rowIds]);

  const clear = React.useCallback(() => setSelected(new Set()), []);

  const isSelected = React.useCallback(
    (id: string) => selected.has(id),
    [selected],
  );

  return {
    selectedIds: selected,
    selectedCount: selected.size,
    isSelected,
    toggle,
    pageChecked,
    togglePage,
    clear,
  };
}
