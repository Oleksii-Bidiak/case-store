"use client";

/**
 * Per-table registry settings: column visibility / order / width, density and
 * saved views (wave 198, TASK-1043).
 *
 * ── Why an interface and not just localStorage ──────────────────────────────
 * The owner wants these to follow the USER, across computers (TASK-1044). That
 * API does not exist yet, so today's backend is the browser. Everything above
 * {@link RegistrySettingsStore} — the hook, the menus, the table — talks to the
 * interface only, so moving to the server is a new adapter and one default
 * swapped here. The footnote in «Колонки» says «у цьому браузері» for the same
 * reason; flip that string together with the adapter.
 *
 * ── Why reconcile ───────────────────────────────────────────────────────────
 * A stored blob outlives releases. A column added next month must appear (at
 * its declared place, with its declared visibility), a removed one must drop
 * silently, and a corrupted or foreign blob must degrade to the defaults — never
 * to an empty table. {@link reconcileRegistrySettings} is that single gate;
 * nothing reads a stored blob without passing through it.
 *
 * ── Storage failures are not errors ─────────────────────────────────────────
 * Safari private mode, a full quota or a policy-disabled storage throw on
 * access. The table must render exactly the same — it only stops remembering.
 */

import * as React from "react";

export const REGISTRY_SETTINGS_VERSION = 1;

export type RegistryDensity = "comfortable" | "compact";

export interface RegistryColumnSetting {
  id: string;
  visible: boolean;
  /** Pixel width; absent = the column's default. */
  width?: number;
}

export interface RegistryViewSort {
  by: string;
  order: "asc" | "desc";
}

/** A saved view = filters (the URL query) + columns + widths + sort + density. */
export interface RegistryView {
  id: string;
  name: string;
  /** Query string WITHOUT `?` and without `page`. Carries the sort too. */
  query: string;
  columns: RegistryColumnSetting[];
  sort: RegistryViewSort | null;
  density: RegistryDensity;
}

export interface RegistrySettings {
  version: typeof REGISTRY_SETTINGS_VERSION;
  /** Every known column, in display order. */
  columns: RegistryColumnSetting[];
  density: RegistryDensity;
  views: RegistryView[];
  /** `null` = the screen's built-in default view. */
  activeViewId: string | null;
}

export interface RegistrySettingsStore {
  load(tableId: string): RegistrySettings | null;
  save(tableId: string, settings: RegistrySettings): void;
}

/** What a screen declares about a column — the input to defaults and reconcile. */
export interface RegistryColumnDefault {
  id: string;
  /** Default `true`. */
  visible?: boolean;
  /** Always visible; the «Колонки» checkbox is checked and disabled. */
  locked?: boolean;
  width?: number;
}

const STORAGE_PREFIX = "admin.registry.";

/** localStorage adapter. Every access is guarded — see the header. */
export function createLocalStorageRegistrySettingsStore(
  prefix = STORAGE_PREFIX,
): RegistrySettingsStore {
  const storage = (): Storage | null => {
    try {
      return typeof window === "undefined" ? null : window.localStorage;
    } catch {
      return null;
    }
  };
  return {
    load(tableId) {
      try {
        const raw = storage()?.getItem(prefix + tableId);
        if (!raw) return null;
        return JSON.parse(raw) as RegistrySettings;
      } catch {
        return null;
      }
    },
    save(tableId, settings) {
      try {
        storage()?.setItem(prefix + tableId, JSON.stringify(settings));
      } catch {
        // Quota, private mode, disabled storage — keep working, stop remembering.
      }
    },
  };
}

export const localStorageRegistrySettingsStore =
  createLocalStorageRegistrySettingsStore();

function defaultColumns(
  defaults: readonly RegistryColumnDefault[],
): RegistryColumnSetting[] {
  return defaults.map((column) => ({
    id: column.id,
    visible: column.locked ? true : (column.visible ?? true),
    ...(column.width !== undefined ? { width: column.width } : {}),
  }));
}

