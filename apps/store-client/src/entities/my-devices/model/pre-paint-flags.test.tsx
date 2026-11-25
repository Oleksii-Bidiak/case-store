import {
  DEVICE_FILTER_ATTR,
  DEVICE_FILTER_EXPIRED_ATTR,
  HAS_DEVICE_ATTR,
  PRE_PAINT_FILTER_TIMEOUT_MS,
  syncDeviceFlags,
} from "./device-flags";
import {
  MY_DEVICES_STORAGE_KEY,
  addDevice,
  clearMyDevices,
  replaceMyDevices,
  subscribeMyDevices,
  syncFlags,
} from "./my-devices-storage";
import { CATALOG_DEVICE_COOKIE } from "./catalog-device-cookie";
import {
  MY_DEVICES_SETTINGS_STORAGE_KEY,
  replaceMyDevicesSettings,
  updateMyDevicesSettings,
} from "./my-devices-settings";
import { PRE_PAINT_FLAGS_SCRIPT } from "./pre-paint-flags";

/** Runs the inline script the way the browser does — as plain global code. */
function runScript(): void {
  new Function(PRE_PAINT_FLAGS_SCRIPT)();
}

const html = () => document.documentElement;
const DEVICE = JSON.stringify([{ modelId: "a", slug: "iphone-15-pro" }]);

function resetFlags(): void {
  html().removeAttribute(HAS_DEVICE_ATTR);
  html().removeAttribute(DEVICE_FILTER_ATTR);
  html().removeAttribute(DEVICE_FILTER_EXPIRED_ATTR);
}

/** The `catalog-device` cookie's (decoded) value, or undefined (TASK-2564). */
function catalogCookie(): string | undefined {
  const prefix = `${CATALOG_DEVICE_COOKIE}=`;
  const pair = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : undefined;
}

function setCatalogCookie(value: string): void {
  document.cookie = `${CATALOG_DEVICE_COOKIE}=${encodeURIComponent(value)}; path=/`;
}

/** A device entry the store keeps (the cookie only counts valid ones). */
function saved(slug: string, lastUsedAt: number, modelId = `id-${slug}`) {
  return {
    modelId,
    slug,
    name: slug,
    brandName: "Apple",
    family: "iphone",
    lastUsedAt,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetFlags();
  document.cookie = `${CATALOG_DEVICE_COOKIE}=; path=/; max-age=0`;
});

