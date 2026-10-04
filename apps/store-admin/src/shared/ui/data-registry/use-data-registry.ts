"use client";

import * as React from "react";
import {
  localStorageRegistrySettingsStore,
  useRegistrySettings,
  type RegistryColumnDefault,
  type RegistrySettingsApi,
  type RegistrySettingsStore,
} from "./registry-settings-store";
import {
  useRegistrySelection,
  type RegistrySelection,
} from "./use-registry-selection";

/** Column floor when a column does not declare its own. */
export const DEFAULT_MIN_COLUMN_WIDTH = 64;
/** Width a column takes when neither the operator nor the screen set one. */
export const DEFAULT_COLUMN_WIDTH = 160;

/**
 * One column of a registry. A screen declares DATA, not markup: the header,
 * the cell, the optional per-page footer, and what the operator may do with it.
 */
export interface RegistryColumn<T> {
  id: string;
  /** Plain-text name: «Колонки», the resize handle's name, sort's aria-label. */
  label: string;
  /** What the header shows. May carry an info tooltip; defaults to `label`. */
  header?: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Totals row content for the rows on this page. */
  footer?: (rows: readonly T[]) => React.ReactNode;
  align?: "start" | "end";
  /** API sort key; makes the header a sort button with `aria-sort`. */
  sortField?: string;
  /** One sentence on what the column means — the sort button's description. */
  sortHint?: string;
  /** `false` when `header` draws its own tooltip for the hint. Default `true`. */
  sortHintAsTitle?: boolean;
  /** Default `true`. */
  resizable?: boolean;
  minWidth?: number;
  defaultWidth?: number;
  /** Default `true`. Hidden columns stay available in «Колонки». */
  defaultVisible?: boolean;
  /** Always shown — «№ (завжди)». */
  locked?: boolean;
  /**
   * Wrap this cell's content in the row's real link (`getRowHref`), so the row
   * has an anchor for middle-click, «open in new tab» and the keyboard. Put it
   * on the column that names the record (the number, the name).
   */
  rowLink?: boolean;
  /** Extra classes for this column's cells. */
  className?: string;
  /**
   * Hide below md when the screen has no card layout (and in the loading
   * skeleton), so a phone is not handed a dozen narrow columns.
   */
  hideOnMobile?: boolean;
}

export interface UseDataRegistryOptions<T> {
  /** Settings key — one per screen («orders», «products»…). */
  tableId: string;
  columns: readonly RegistryColumn<T>[];
  /** The rows of the CURRENT page. */
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Where the settings live. Defaults to this browser's localStorage. */
  store?: RegistrySettingsStore;
  /** Selection is dropped whenever this changes (e.g. the filter query). */
  selectionResetKey?: string;
}

export interface DataRegistryController<T> {
  tableId: string;
  /** Every declared column. */
  columns: readonly RegistryColumn<T>[];
  /** The visible ones, in the operator's order. */
  visibleColumns: readonly RegistryColumn<T>[];
  /** Ids of {@link visibleColumns} — what an export writes, in this order. */
  visibleColumnIds: string[];
  /** Effective pixel width per visible column id. */
  widths: Readonly<Record<string, number>>;
  rows: readonly T[];
  getRowId: (row: T) => string;
  settings: RegistrySettingsApi;
  selection: RegistrySelection;
}

/**
 * The registry's state for one screen: persisted settings + the selection.
 * Returned to the screen (it needs the selected ids for bulk actions and the
 * visible column order for exports) and handed to `<DataRegistry>` whole.
 */
export function useDataRegistry<T>({
  tableId,
  columns,
  rows,
  getRowId,
  store = localStorageRegistrySettingsStore,
  selectionResetKey,
}: UseDataRegistryOptions<T>): DataRegistryController<T> {
  const defaults = React.useMemo<RegistryColumnDefault[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        ...(column.defaultVisible === false ? { visible: false } : {}),
        ...(column.locked ? { locked: true } : {}),
        ...(column.defaultWidth !== undefined
          ? { width: column.defaultWidth }
          : {}),
      })),
    [columns],
  );
  const settings = useRegistrySettings(tableId, defaults, store);

  const byId = React.useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  const { visibleColumns, widths } = React.useMemo(() => {
    const visible: RegistryColumn<T>[] = [];
    const width: Record<string, number> = {};
    for (const setting of settings.settings.columns) {
      const column = byId.get(setting.id);
      if (!column || !setting.visible) continue;
      visible.push(column);
      const floor = column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
      width[column.id] = Math.max(
        floor,
        setting.width ?? column.defaultWidth ?? DEFAULT_COLUMN_WIDTH,
      );
    }
    return { visibleColumns: visible, widths: width };
  }, [byId, settings.settings.columns]);

  const rowIds = React.useMemo(() => rows.map(getRowId), [getRowId, rows]);
  const selection = useRegistrySelection({
    rowIds,
    resetKey: selectionResetKey,
  });

  return {
    tableId,
    columns,
    visibleColumns,
    visibleColumnIds: visibleColumns.map((column) => column.id),
    widths,
    rows,
    getRowId,
    settings,
    selection,
  };
}