export function defaultRegistrySettings(
  defaults: readonly RegistryColumnDefault[],
): RegistrySettings {
  return {
    version: REGISTRY_SETTINGS_VERSION,
    columns: defaultColumns(defaults),
    density: "comfortable",
    views: [],
    activeViewId: null,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validWidth = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;

const validDensity = (value: unknown): RegistryDensity =>
  value === "compact" ? "compact" : "comfortable";

/**
 * Stored columns against the screen's current ones: stored order and state for
 * the ids that still exist, unknown ids dropped, new ids inserted after the
 * nearest declared predecessor that is already placed.
 */
function reconcileColumns(
  stored: unknown,
  defaults: readonly RegistryColumnDefault[],
): RegistryColumnSetting[] {
  const fallback = defaultColumns(defaults);
  if (!Array.isArray(stored)) return fallback;

  const declared = new Map(defaults.map((column) => [column.id, column]));
  const result: RegistryColumnSetting[] = [];
  const seen = new Set<string>();

  for (const entry of stored) {
    if (!isRecord(entry) || typeof entry.id !== "string") continue;
    const column = declared.get(entry.id);
    if (!column || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const width = validWidth(entry.width) ?? column.width;
    result.push({
      id: entry.id,
      visible: column.locked ? true : entry.visible !== false,
      ...(width !== undefined ? { width } : {}),
    });
  }

  fallback.forEach((column, index) => {
    if (seen.has(column.id)) return;
    // After every column declared before it, wherever the operator moved
    // them: a new column never appears ahead of one it was declared after.
    let insertAt = 0;
    for (let i = 0; i < index; i += 1) {
      const at = result.findIndex((c) => c.id === fallback[i].id);
      if (at !== -1) insertAt = Math.max(insertAt, at + 1);
    }
    result.splice(insertAt, 0, column);
    seen.add(column.id);
  });

  return result;
}

function reconcileView(
  value: unknown,
  defaults: readonly RegistryColumnDefault[],
): RegistryView | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const sort: RegistryViewSort | null =
    isRecord(value.sort) &&
    typeof value.sort.by === "string" &&
    (value.sort.order === "asc" || value.sort.order === "desc")
      ? { by: value.sort.by, order: value.sort.order }
      : null;
  return {
    id: value.id,
    name: value.name,
    query: typeof value.query === "string" ? value.query : "",
    columns: reconcileColumns(value.columns, defaults),
    sort,
    density: validDensity(value.density),
  };
}

/** The single gate between a stored blob and the screen. See the header. */
export function reconcileRegistrySettings(
  stored: unknown,
  defaults: readonly RegistryColumnDefault[],
): RegistrySettings {
  if (
    !isRecord(stored) ||
    stored.version !== REGISTRY_SETTINGS_VERSION ||
    !Array.isArray(stored.columns)
  ) {
    return defaultRegistrySettings(defaults);
  }
  const views = Array.isArray(stored.views)
    ? stored.views
        .map((view) => reconcileView(view, defaults))
        .filter((view): view is RegistryView => view !== null)
    : [];
  const activeViewId =
    typeof stored.activeViewId === "string" &&
    views.some((view) => view.id === stored.activeViewId)
      ? stored.activeViewId
      : null;
  return {
    version: REGISTRY_SETTINGS_VERSION,
    columns: reconcileColumns(stored.columns, defaults),
    density: validDensity(stored.density),
    views,
    activeViewId,
  };
}

/** `sortBy`/`sortOrder` read out of a view's query. */
function sortFromQuery(query: string): RegistryViewSort | null {
  const params = new URLSearchParams(query);
  const by = params.get("sortBy");
  const order = params.get("sortOrder");
  if (!by) return null;
  return { by, order: order === "asc" ? "asc" : "desc" };
}

function newViewId(): string {
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RegistrySettingsApi {
  settings: RegistrySettings;
  /** Show/hide one column. A locked column is refused silently. */
  toggleColumn: (id: string) => void;
  /** Move a column by `delta` places in the display order. */
  moveColumn: (id: string, delta: number) => void;
  /** Put `id` at the index of `targetId` (drag and drop). */
  moveColumnTo: (id: string, targetId: string) => void;
  setWidth: (id: string, width: number) => void;
  /** Every width back to the screen's own default. */
  resetWidths: () => void;
  /** Columns, widths and density back to the defaults. Views are kept. */
  resetToDefaults: () => void;
  setDensity: (density: RegistryDensity) => void;
  /** Save the current columns + density with `query`; returns the new id. */
  saveView: (name: string, query: string) => string;
  renameView: (id: string, name: string) => void;
  deleteView: (id: string) => void;
  /**
   * Adopt a view's columns and density and mark it active; returns the query
   * the caller should navigate to. `null` = the built-in default view, whose
   * query is "".
   */
  applyView: (id: string | null) => string | null;
}

/**
 * The registry's settings for one table, loaded once after mount (the server
 * render cannot see localStorage, so a load during render would mismatch the
 * hydration) and written back after every CHANGE — never after the load.
 */
export function useRegistrySettings(
  tableId: string,
  defaults: readonly RegistryColumnDefault[],
  store: RegistrySettingsStore = localStorageRegistrySettingsStore,
): RegistrySettingsApi {
  // Callers usually declare columns inline; key the defaults by content so a
  // re-render does not look like a new screen.
  const defaultsKey = JSON.stringify(defaults);
  const stableDefaults = React.useMemo<readonly RegistryColumnDefault[]>(
    () => JSON.parse(defaultsKey) as RegistryColumnDefault[],
    [defaultsKey],
  );

  const [settings, setSettings] = React.useState<RegistrySettings>(() =>
    defaultRegistrySettings(stableDefaults),
  );
  const dirtyRef = React.useRef(false);
  const storeRef = React.useRef(store);
  React.useEffect(() => {
    storeRef.current = store;
  });

  React.useEffect(() => {
    const loaded = storeRef.current.load(tableId);
    if (loaded) {
      dirtyRef.current = false;
      setSettings(reconcileRegistrySettings(loaded, stableDefaults));
    }
  }, [tableId, stableDefaults]);

  React.useEffect(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    storeRef.current.save(tableId, settings);
  }, [settings, tableId]);

  const change = React.useCallback(
    (update: (current: RegistrySettings) => RegistrySettings) => {
      setSettings((current) => {
        const next = update(current);
        if (next !== current) dirtyRef.current = true;
        return next;
      });
    },
    [],
  );

  const locked = React.useMemo(
    () =>
      new Set(
        stableDefaults.filter((c) => c.locked).map((column) => column.id),
      ),
    [stableDefaults],
  );

  // Latest settings for the two methods that must RETURN something computed
  // from them (an updater cannot hand a value back out).
  const settingsRef = React.useRef(settings);
  React.useEffect(() => {
    settingsRef.current = settings;
  });

  const toggleColumn = React.useCallback(
    (id: string) => {
      if (locked.has(id)) return;
      change((current) => ({
        ...current,
        columns: current.columns.map((column) =>
          column.id === id ? { ...column, visible: !column.visible } : column,
        ),
      }));
    },
    [change, locked],
  );

  const moveColumn = React.useCallback(
    (id: string, delta: number) => {
      change((current) => {
        const from = current.columns.findIndex((column) => column.id === id);
        const to = Math.min(
          Math.max(from + delta, 0),
          current.columns.length - 1,
        );
        if (from === -1 || from === to) return current;
        const columns = [...current.columns];
        const [moved] = columns.splice(from, 1);
        columns.splice(to, 0, moved);
        return { ...current, columns };
      });
    },
    [change],
  );

  const moveColumnTo = React.useCallback(
    (id: string, targetId: string) => {
      change((current) => {
        const from = current.columns.findIndex((column) => column.id === id);
        const to = current.columns.findIndex(
          (column) => column.id === targetId,
        );
        if (from === -1 || to === -1 || from === to) return current;
        const columns = [...current.columns];
        const [moved] = columns.splice(from, 1);
        columns.splice(to, 0, moved);
        return { ...current, columns };
      });
    },
    [change],
  );

  const setWidth = React.useCallback(
    (id: string, width: number) => {
      const next = validWidth(width);
      if (next === undefined) return;
      change((current) => ({
        ...current,
        columns: current.columns.map((column) =>
          column.id === id ? { ...column, width: next } : column,
        ),
      }));
    },
    [change],
  );

  const resetWidths = React.useCallback(() => {
    const declared = new Map(stableDefaults.map((c) => [c.id, c.width]));
    change((current) => ({
      ...current,
      columns: current.columns.map(({ id, visible }) => {
        const width = declared.get(id);
        return { id, visible, ...(width !== undefined ? { width } : {}) };
      }),
    }));
  }, [change, stableDefaults]);

  const resetToDefaults = React.useCallback(() => {
    change((current) => ({
      ...defaultRegistrySettings(stableDefaults),
      views: current.views,
    }));
  }, [change, stableDefaults]);

  const setDensity = React.useCallback(
    (density: RegistryDensity) => {
      change((current) =>
        current.density === density ? current : { ...current, density },
      );
    },
    [change],
  );

  const saveView = React.useCallback(
    (name: string, query: string) => {
      const id = newViewId();
      change((current) => ({
        ...current,
        views: [
          ...current.views,
          {
            id,
            name: name.trim(),
            query,
            columns: current.columns,
            sort: sortFromQuery(query),
            density: current.density,
          },
        ],
        activeViewId: id,
      }));
      return id;
    },
    [change],
  );

  const renameView = React.useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      change((current) => ({
        ...current,
        views: current.views.map((view) =>
          view.id === id ? { ...view, name: trimmed } : view,
        ),
      }));
    },
    [change],
  );

  const deleteView = React.useCallback(
    (id: string) => {
      change((current) => ({
        ...current,
        views: current.views.filter((view) => view.id !== id),
        activeViewId: current.activeViewId === id ? null : current.activeViewId,
      }));
    },
    [change],
  );

  const applyView = React.useCallback(
    (id: string | null): string | null => {
      if (id === null) {
        change((current) => ({
          ...current,
          columns: defaultColumns(stableDefaults),
          density: "comfortable",
          activeViewId: null,
        }));
        return "";
      }
      const view = settingsRef.current.views.find((v) => v.id === id);
      if (!view) return null;
      change((current) => ({
        ...current,
        columns: reconcileColumns(view.columns, stableDefaults),
        density: view.density,
        activeViewId: id,
      }));
      return view.query;
    },
    [change, stableDefaults],
  );

  return {
    settings,
    toggleColumn,
    moveColumn,
    moveColumnTo,
    setWidth,
    resetWidths,
    resetToDefaults,
    setDensity,
    saveView,
    renameView,
    deleteView,
    applyView,
  };
}