describe("PRE_PAINT_FLAGS_SCRIPT (TASK-2421 / TASK-2074)", () => {
  it("flags a saved device and the default filter (no settings = defaults)", () => {
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
    runScript();
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("keeps the device flag but not the filter when «лише сумісне» is off", () => {
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
    window.localStorage.setItem(
      MY_DEVICES_SETTINGS_STORAGE_KEY,
      JSON.stringify({ compatOnly: false, compatScope: "all" }),
    );
    runScript();
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it.each([
    ["broken JSON", "{oops"],
    ["not an object", '"on"'],
    ["a non-boolean compatOnly", '{"compatOnly":"no"}'],
    ["compatOnly on", '{"compatOnly":true}'],
  ])("treats settings with %s as the defaults (filter on)", (_, raw) => {
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
    window.localStorage.setItem(MY_DEVICES_SETTINGS_STORAGE_KEY, raw);
    runScript();
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it.each([
    ["nothing is saved", null],
    ["the list is empty", "[]"],
    ["the value is not a list", '{"theme":"dark"}'],
    ["the JSON is broken", "{oops"],
  ])("sets no flag when %s", (_, raw) => {
    if (raw !== null) window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, raw);
    runScript();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("sets no flag for a list without a single usable entry (`[{}]`)", () => {
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      '[{},null,{"modelId":""}]',
    );
    runScript();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("expires the filter gate only once the page has loaded and the app still has not hydrated", () => {
    jest.useFakeTimers();
    try {
      window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
      runScript();
      // A slow network: the bundle is still downloading long after <head>
      // (TASK-2564) — the gate holds however long that takes.
      jest.advanceTimersByTime(PRE_PAINT_FILTER_TIMEOUT_MS * 10);
      expect(html()).not.toHaveAttribute(DEVICE_FILTER_EXPIRED_ATTR);
      window.dispatchEvent(new Event("load"));
      jest.advanceTimersByTime(PRE_PAINT_FILTER_TIMEOUT_MS - 1);
      expect(html()).not.toHaveAttribute(DEVICE_FILTER_EXPIRED_ATTR);
      jest.advanceTimersByTime(1);
      expect(html()).toHaveAttribute(DEVICE_FILTER_EXPIRED_ATTR);
    } finally {
      jest.useRealTimers();
    }
  });

  it("arms no expiry when the filter does not apply", () => {
    const listen = jest.spyOn(window, "addEventListener");
    try {
      window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, DEVICE);
      window.localStorage.setItem(
        MY_DEVICES_SETTINGS_STORAGE_KEY,
        JSON.stringify({ compatOnly: false, compatScope: "all" }),
      );
      runScript();
      expect(listen).not.toHaveBeenCalledWith("load", expect.anything());
    } finally {
      listen.mockRestore();
    }
  });

  it("swallows a storage that throws (private mode) instead of erroring", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    expect(runScript).not.toThrow();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
    spy.mockRestore();
  });
});

describe("PRE_PAINT_FLAGS_SCRIPT — the catalog-device cookie (TASK-2564)", () => {
  it("writes the active device's slug (most recent first)", () => {
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      JSON.stringify([saved("iphone-13", 1), saved("iphone-15-pro", 5)]),
    );
    runScript();
    expect(catalogCookie()).toBe("iphone-15-pro");
  });

  it("writes every saved device for «для всіх моїх», capped at 20, one per model", () => {
    const list = Array.from({ length: 22 }, (_, i) => saved(`m-${i}`, 100 - i));
    // An older duplicate of the most recent model: the store keeps one.
    list.push(saved("m-0-old", 1, "id-m-0"));
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, JSON.stringify(list));
    window.localStorage.setItem(
      MY_DEVICES_SETTINGS_STORAGE_KEY,
      JSON.stringify({ compatOnly: true, compatScope: "all" }),
    );
    runScript();
    expect(catalogCookie()).toBe(
      Array.from({ length: 20 }, (_, i) => `m-${i}`).join(","),
    );
  });

  it.each([
    [
      "«лише сумісне» is off",
      [saved("iphone-15-pro", 1)],
      { compatOnly: false },
    ],
    ["nothing is saved", [], null],
    ["no entry is one the store keeps", [{ modelId: "a" }], null],
  ])("deletes the cookie when %s", (_, list, settings) => {
    setCatalogCookie("stale-model");
    window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, JSON.stringify(list));
    if (settings) {
      window.localStorage.setItem(
        MY_DEVICES_SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
    }
    runScript();
    expect(catalogCookie()).toBeUndefined();
  });
});

describe("syncDeviceFlags — the flags stay live after first paint", () => {
  afterEach(() => {
    clearMyDevices();
    replaceMyDevicesSettings(null);
  });

  it("follows the shopper's own edits of the list", () => {
    addDevice({
      modelId: "a",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      brandName: "Apple",
      family: "iphone",
    });
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).toHaveAttribute(DEVICE_FILTER_ATTR);

    clearMyDevices();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("follows the account's list (the server-replace path, TASK-1959)", () => {
    replaceMyDevices([
      {
        modelId: "a",
        slug: "iphone-15-pro",
        name: "iPhone 15 Pro",
        brandName: "Apple",
        family: "iphone",
        lastUsedAt: 1,
      },
    ]);
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);

    replaceMyDevices([]);
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
  });

  it("follows «лише сумісне» from the panel and from the account", () => {
    addDevice({
      modelId: "a",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      brandName: "Apple",
      family: "iphone",
    });

    updateMyDevicesSettings({ compatOnly: false });
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);

    replaceMyDevicesSettings({ compatOnly: true, compatScope: "active" });
    expect(html()).toHaveAttribute(DEVICE_FILTER_ATTR);

    // Settings alone never claim a device.
    clearMyDevices();
    updateMyDevicesSettings({ compatOnly: false });
    updateMyDevicesSettings({ compatOnly: true });
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("needs both halves for the filter flag", () => {
    syncDeviceFlags(false, true);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
    syncDeviceFlags(true, false);
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });

  it("keeps the catalog-device cookie in line with every store write (TASK-2564)", () => {
    addDevice({
      modelId: "a",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      brandName: "Apple",
      family: "iphone",
    });
    expect(catalogCookie()).toBe("iphone-15-pro");

    addDevice({
      modelId: "b",
      slug: "iphone-13",
      name: "iPhone 13",
      brandName: "Apple",
      family: "iphone",
    });
    expect(catalogCookie()).toBe("iphone-13");

    updateMyDevicesSettings({ compatScope: "all" });
    expect(catalogCookie()).toBe("iphone-13,iphone-15-pro");

    updateMyDevicesSettings({ compatOnly: false });
    expect(catalogCookie()).toBeUndefined();

    // The account's settings and list (TASK-1959).
    replaceMyDevicesSettings({ compatOnly: true, compatScope: "active" });
    expect(catalogCookie()).toBe("iphone-13");
    replaceMyDevices([
      {
        modelId: "c",
        slug: "galaxy-s24",
        name: "Galaxy S24",
        brandName: "Samsung",
        family: null,
        lastUsedAt: 1,
      },
    ]);
    expect(catalogCookie()).toBe("galaxy-s24");

    clearMyDevices();
    expect(catalogCookie()).toBeUndefined();
  });

  it("follows another tab's write of the list (TASK-2564)", () => {
    const unsubscribe = subscribeMyDevices(() => {});
    try {
      window.localStorage.setItem(
        MY_DEVICES_STORAGE_KEY,
        JSON.stringify([saved("pixel-9", 1)]),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: MY_DEVICES_STORAGE_KEY }),
      );
      expect(catalogCookie()).toBe("pixel-9");
    } finally {
      unsubscribe();
    }
  });

  it("the first-mount resync clears flags the script set for an invalid entry", () => {
    // Has a modelId, so the script flags it; misses slug/name, so the store drops it.
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      JSON.stringify([{ modelId: "a" }]),
    );
    runScript();
    expect(html()).toHaveAttribute(HAS_DEVICE_ATTR);

    syncFlags();
    expect(html()).not.toHaveAttribute(HAS_DEVICE_ATTR);
    expect(html()).not.toHaveAttribute(DEVICE_FILTER_ATTR);
  });
});
