import { act, renderHook } from "@testing-library/react";
import {
  REGISTRY_SETTINGS_VERSION,
  createLocalStorageRegistrySettingsStore,
  defaultRegistrySettings,
  reconcileRegistrySettings,
  useRegistrySettings,
  type RegistryColumnDefault,
  type RegistrySettings,
  type RegistrySettingsStore,
} from "./registry-settings-store";

/**
 * The settings of a registry (column visibility/order/width, density, saved
 * views) persist per table. Until the per-user API exists (TASK-1044) they live
 * in localStorage behind an interface, so swapping the backend touches only
 * the adapter. These tests pin the two things that make that safe: a stored
 * blob is RECONCILED against the screen's current columns (a column added in a
 * release appears, a removed one drops), and a storage that throws (Safari
 * private mode, a full quota, a policy-disabled storage) never breaks the
 * table — it only stops remembering.
 */

const DEFAULTS: RegistryColumnDefault[] = [
  { id: "number", locked: true },
  { id: "createdAt" },
  { id: "customer", width: 220 },
  { id: "email", visible: false },
];

function stored(partial: Partial<RegistrySettings>): RegistrySettings {
  return {
    ...defaultRegistrySettings(DEFAULTS),
    ...partial,
  };
}

describe("defaultRegistrySettings", () => {
  it("lists every column in declared order with its default visibility and width", () => {
    const settings = defaultRegistrySettings(DEFAULTS);
    expect(settings.version).toBe(REGISTRY_SETTINGS_VERSION);
    expect(settings.columns).toEqual([
      { id: "number", visible: true },
      { id: "createdAt", visible: true },
      { id: "customer", visible: true, width: 220 },
      { id: "email", visible: false },
    ]);
    expect(settings.density).toBe("comfortable");
    expect(settings.views).toEqual([]);
    expect(settings.activeViewId).toBeNull();
  });
});

describe("reconcileRegistrySettings", () => {
  it("keeps the stored order, visibility and widths of known columns", () => {
    const result = reconcileRegistrySettings(
      stored({
        columns: [
          { id: "customer", visible: true, width: 300 },
          { id: "number", visible: true },
          { id: "email", visible: true },
          { id: "createdAt", visible: false },
        ],
        density: "compact",
      }),
      DEFAULTS,
    );
    expect(result.columns.map((c) => c.id)).toEqual([
      "customer",
      "number",
      "email",
      "createdAt",
    ]);
    expect(result.columns[0]).toEqual({
      id: "customer",
      visible: true,
      width: 300,
    });
    expect(result.columns[3].visible).toBe(false);
    expect(result.density).toBe("compact");
  });

  it("drops a column the screen no longer has and adds a new one at its default place", () => {
    const result = reconcileRegistrySettings(
      stored({
        columns: [
          { id: "customer", visible: true },
          { id: "legacy", visible: true },
          { id: "number", visible: true },
          // `createdAt` and `email` are missing — added in a later release.
        ],
      }),
      DEFAULTS,
    );
    expect(result.columns.map((c) => c.id)).toEqual([
      "customer",
      "number",
      "createdAt",
      "email",
    ]);
    // A newly appearing column takes its DEFAULT visibility.
    expect(result.columns.find((c) => c.id === "email")?.visible).toBe(false);
  });

  it("never lets a locked column be hidden", () => {
    const result = reconcileRegistrySettings(
      stored({ columns: [{ id: "number", visible: false }] }),
      DEFAULTS,
    );
    expect(result.columns.find((c) => c.id === "number")?.visible).toBe(true);
  });

  it("reconciles each saved view's columns, and forgets an active view that is gone", () => {
    const result = reconcileRegistrySettings(
      stored({
        views: [
          {
            id: "v1",
            name: "Без ТТН",
            query: "noTtn=1",
            columns: [{ id: "legacy", visible: true }],
            sort: null,
            density: "compact",
          },
        ],
        activeViewId: "v-deleted",
      }),
      DEFAULTS,
    );
    expect(result.views[0].columns.map((c) => c.id)).toEqual([
      "number",
      "createdAt",
      "customer",
      "email",
    ]);
    expect(result.activeViewId).toBeNull();
  });

  it.each([
    ["null", null],
    ["a string", "nope"],
    ["another version", { version: 999, columns: [] }],
    ["columns that are not an array", { version: 1, columns: "x" }],
  ])("falls back to the defaults for %s", (_name, blob) => {
    expect(reconcileRegistrySettings(blob, DEFAULTS)).toEqual(
      defaultRegistrySettings(DEFAULTS),
    );
  });

  it("ignores a width that is not a positive number", () => {
    const result = reconcileRegistrySettings(
      stored({
        columns: [
          { id: "number", visible: true, width: -5 },
          { id: "createdAt", visible: true, width: Number.NaN },
        ],
      }),
      DEFAULTS,
    );
    expect(result.columns[0].width).toBeUndefined();
    expect(result.columns[1].width).toBeUndefined();
  });
});

describe("localStorage adapter", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it("round-trips settings per table id", () => {
    const store = createLocalStorageRegistrySettingsStore();
    const settings = stored({ density: "compact" });
    store.save("orders", settings);
    expect(store.load("orders")).toEqual(settings);
    expect(store.load("products")).toBeNull();
  });

  it("returns null for a corrupted entry instead of throwing", () => {
    const store = createLocalStorageRegistrySettingsStore();
    window.localStorage.setItem("admin.registry.orders", "{not json at all");
    expect(store.load("orders")).toBeNull();
  });

  it("swallows a storage that throws on read and on write", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const store = createLocalStorageRegistrySettingsStore();
    expect(store.load("orders")).toBeNull();
    expect(() => store.save("orders", stored({}))).not.toThrow();
  });
});

describe("useRegistrySettings", () => {
  function memoryStore(initial?: RegistrySettings) {
    const saved: RegistrySettings[] = [];
    const store: RegistrySettingsStore = {
      load: jest.fn(() => initial ?? null),
      save: jest.fn((_id: string, s: RegistrySettings) => {
        saved.push(s);
      }),
    };
    return { store, saved };
  }

  it("starts from the stored settings, reconciled", () => {
    const { store } = memoryStore(stored({ density: "compact" }));
    const { result } = renderHook(() =>
      useRegistrySettings("orders", DEFAULTS, store),
    );
    expect(store.load).toHaveBeenCalledWith("orders");
    expect(result.current.settings.density).toBe("compact");
  });

  it("persists a change, and only after a change", () => {
    const { store, saved } = memoryStore();
    const { result } = renderHook(() =>
      useRegistrySettings("orders", DEFAULTS, store),
    );
    // Loading is not a change — nothing is written back on mount.
    expect(store.save).not.toHaveBeenCalled();

    act(() => result.current.toggleColumn("createdAt"));
    expect(saved.at(-1)?.columns[1]).toEqual({
      id: "createdAt",
      visible: false,
    });

    act(() => result.current.moveColumn("customer", -1));
    expect(saved.at(-1)?.columns.map((c) => c.id)).toEqual([
      "number",
      "customer",
      "createdAt",
      "email",
    ]);

    act(() => result.current.setWidth("customer", 300));
    act(() => result.current.setDensity("compact"));
    expect(saved.at(-1)?.columns[1].width).toBe(300);
    expect(saved.at(-1)?.density).toBe("compact");

    act(() => result.current.resetWidths());
    // Back to the screen's own default width, not to "no width".
    expect(saved.at(-1)?.columns[1].width).toBe(220);

    act(() => result.current.resetToDefaults());
    expect(saved.at(-1)?.columns).toEqual(
      defaultRegistrySettings(DEFAULTS).columns,
    );
  });

  it("refuses to hide a locked column", () => {
    const { store } = memoryStore();
    const { result } = renderHook(() =>
      useRegistrySettings("orders", DEFAULTS, store),
    );
    act(() => result.current.toggleColumn("number"));
    expect(result.current.settings.columns[0].visible).toBe(true);
  });

  it("saves, applies, renames and deletes a view", () => {
    const { store } = memoryStore();
    const { result } = renderHook(() =>
      useRegistrySettings("orders", DEFAULTS, store),
    );
    act(() => result.current.setDensity("compact"));
    let id = "";
    act(() => {
      id = result.current.saveView(
        "Без ТТН",
        "noTtn=1&sortBy=total&sortOrder=asc",
      );
    });
    const view = result.current.settings.views[0];
    expect(view).toMatchObject({
      id,
      name: "Без ТТН",
      query: "noTtn=1&sortBy=total&sortOrder=asc",
      sort: { by: "total", order: "asc" },
      density: "compact",
    });
    expect(result.current.settings.activeViewId).toBe(id);

    act(() => result.current.setDensity("comfortable"));
    let query: string | null = null;
    act(() => {
      query = result.current.applyView(id);
    });
    expect(query).toBe("noTtn=1&sortBy=total&sortOrder=asc");
    expect(result.current.settings.density).toBe("compact");

    act(() => result.current.renameView(id, "Без накладної"));
    expect(result.current.settings.views[0].name).toBe("Без накладної");

    act(() => result.current.deleteView(id));
    expect(result.current.settings.views).toEqual([]);
    expect(result.current.settings.activeViewId).toBeNull();
  });

  it("applying the built-in default view restores the default columns and an empty query", () => {
    const { store } = memoryStore();
    const { result } = renderHook(() =>
      useRegistrySettings("orders", DEFAULTS, store),
    );
    act(() => result.current.toggleColumn("customer"));
    let query: string | null = "x";
    act(() => {
      query = result.current.applyView(null);
    });
    expect(query).toBe("");
    expect(result.current.settings.columns).toEqual(
      defaultRegistrySettings(DEFAULTS).columns,
    );
    expect(result.current.settings.activeViewId).toBeNull();
  });
});
